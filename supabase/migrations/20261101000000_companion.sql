-- The companion: the athlete-facing web app in apps/companion, served at /companion.
--
-- It lives on the same backend as the Vela app, so nothing here creates a second athlete
-- list or a second login. A companion athlete is a Vela client, signed in with the same
-- Supabase account, and every table keys on clients.id exactly like the rest of the schema.
--
-- Additive only: new tables, one read function, and no change to any existing table or
-- policy. The companion's own standalone schema (an `athletes` table, its own `coaches`
-- and `is_coach()`) is deliberately NOT what lands here — Vela already has coaches and
-- clients, with is_coach_of / is_the_client as the access predicates.
--
-- What the companion reads from Vela rather than storing again: runs (activities),
-- planned sessions (sessions), HRV and resting HR (metrics), and the strength list (the
-- coach's priorities in her library, through companion_my_strength below). What it adds
-- is only what Vela does not hold: the morning readiness taps, the movement radar, the
-- intervals.icu id, and the coach's routes and Learn tiles.

-- ---------------------------------------------------------------------------
-- Per-client companion settings
-- ---------------------------------------------------------------------------

create table public.companion_profiles (
  client_id uuid primary key references public.clients (id) on delete cascade,
  /** Her intervals.icu athlete id. The coach sets it once the athlete accepts the coaching request. */
  intervals_icu_id text,
  /** Prefills the Fuel tab's resting-energy estimate. */
  weight_kg numeric(5, 1) check (weight_kg between 25 and 250),
  updated_at timestamptz not null default now()
);

alter table public.companion_profiles enable row level security;

create policy companion_profiles_client_read on public.companion_profiles for
select
  using (public.is_the_client (client_id));

create policy companion_profiles_coach on public.companion_profiles for all using (public.is_coach_of (client_id))
with
  check (public.is_coach_of (client_id));

grant select, insert, update, delete on public.companion_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Morning readiness — four taps, plus watch numbers when she has no synced ones
-- ---------------------------------------------------------------------------

create table public.companion_readiness (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  log_date date not null default current_date,
  /** 0 rough, 1 OK, 2 good. */
  sleep smallint check (sleep between 0 and 2),
  /** 0 heavy, 1 normal, 2 fresh. */
  legs smallint check (legs between 0 and 2),
  /** 0 low, 1 meh, 2 good. */
  energy smallint check (energy between 0 and 2),
  /** 0 hard, 1 moderate, 2 easy. */
  last_session smallint check (last_session between 0 and 2),
  hrv numeric(5, 1) check (hrv between 5 and 300),
  rhr smallint check (rhr between 25 and 150),
  created_at timestamptz not null default now(),
  unique (client_id, log_date)
);

comment on table public.companion_readiness is 'The companion''s morning check: four taps and optional manual HRV / resting HR. The verdict it shows is a suggestion; the coach confirms.';

alter table public.companion_readiness enable row level security;

create policy companion_readiness_client_all on public.companion_readiness for all using (public.is_the_client (client_id))
with
  check (public.is_the_client (client_id));

create policy companion_readiness_coach_read on public.companion_readiness for
select
  using (public.is_coach_of (client_id));

grant select, insert, update on public.companion_readiness to authenticated;

-- ---------------------------------------------------------------------------
-- Movement profile — the coach's 0–5 radar from a gait clip, re-scored at the taper
-- ---------------------------------------------------------------------------

create table public.companion_movement_profiles (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  assessed_at date not null default current_date,
  /** {"Foot & ankle": 3, "Lateral hip": 4, …}, 0–5 per domain. */
  scores jsonb not null check (jsonb_typeof(scores) = 'object'),
  /** One plain line under the radar: what to work on. */
  focus text,
  created_at timestamptz not null default now()
);

create index companion_movement_profiles_client_idx on public.companion_movement_profiles (client_id, assessed_at desc);

alter table public.companion_movement_profiles enable row level security;

-- The coach's assessment: she reads it, the coach writes it.
create policy companion_movement_client_read on public.companion_movement_profiles for
select
  using (public.is_the_client (client_id));

create policy companion_movement_coach on public.companion_movement_profiles for all using (public.is_coach_of (client_id))
with
  check (public.is_coach_of (client_id));

grant select, insert, update, delete on public.companion_movement_profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Routes and Learn tiles — the coach's own lists, shared with her clients
-- ---------------------------------------------------------------------------

/** True when the signed-in user is an active-or-invited client of this coach. */
create or replace function public.is_client_of_coach (p_coach uuid) returns boolean language sql stable security definer
set
  search_path = public as $$
  select exists (
    select 1 from public.clients c
    where c.coach_id = p_coach and c.profile_id = auth.uid() and c.status <> 'archived'
  );
$$;

revoke all on function public.is_client_of_coach (uuid) from public;

grant execute on function public.is_client_of_coach (uuid) to authenticated;

create table public.companion_routes (
  id uuid primary key default gen_random_uuid (),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  name text not null,
  distance_km numeric(5, 1),
  /** road | trail | mixed | track … */
  terrain text,
  start_point text,
  description text,
  strava_url text check (strava_url is null or strava_url ~ '^https://'),
  map_url text check (map_url is null or map_url ~ '^https://'),
  sort smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index companion_routes_coach_idx on public.companion_routes (coach_id, sort);

alter table public.companion_routes enable row level security;

create policy companion_routes_client_read on public.companion_routes for
select
  using (active and public.is_client_of_coach (coach_id));

create policy companion_routes_coach on public.companion_routes for all using (coach_id = auth.uid ())
with
  check (coach_id = auth.uid ());

grant select, insert, update, delete on public.companion_routes to authenticated;

create table public.companion_resources (
  id uuid primary key default gen_random_uuid (),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  title text not null,
  image_url text check (image_url is null or image_url ~ '^https://'),
  /** client = in the app only; public = also posted (Instagram). Methodology is never a tile. */
  audience text not null default 'client' check (audience in ('client', 'public')),
  link_url text check (link_url is null or link_url ~ '^https://'),
  blurb text,
  sort smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index companion_resources_coach_idx on public.companion_resources (coach_id, sort);

alter table public.companion_resources enable row level security;

create policy companion_resources_client_read on public.companion_resources for
select
  using (active and public.is_client_of_coach (coach_id));

create policy companion_resources_coach on public.companion_resources for all using (coach_id = auth.uid ())
with
  check (coach_id = auth.uid ());

grant select, insert, update, delete on public.companion_resources to authenticated;

-- ---------------------------------------------------------------------------
-- Strength — read from the coach's library, not copied into a second list
-- ---------------------------------------------------------------------------

/**
 * The signed-in client's strength list: the movements her coach marked for her in the
 * library. A priority is "focus" (what her analysis flagged); the rest of her set is
 * "race" (the running strength everyone needs).
 *
 * A gated movement whose gate the coach has not cleared for her is left out, as the app
 * leaves it out of a session — the coach decides when it is safe, not the list.
 */
create or replace function public.companion_my_strength () returns table (
  movement text,
  tag text,
  domain text,
  why text,
  cues text[],
  dose text,
  video_url text
) language sql stable security definer
set
  search_path = public as $$
  select
    e.name,
    case p.level when 'priority' then 'focus' else 'race' end,
    e.domain,
    e.why,
    e.cues,
    e.dose,
    e.video_url
  from public.clients c
  join public.client_exercise_priority p on p.client_id = c.id
  join public.exercises e on e.id = p.exercise_id
  where c.profile_id = auth.uid()
    and e.archived_at is null
    and e.gates <@ c.cleared_gates
  order by case p.level when 'priority' then 0 else 1 end, e.domain nulls last, e.name;
$$;

revoke all on function public.companion_my_strength () from public;

grant execute on function public.companion_my_strength () to authenticated;
