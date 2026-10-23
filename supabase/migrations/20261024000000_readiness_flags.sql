-- Phase 2 of the coaching-layer spec: readiness before the run, feedback after it,
-- weekly wellness, per-client gates, and flags that only the coach sees.
--
-- The design rule throughout: the system drafts and flags, the coach confirms, and
-- nothing clinical reaches a client automatically. So the flags are raised by the
-- database itself (a screen can forget to; a trigger cannot), they are readable by the
-- coach alone, and a hold below readiness 3 is a request the coach answers, not a swap
-- the app makes on its own.

-- Per-client gates, set by the coach.
alter table public.clients
  add column if not exists pf_gate boolean not null default false,
  add column if not exists pain_thresholds jsonb not null default '[]'::jsonb;

comment on column public.clients.pf_gate is
  'When true the client is asked the pelvic-floor question before each session; a yes holds impact work and flags the coach.';
comment on column public.clients.pain_thresholds is
  'Per-location ceilings, e.g. [{"location":"shin","max":3}]; a score above one flags the coach.';

-- What she reports around one session.
alter table public.sessions
  add column if not exists readiness_before smallint check (readiness_before between 0 and 10),
  add column if not exists pain_location text,
  add column if not exists pf_flag boolean,
  add column if not exists acute_symptom text,
  add column if not exists completion text check (completion in ('all', 'some', 'none')),
  add column if not exists adjusted_to text
    check (adjusted_to in ('reduced', 'gentle', 'low_impact', 'strength', 'as_planned')),
  add column if not exists adjusted_note text;

comment on column public.sessions.readiness_before is '0–10, 10 = fresh, tapped before the session. The gate.';
comment on column public.sessions.completion is 'Her own account after the session: all, some or none of it.';
comment on column public.sessions.adjusted_to is 'What today became: the automatic reduced version, or the coach''s answer to a hold.';

-- A session that exercise categories can be read from, for the pelvic-floor gate.
drop function if exists public.get_session_plan (uuid);

create function public.get_session_plan (p_session_id uuid) returns table (
  item_id uuid,
  exercise_id uuid,
  exercise_name text,
  cues text[],
  block text,
  sets integer,
  reps text,
  target_load_kg numeric,
  target_rpe numeric,
  tempo text,
  rest_sec integer,
  notes text,
  category text
) language plpgsql security definer
set
  search_path to 'public' as $$
declare
  v_client uuid;
begin
  select s.client_id into v_client from public.sessions s where s.id = p_session_id;
  if v_client is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if not (public.is_the_client(v_client) or public.is_coach_of(v_client)) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  return query
  select
    i.id, e.id, e.name, e.cues, i.block, i.sets, i.reps,
    i.target_load_kg, i.target_rpe, i.tempo, i.rest_sec, i.notes, e.category::text
  from public.sessions s
  join public.program_items i on i.program_day_id = s.program_day_id
  join public.exercises e on e.id = i.exercise_id
  where s.id = p_session_id
  order by i.block, i.order_index;
end;
$$;

revoke all on function public.get_session_plan (uuid) from public;

grant
execute on function public.get_session_plan (uuid) to authenticated;

-- Weekly wellness: four items, 1–5.
create table if not exists public.wellness_checks (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  week_start date not null,
  sleep smallint not null check (sleep between 1 and 5),
  fatigue smallint not null check (fatigue between 1 and 5),
  soreness smallint not null check (soreness between 1 and 5),
  stress smallint not null check (stress between 1 and 5),
  created_at timestamptz not null default now(),
  unique (client_id, week_start)
);

alter table public.wellness_checks enable row level security;

create policy wellness_client_all on public.wellness_checks for all using (public.is_the_client (client_id))
with
  check (public.is_the_client (client_id));

create policy wellness_coach_read on public.wellness_checks for
select
  using (public.is_coach_of (client_id));

grant select, insert, update on public.wellness_checks to authenticated;

