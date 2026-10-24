-- Phase 7 of the coaching-layer spec: power, periodisation and the evidence.
--
-- 1. A programme carries its phase (base, build, peak, taper) and which of its weeks are
--    deloads. A block of four is three load weeks and a deload, and the deload is
--    conditional: when a client reaches one without having done the load weeks before
--    it, the coach is asked whether to deload as planned or repeat the last load week
--    first. Her answer is recorded on the assignment and never asked twice.
-- 2. The power and elasticity ladder, L1 to L4, is earned: a client moves up one level at
--    a time, only past cleared pelvic-floor and shin gates, and only by her coach's hand.
-- 3. The coach keeps her evidence: a reference list only she reads.

alter table public.programs
add column if not exists phase text,
add column if not exists deload_weeks integer[] not null default '{}';

alter table public.programs
add constraint programs_phase_known check (
  phase is null
  or phase in ('base', 'build', 'peak', 'taper')
);

alter table public.assignments
add column if not exists deload_decisions jsonb not null default '{}';

comment on column public.assignments.deload_decisions is 'Week number to the coach''s answer: "deload" or "repeat".';

-- ---------------------------------------------------------------------------
-- The conditional deload
-- ---------------------------------------------------------------------------

alter table public.coach_flags
drop constraint coach_flags_kind_check;

alter table public.coach_flags
add constraint coach_flags_kind_check check (
  kind in (
    'readiness_low',
    'acute',
    'pain',
    'pelvic_floor',
    'hold',
    'divergence',
    'move_request',
    'deload_check'
  )
);

/**
 * Raises a flag for each of the coach's live blocks that is about to reach a deload week
 * whose load weeks were not done: fewer than nine in ten of the prescribed sessions in the
 * three weeks before it completed. From the Saturday before the deload week to its end,
 * once per block and week, and never again once she has answered. Returns how many.
 */
create or replace function public.raise_deload_checks () returns integer language plpgsql security definer
set
  search_path = public as $$
declare
  a record;
  w integer;
  v_monday date;
  v_total integer;
  v_done integer;
  v_session uuid;
  n integer := 0;
  k integer;
begin
  for a in
    select x.id, x.client_id, x.coach_id, x.start_date, x.deload_decisions, p.deload_weeks
    from public.assignments x
    join public.programs p on p.id = x.program_id
    where x.coach_id = auth.uid() and x.status = 'active' and cardinality(p.deload_weeks) > 0
  loop
    foreach w in array a.deload_weeks loop
      continue when w < 2 or a.deload_decisions ? w::text;
      v_monday := a.start_date + (w - 1) * 7;
      continue when current_date < v_monday - 2 or current_date > v_monday + 6;

      select count(*), count(*) filter (where s.status = 'completed')
      into v_total, v_done
      from public.sessions s
      where s.assignment_id = a.id
        and s.program_day_id is not null
        and s.scheduled_date >= greatest(a.start_date, v_monday - 21)
        and s.scheduled_date < v_monday;
      continue when v_total = 0 or v_done >= ceil(v_total * 0.9);

      select s.id into v_session
      from public.sessions s
      where s.assignment_id = a.id and s.scheduled_date >= v_monday
      order by s.scheduled_date
      limit 1;
      continue when v_session is null;

      insert into public.coach_flags (client_id, coach_id, session_id, kind, detail)
      values (a.client_id, a.coach_id, v_session, 'deload_check',
        format('Week %s is a deload, but the load weeks before it were not all done (%s of %s sessions). Deload as planned, or repeat week %s first?',
          w, v_done, v_total, w - 1))
      on conflict do nothing;
      get diagnostics k = row_count;
      n := n + k;
    end loop;
  end loop;
  return n;
end;
$$;

grant
execute on function public.raise_deload_checks () to authenticated;

/**
 * The coach's answer to a deload check. "deload" keeps the plan. "repeat" moves the rest
 * of the block a week later and puts the last load week's days into the week that frees,
 * marked as moved so the reflow leaves them there. Either way the answer is recorded and
 * the flag resolved.
 */
create or replace function public.decide_deload (p_assignment uuid, p_week integer, p_choice text) returns integer language plpgsql security definer
set
  search_path = public as $$
declare
  a record;
  v_monday date;
  n integer := 0;
