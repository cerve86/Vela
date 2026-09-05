-- Activities from outside the app, and two ways out of it.
--
-- Three things arrive together because they share one idea: training that happens away
-- from the Vela app still belongs in the record. A run recorded on Strava is a session;
-- a planned session ticked off from a calendar entry is a session. What changes is who
-- wrote the row, which is what `logged_via` records.
--
-- Everything a client's device or a coach reads goes through row level security as her.
-- The only tables the service role touches are the ones that hold credentials — Strava
-- tokens, calendar feed tokens — because those are resolved before there is a session to
-- be filtered by. Domain rows are never written with the service role.

-- ---------------------------------------------------------------------------
-- Sessions: who logged it, and let the client add her own
-- ---------------------------------------------------------------------------

alter table public.sessions
add column if not exists logged_via text not null default 'app'
  check (logged_via in ('app', 'strava', 'calendar'));

comment on column public.sessions.logged_via is 'Where the completion came from: the app''s logger, a Strava activity, or the "mark as done" link in a calendar entry.';

-- The schema always allowed a session with no programme day ("an ad-hoc session the
-- client logs herself"); the policy never did. A Strava run with nothing planned that
-- day is exactly that session.
create policy sessions_client_insert on public.sessions for insert
with
  check (public.is_the_client (client_id));

-- ---------------------------------------------------------------------------
-- Activities: the recorded workout behind a session
-- ---------------------------------------------------------------------------

create table public.activities (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  /** The session this activity completed or created. Null if the session was deleted. */
  session_id uuid references public.sessions (id) on delete set null,
  source text not null check (source in ('strava')),
  external_id text not null,
  sport_type text not null,
  name text not null,
  started_at timestamptz not null,
  /** The date as the athlete experienced it — a run at 23:30 in Rome is that day's run. */
  local_date date not null,
  elapsed_sec int not null check (elapsed_sec >= 0),
  moving_sec int not null check (moving_sec >= 0),
  distance_m numeric(10, 1),
  elevation_gain_m numeric(8, 1),
  avg_hr numeric(5, 1),
  max_hr numeric(5, 1),
  /** As the source reports it. For Strava runs that is one foot's revolutions per minute. */
  avg_cadence numeric(6, 1),
  avg_watts numeric(7, 1),
  max_watts numeric(7, 1),
  weighted_watts numeric(7, 1),
  avg_speed_mps numeric(6, 3),
  calories numeric(7, 1),
  suffer_score numeric(6, 1),
  polyline text,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (source, external_id)
);

create index activities_client_started_idx on public.activities (client_id, started_at desc);

comment on table public.activities is 'Workouts recorded by another service and imported as sessions. Read by client and coach; written by the client''s own sync.';

alter table public.activities enable row level security;

create policy activities_client_all on public.activities for all using (public.is_the_client (client_id))
with
  check (public.is_the_client (client_id));

create policy activities_coach_read on public.activities for
select
  using (public.is_coach_of (client_id));

grant
select,
insert,
update,
delete on public.activities to authenticated;

-- ---------------------------------------------------------------------------
-- Strava: the link (visible) and the tokens (not)
-- ---------------------------------------------------------------------------

create table public.strava_links (
  client_id uuid primary key references public.clients (id) on delete cascade,
  /** Kept here so a webhook can act as her without reading the clients table. */
  profile_id uuid not null references auth.users (id) on delete cascade,
  athlete_id bigint not null unique,
  athlete_name text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text
);

alter table public.strava_links enable row level security;

create policy strava_links_client_read on public.strava_links for
select
  using (public.is_the_client (client_id));

create policy strava_links_client_delete on public.strava_links for delete using (public.is_the_client (client_id));

create policy strava_links_coach_read on public.strava_links for
select
  using (public.is_coach_of (client_id));

grant
select,
delete on public.strava_links to authenticated;

grant
select,
insert,
update,
delete on public.strava_links to service_role;

-- Tokens live apart from the link so that "is she connected" can be readable without
-- "here is her refresh token" being readable too. No policy, and the grant revoked:
-- this schema's default privileges hand every new table to authenticated, and RLS with
-- no policy would only make the table look empty rather than closed. The isolation test
-- asserts the refusal, not the emptiness.
create table public.strava_tokens (
  client_id uuid primary key references public.clients (id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text not null default ''
);

alter table public.strava_tokens enable row level security;

revoke all on public.strava_tokens
from
  authenticated;

grant
select,
insert,
update,
delete on public.strava_tokens to service_role;

-- ---------------------------------------------------------------------------
-- Calendar feeds: a subscription URL and a "mark as done" link that need no sign-in
-- ---------------------------------------------------------------------------

create table public.calendar_tokens (
  client_id uuid primary key references public.clients (id) on delete cascade,
  profile_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

comment on table public.calendar_tokens is 'The secret in a client''s calendar subscription URL. Reading the feed and marking a session done both resolve to a session for her and run through RLS.';

alter table public.calendar_tokens enable row level security;

create policy calendar_tokens_client_all on public.calendar_tokens for all using (public.is_the_client (client_id))
with
  check (public.is_the_client (client_id));

grant
select,
update,
delete on public.calendar_tokens to authenticated;

grant
select,
update on public.calendar_tokens to service_role;

/**
 * Her feed token, minted on first call and returned as it is thereafter.
 *
 * SECURITY DEFINER for the random bytes, not for reach: it only ever writes a row for
 * the caller's own client, and refuses anyone who is not a client.
 */
create or replace function public.ensure_calendar_token (p_rotate boolean default false) returns text language plpgsql security definer
set
  search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_client uuid;
  v_token text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select c.id into v_client from public.clients c where c.profile_id = v_user;
  if v_client is null then
    raise exception 'not a client' using errcode = '42501';
  end if;

  if not p_rotate then
    select t.token into v_token from public.calendar_tokens t
    where t.client_id = v_client and t.revoked_at is null;
    if v_token is not null then
      return v_token;
    end if;
  end if;

  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.calendar_tokens (client_id, profile_id, token)
  values (v_client, v_user, v_token)
  on conflict (client_id) do update
    set token = excluded.token, created_at = now(), revoked_at = null;

  return v_token;
end;
$$;

revoke all on function public.ensure_calendar_token (boolean) from public;

grant
execute on function public.ensure_calendar_token (boolean) to authenticated;