-- Flags: for the coach, never the client.
create table if not exists public.coach_flags (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  coach_id uuid not null references public.coaches (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  kind text not null check (kind in ('readiness_low', 'acute', 'pain', 'pelvic_floor', 'hold')),
  detail text not null,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  resolved_at timestamptz,
  resolution text
);

-- One open flag per kind per session (or per client, for the persistence rule).
create unique index if not exists coach_flags_open_once on public.coach_flags (
  client_id,
  kind,
  coalesce(session_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
where
  resolved_at is null;

create index if not exists coach_flags_open on public.coach_flags (coach_id)
where
  resolved_at is null;

alter table public.coach_flags enable row level security;

create policy coach_flags_coach_read on public.coach_flags for
select
  using (public.is_coach_of (client_id));

create policy coach_flags_coach_resolve on public.coach_flags for update using (public.is_coach_of (client_id))
with
  check (public.is_coach_of (client_id));

revoke all on public.coach_flags from authenticated;

grant select on public.coach_flags to authenticated;

grant update (resolved_at, resolution) on public.coach_flags to authenticated;

/**
 * Raises the coach's flags from what a session now says. Runs as definer from a trigger,
 * so the client's own write raises them without being able to read or prevent them.
 */
create or replace function public.raise_session_flags () returns trigger language plpgsql security definer
set
  search_path = public as $$
declare
  v_coach uuid;
  v_thresholds jsonb;
  v_max numeric;
  v_peak integer;
  v_low_days integer;
  v_when text := to_char(new.scheduled_date, 'Dy DD Mon');
begin
  select c.coach_id, c.pain_thresholds into v_coach, v_thresholds
  from public.clients c where c.id = new.client_id;
  if v_coach is null then
    return new;
  end if;

  if new.acute_symptom is not null
     and (tg_op = 'INSERT' or old.acute_symptom is distinct from new.acute_symptom) then
    insert into public.coach_flags (client_id, coach_id, session_id, kind, detail)
    values (new.client_id, v_coach, new.id, 'acute',
      format('Reported %s before "%s" (%s). Session held.', new.acute_symptom, new.title, v_when))
    on conflict do nothing;
  end if;

  if new.pf_flag is true and (tg_op = 'INSERT' or old.pf_flag is distinct from new.pf_flag) then
    insert into public.coach_flags (client_id, coach_id, session_id, kind, detail)
    values (new.client_id, v_coach, new.id, 'pelvic_floor',
      format('Pelvic-floor symptoms before "%s" (%s). Impact work was held.', new.title, v_when))
    on conflict do nothing;
  end if;

  if new.readiness_before is not null
     and (tg_op = 'INSERT' or old.readiness_before is distinct from new.readiness_before) then
    if new.readiness_before < 3 and new.acute_symptom is null then
      insert into public.coach_flags (client_id, coach_id, session_id, kind, detail)
      values (new.client_id, v_coach, new.id, 'hold',
        format('Readiness %s/10 before "%s" (%s). She sees the gentle version until you choose.',
          new.readiness_before, new.title, v_when))
      on conflict do nothing;
    end if;

    -- Persistence: under 5 on at least 4 of the last 7 days (lowest tap per day). Counted
    -- back from today, not from the session's date, so taps written in any order add up
    -- and missed days simply do not count either way.
    select count(*) into v_low_days
    from (
      select s.scheduled_date
      from public.sessions s
      where s.client_id = new.client_id
        and s.readiness_before is not null
        and s.scheduled_date between current_date - 6 and current_date
      group by s.scheduled_date
      having min(s.readiness_before) < 5
    ) low;
    if v_low_days >= 4 then
      insert into public.coach_flags (client_id, coach_id, kind, detail)
      values (new.client_id, v_coach, 'readiness_low',
        format('Readiness under 5 on %s of the last 7 days. Hold hard progression, consider a health check, and re-assess together.', v_low_days))
      on conflict do nothing;
    end if;
  end if;

  if new.pain_location is not null
     and (tg_op = 'INSERT'
       or old.pain_location is distinct from new.pain_location
       or old.pain_before is distinct from new.pain_before
       or old.pain_after is distinct from new.pain_after) then
    select min((t ->> 'max')::numeric) into v_max
    from jsonb_array_elements(coalesce(v_thresholds, '[]'::jsonb)) t
    where lower(t ->> 'location') = lower(new.pain_location);
    v_peak := greatest(coalesce(new.pain_before, 0), coalesce(new.pain_after, 0));
    if v_max is not null and v_peak > v_max then
      insert into public.coach_flags (client_id, coach_id, session_id, kind, detail)
      values (new.client_id, v_coach, new.id, 'pain',
        format('%s pain %s/10 around "%s" (%s), over her threshold of %s.',
          initcap(new.pain_location), v_peak, new.title, v_when, v_max))
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sessions_raise_flags on public.sessions;

create trigger sessions_raise_flags
after insert
or
update of readiness_before,
acute_symptom,
pf_flag,
pain_location,
pain_before,
pain_after on public.sessions for each row
execute function public.raise_session_flags ();