begin
  if p_choice not in ('deload', 'repeat') then
    raise exception 'choose deload or repeat' using errcode = '22023';
  end if;
  select x.id, x.client_id, x.program_id, x.start_date into a
  from public.assignments x
  where x.id = p_assignment and x.coach_id = auth.uid() and x.status = 'active';
  if a.id is null then
    raise exception 'assignment not found' using errcode = 'P0002';
  end if;
  v_monday := a.start_date + (p_week - 1) * 7;

  if p_choice = 'repeat' then
    update public.sessions s
    set scheduled_date = s.scheduled_date + 7,
        original_date = coalesce(s.original_date, s.scheduled_date),
        moved_at = now()
    where s.assignment_id = a.id
      and s.status = 'scheduled'
      and s.scheduled_date >= greatest(v_monday, current_date);
    get diagnostics n = row_count;

    insert into public.sessions (
      client_id, assignment_id, program_day_id, title, discipline, scheduled_date, original_date, moved_at
    )
    select a.client_id, a.id, d.id, d.title, d.discipline,
      v_monday + (d.day_no - 1), a.start_date + (d.week_no - 1) * 7 + (d.day_no - 1), now()
    from public.program_days d
    where d.program_id = a.program_id
      and d.week_no = p_week - 1
      and v_monday + (d.day_no - 1) >= current_date;
  end if;

  update public.assignments
  set deload_decisions = deload_decisions || jsonb_build_object(p_week::text, p_choice)
  where id = a.id;

  update public.coach_flags f
  set resolved_at = now(), resolution = p_choice
  where f.client_id = a.client_id and f.kind = 'deload_check' and f.resolved_at is null;

  insert into public.audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), 'deload.' || p_choice, 'assignment', a.id::text);
  return n;
end;
$$;

grant
execute on function public.decide_deload (uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The power and elasticity ladder
-- ---------------------------------------------------------------------------

alter table public.clients
add column if not exists power_level smallint;

alter table public.clients
add constraint clients_power_level_range check (
  power_level is null
  or power_level between 1 and 4
);

create table public.power_level_log (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  level smallint not null check (level between 1 and 4),
  set_by uuid not null,
  note text,
  created_at timestamptz not null default now()
);

alter table public.power_level_log enable row level security;

create policy power_level_log_coach_read on public.power_level_log for
select
  using (public.is_coach_of (client_id));

create policy power_level_log_client_read on public.power_level_log for
select
  using (public.is_the_client (client_id));

grant select on public.power_level_log to authenticated;

/**
 * Sets a client's level on the ladder. Up one level at a time, and above L1 only once she
 * is cleared through both the pelvic-floor and the shin gate; down to any level, any time.
 * The coach's tick is this call; every change is logged with her note.
 */
create or replace function public.set_power_level (p_client uuid, p_level smallint, p_note text default null) returns void language plpgsql security definer
set
  search_path = public as $$
declare
  c record;
begin
  select x.id, x.power_level, x.cleared_gates into c
  from public.clients x
  where x.id = p_client and x.coach_id = auth.uid();
  if c.id is null then
    raise exception 'client not found' using errcode = 'P0002';
  end if;
  if p_level < 1 or p_level > 4 then
    raise exception 'levels run from L1 to L4' using errcode = '22023';
  end if;
  if p_level > coalesce(c.power_level, 0) + 1 then
    raise exception 'one level at a time: she is on L%', coalesce(c.power_level, 0) using errcode = '22023';
  end if;
  if p_level > 1 and p_level > coalesce(c.power_level, 0)
     and not (c.cleared_gates @> array['pelvic_floor', 'shin']) then
    raise exception 'clear her pelvic-floor and shin gates before L%', p_level using errcode = '22023';
  end if;

  update public.clients set power_level = p_level where id = p_client;
  insert into public.power_level_log (client_id, level, set_by, note)
  values (p_client, p_level, auth.uid(), nullif(trim(p_note), ''));
end;
$$;

grant
execute on function public.set_power_level (uuid, smallint, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The evidence
-- ---------------------------------------------------------------------------

create table public.evidence_refs (
  id uuid primary key default gen_random_uuid (),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  topic text not null,
  title text not null,
  authors text,
  year smallint,
  source text,
  url text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.evidence_refs enable row level security;

create policy evidence_refs_own on public.evidence_refs for all using (coach_id = auth.uid ())
with
  check (coach_id = auth.uid ());

grant select, insert, update, delete on public.evidence_refs to authenticated;
