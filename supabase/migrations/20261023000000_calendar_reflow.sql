-- Phase 1 of the coaching-layer spec: the calendar follows the programme.
--
-- Two defects from the Angkor cohort. A day removed from a programme left its upcoming
-- session orphaned, and a day added back created nothing: the calendar only ever learned
-- about a programme at the moment it was assigned. And day numbers counted from whatever
-- date the coach picked, so a Sunday start made "day 1" a Sunday while every calendar in
-- Vela is Monday-first, and a long run landed on the wrong day for four clients.
--
-- Now an assignment is anchored on the Monday of the week it starts in, so day 1 is a
-- Monday and day 7 a Sunday, always; a start mid-week skips that week's earlier days
-- rather than putting them in the past. And sync_program_sessions brings every live
-- assignment of a programme back in line with its days after any change to them.

alter table public.assignments
  add column if not exists first_day date;

comment on column public.assignments.first_day is
  'The date the coach chose. start_date is the Monday of that week; days before first_day are never scheduled.';

create or replace function public.assign_program (p_program_id uuid, p_client_id uuid, p_start_date date) returns uuid language plpgsql security definer
set
  search_path = public as $$
declare
  v_coach uuid := auth.uid();
  v_anchor date := p_start_date - (extract(isodow from p_start_date)::int - 1);
  v_assignment uuid;
begin
  if v_coach is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.programs p where p.id = p_program_id and p.coach_id = v_coach
  ) then
    raise exception 'programme not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.clients c where c.id = p_client_id and c.coach_id = v_coach
  ) then
    raise exception 'client not found' using errcode = 'P0002';
  end if;

  update public.assignments a
  set status = 'cancelled'
  where a.client_id = p_client_id and a.status = 'active';

  delete from public.sessions s
  where s.client_id = p_client_id
    and s.status = 'scheduled'
    and s.scheduled_date >= p_start_date;

  insert into public.assignments (coach_id, client_id, program_id, start_date, first_day)
  values (v_coach, p_client_id, p_program_id, v_anchor, p_start_date)
  returning id into v_assignment;

  insert into public.sessions (
    client_id, assignment_id, program_day_id, title, discipline, scheduled_date
  )
  select
    p_client_id,
    v_assignment,
    d.id,
    d.title,
    d.discipline,
    v_anchor + ((d.week_no - 1) * 7) + (d.day_no - 1)
  from public.program_days d
  where d.program_id = p_program_id
    and v_anchor + ((d.week_no - 1) * 7) + (d.day_no - 1) >= p_start_date;

  insert into public.audit_log (actor_id, action, entity, entity_id)
  values (v_coach, 'program.assigned', 'client', p_client_id::text);

  return v_assignment;
end;
$$;

/**
 * Brings every live assignment of a programme back in line with its days.
 *
 * Upcoming scheduled sessions only: anything done, started, stopped or already past is a
 * record and stays exactly as it is. Three moves, in order — remove the upcoming sessions
 * whose day is gone, refresh the ones whose day changed (title, discipline, or its place
 * in the week), and add the ones a new day needs. Returns how many sessions changed.
 */
create or replace function public.sync_program_sessions (p_program_id uuid) returns integer language plpgsql security definer
set
  search_path = public as $$
declare
  v_coach uuid := auth.uid();
  v_changed integer := 0;
  n integer;
begin
  if v_coach is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.programs p where p.id = p_program_id and p.coach_id = v_coach
  ) then
    raise exception 'programme not found' using errcode = 'P0002';
  end if;

  -- Upcoming sessions whose day was removed, or moved out of this programme.
  delete from public.sessions s
  using public.assignments a
  where s.assignment_id = a.id
    and a.program_id = p_program_id
    and a.coach_id = v_coach
    and a.status = 'active'
    and s.status = 'scheduled'
    and s.scheduled_date >= current_date
    and (
      s.program_day_id is null
      or not exists (
        select 1 from public.program_days d
        where d.id = s.program_day_id and d.program_id = p_program_id
      )
    );
  get diagnostics n = row_count;
  v_changed := v_changed + n;

  -- A day moved to a date that is already past, or before the chosen first day: its
  -- upcoming copy goes rather than sitting on a day that no longer holds it.
  delete from public.sessions s
  using public.assignments a, public.program_days d
  where s.assignment_id = a.id
    and a.program_id = p_program_id
    and a.coach_id = v_coach
    and a.status = 'active'
    and d.id = s.program_day_id
    and s.status = 'scheduled'
    and s.scheduled_date >= current_date
    and a.start_date + ((d.week_no - 1) * 7) + (d.day_no - 1)
        < greatest(current_date, coalesce(a.first_day, a.start_date));
  get diagnostics n = row_count;
  v_changed := v_changed + n;

  -- Upcoming sessions whose day was renamed, re-disciplined or moved within the block.
  update public.sessions s
  set title = d.title,
      discipline = d.discipline,
      scheduled_date = a.start_date + ((d.week_no - 1) * 7) + (d.day_no - 1)
  from public.assignments a, public.program_days d
  where s.assignment_id = a.id
    and a.program_id = p_program_id
    and a.coach_id = v_coach
    and a.status = 'active'
    and d.id = s.program_day_id
    and s.status = 'scheduled'
    and s.scheduled_date >= current_date
    and (
      s.title is distinct from d.title
      or s.discipline is distinct from d.discipline
      or s.scheduled_date <> a.start_date + ((d.week_no - 1) * 7) + (d.day_no - 1)
    );
  get diagnostics n = row_count;
  v_changed := v_changed + n;

  -- Days that have no session yet in a live assignment, from today on.
  insert into public.sessions (
    client_id, assignment_id, program_day_id, title, discipline, scheduled_date
  )
  select
    a.client_id,
    a.id,
    d.id,
    d.title,
    d.discipline,
    a.start_date + ((d.week_no - 1) * 7) + (d.day_no - 1)
  from public.assignments a
  join public.program_days d on d.program_id = a.program_id
  where a.program_id = p_program_id
    and a.coach_id = v_coach
    and a.status = 'active'
    and a.start_date + ((d.week_no - 1) * 7) + (d.day_no - 1)
        >= greatest(current_date, coalesce(a.first_day, a.start_date))
    and not exists (
      select 1 from public.sessions s
      where s.assignment_id = a.id and s.program_day_id = d.id
    );
  get diagnostics n = row_count;
  v_changed := v_changed + n;

  return v_changed;
end;
$$;

revoke all on function public.sync_program_sessions (uuid) from public;

grant
execute on function public.sync_program_sessions (uuid) to authenticated;
