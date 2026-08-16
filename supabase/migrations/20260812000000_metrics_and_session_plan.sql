-- Vitals, plus the narrow read a client needs to see her own prescription.

-- ---------------------------------------------------------------------------
-- Metrics: one tall table, never a column per measurement
-- ---------------------------------------------------------------------------

create type public.metric_type as enum (
  'weight_kg',
  'body_fat_pct',
  'waist_cm',
  'resting_hr',
  'hrv_ms',
  'bp_systolic',
  'bp_diastolic',
  'spo2_pct',
  'sleep_min',
  'steps',
  'vo2max'
);

create type public.metric_source as enum ('manual', 'healthkit', 'coach');

create table public.metrics (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  recorded_at timestamptz not null,
  type public.metric_type not null,
  value numeric(10, 3) not null,
  source public.metric_source not null default 'manual',
  /**
   * HealthKit sample UUID. This is what makes re-syncing safe: importing the same
   * window twice must not double a client's step count or invent a second weigh-in.
   */
  external_id text,
  created_at timestamptz not null default now()
);

create index metrics_client_type_time_idx
  on public.metrics (client_id, type, recorded_at desc);

-- The idempotency guarantee. Partial, because manual entries have no external id and
-- a client may legitimately record two manual weights on the same day.
create unique index metrics_external_unique
  on public.metrics (client_id, type, external_id)
  where external_id is not null;

alter table public.metrics enable row level security;

create policy metrics_client_all on public.metrics for all using (public.is_the_client (client_id))
with
  check (public.is_the_client (client_id));

create policy metrics_coach_read on public.metrics for
select
  using (public.is_coach_of (client_id));

-- The coach may add a measurement taken in clinic, but may not alter what the client's
-- devices reported.
create policy metrics_coach_insert on public.metrics for insert
with
  check (public.is_coach_of (client_id) and source = 'coach');

grant
select,
insert,
update,
delete on public.metrics to authenticated;

/**
 * Batch import from Apple Health.
 *
 * ON CONFLICT DO NOTHING against the external id is the whole point: HealthKit
 * background delivery re-sends overlapping windows, and a client who reinstalls the app
 * will replay her history. Neither should change a single number.
 *
 * Returns how many rows were genuinely new, so the app can show an honest "12 new
 * readings" rather than claiming to have imported everything it looked at.
 */
create or replace function public.import_health_metrics (p_samples jsonb) returns int language plpgsql security definer
set
  search_path = public as $$
declare
  v_client uuid;
  v_inserted int;
begin
  select c.id into v_client from public.clients c where c.profile_id = auth.uid();
  if v_client is null then
    raise exception 'no client record for this user' using errcode = '42501';
  end if;

  -- Health data may only be imported once the client has actually consented to us
  -- processing it. Without this the consent screen would be decoration.
  if not public.has_health_consent(v_client) then
    raise exception 'health data consent not granted' using errcode = '42501';
  end if;

  with incoming as (
    select
      (s->>'type')::public.metric_type as type,
      (s->>'recordedAt')::timestamptz as recorded_at,
      (s->>'value')::numeric as value,
      nullif(s->>'externalId', '') as external_id
    from jsonb_array_elements(p_samples) as s
  ),
  ins as (
    insert into public.metrics (client_id, recorded_at, type, value, source, external_id)
    select v_client, i.recorded_at, i.type, i.value, 'healthkit', i.external_id
    from incoming i
    where i.external_id is not null
    on conflict (client_id, type, external_id) where external_id is not null do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return v_inserted;
end;
$$;

grant
execute on function public.import_health_metrics (jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- A client's view of her own prescription
-- ---------------------------------------------------------------------------

/**
 * Returns the prescribed items for one of the caller's own sessions.
 *
 * Clients deliberately have no read access to programs/program_days/program_items —
 * that would expose the coach's template work. This function is the narrow exception:
 * it returns the items for a single session, and only if that session belongs to the
 * caller. A coach may also call it for a session belonging to one of her clients.
 */
create or replace function public.get_session_plan (p_session_id uuid) returns table (
  item_id uuid,
  exercise_id uuid,
  exercise_name text,
  cues text[],
  block text,
  sets int,
  reps text,
  target_load_kg numeric,
  target_rpe numeric,
  tempo text,
  rest_sec int,
  notes text
) language plpgsql security definer
set
  search_path = public as $$
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
    i.target_load_kg, i.target_rpe, i.tempo, i.rest_sec, i.notes
  from public.sessions s
  join public.program_items i on i.program_day_id = s.program_day_id
  join public.exercises e on e.id = i.exercise_id
  where s.id = p_session_id
  order by i.block, i.order_index;
end;
$$;

grant
execute on function public.get_session_plan (uuid) to authenticated;
