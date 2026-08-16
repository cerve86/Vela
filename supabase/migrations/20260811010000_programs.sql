-- Programmes, assignment, and the scheduled sessions that assignment generates.
--
-- The central separation: a programme is the PRESCRIPTION and never changes when a
-- client trains. Sessions are the INSTANCES on real dates. Phase 3 will hang set logs
-- off sessions. Keeping these apart is what makes progress analysis honest later —
-- editing next week's programme must not rewrite what happened last week.

create table public.programs (
  id uuid primary key default gen_random_uuid (),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  name text not null,
  description text,
  duration_weeks int not null default 4 check (duration_weeks between 1 and 52),
  /** Templates are reusable starting points rather than a client's live programme. */
  is_template boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index programs_coach_idx on public.programs (coach_id);

create table public.program_days (
  id uuid primary key default gen_random_uuid (),
  program_id uuid not null references public.programs (id) on delete cascade,
  week_no int not null check (week_no >= 1),
  /** 1 = first training day of the week, not a calendar weekday. The start date decides
      the calendar; this only fixes the order within a week. */
  day_no int not null check (day_no between 1 and 7),
  title text not null,
  discipline text not null default 'strength'
    check (discipline in ('strength', 'run', 'mobility', 'rehab')),
  notes text,
  unique (program_id, week_no, day_no)
);

create index program_days_program_idx on public.program_days (program_id);

create table public.program_items (
  id uuid primary key default gen_random_uuid (),
  program_day_id uuid not null references public.program_days (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  order_index int not null default 0,
  /** Items sharing a block letter are performed as a superset. */
  block text not null default 'A',
  sets int not null default 3 check (sets between 1 and 20),
  /** Free text so a coach can write "8-10", "AMRAP", "30s" or "8 each side". */
  reps text not null default '10',
  target_load_kg numeric(6, 2),
  target_rpe numeric(3, 1) check (target_rpe is null or target_rpe between 1 and 10),
  tempo text,
  rest_sec int not null default 60 check (rest_sec between 0 and 900),
  notes text
);

create index program_items_day_idx on public.program_items (program_day_id, order_index);

create table public.assignments (
  id uuid primary key default gen_random_uuid (),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  program_id uuid not null references public.programs (id) on delete restrict,
  start_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create index assignments_client_idx on public.assignments (client_id, status);

create type public.session_status as enum ('scheduled', 'in_progress', 'completed', 'skipped');

create table public.sessions (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete cascade,
  /** Nullable so an ad-hoc session the client logs herself is still a session. */
  program_day_id uuid references public.program_days (id) on delete set null,
  title text not null,
  discipline text not null default 'strength',
  scheduled_date date not null,
  status public.session_status not null default 'scheduled',
  started_at timestamptz,
  completed_at timestamptz,
  duration_sec int,
  session_rpe numeric(3, 1),
  pain_before int check (pain_before is null or pain_before between 0 and 10),
  pain_after int check (pain_after is null or pain_after between 0 and 10),
  client_notes text,
  coach_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sessions_client_date_idx on public.sessions (client_id, scheduled_date);

create trigger programs_touch before
update on public.programs for each row
execute function public.touch_updated_at ();

create trigger sessions_touch before
update on public.sessions for each row
execute function public.touch_updated_at ();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.programs enable row level security;
alter table public.program_days enable row level security;
alter table public.program_items enable row level security;
alter table public.assignments enable row level security;
alter table public.sessions enable row level security;

create policy programs_own on public.programs for all using (coach_id = auth.uid ())
with
  check (coach_id = auth.uid ());

-- Days and items inherit ownership through the programme. Clients never read these:
-- they read sessions, which is a narrower surface and avoids exposing template work.
create policy program_days_own on public.program_days for all using (
  exists (
    select
      1
    from
      public.programs p
    where
      p.id = program_days.program_id
      and p.coach_id = auth.uid ()
  )
)
with
  check (
    exists (
      select
        1
      from
        public.programs p
      where
        p.id = program_days.program_id
        and p.coach_id = auth.uid ()
    )
  );

create policy program_items_own on public.program_items for all using (
  exists (
    select
      1
    from
      public.program_days d
      join public.programs p on p.id = d.program_id
    where
      d.id = program_items.program_day_id
      and p.coach_id = auth.uid ()
  )
)
with
  check (
    exists (
      select
        1
      from
        public.program_days d
        join public.programs p on p.id = d.program_id
      where
        d.id = program_items.program_day_id
        and p.coach_id = auth.uid ()
    )
  );

create policy assignments_coach on public.assignments for all using (coach_id = auth.uid ())
with
  check (coach_id = auth.uid ());

create policy assignments_client_read on public.assignments for
select
  using (public.is_the_client (client_id));

create policy sessions_coach on public.sessions for all using (public.is_coach_of (client_id))
with
  check (public.is_coach_of (client_id));

-- The client may read her own sessions and update her own logging fields. Coach feedback
-- is deliberately not hers to change, but column-level control needs a trigger or view;
-- for now the app does not expose it and Phase 3 will tighten this.
create policy sessions_client_read on public.sessions for
select
  using (public.is_the_client (client_id));

create policy sessions_client_update on public.sessions
for update
  using (public.is_the_client (client_id))
with
  check (public.is_the_client (client_id));

grant
select,
insert,
update,
delete on public.programs,
public.program_days,
public.program_items,
public.assignments,
public.sessions to authenticated;

-- ---------------------------------------------------------------------------
-- Assigning a programme
-- ---------------------------------------------------------------------------

/**
 * Assigns a programme to a client and generates the scheduled sessions.
 *
 * Dates come from the start date plus the programme's own week/day grid, so the same
 * programme assigned on different days lands on different calendar dates without the
 * programme itself knowing anything about the calendar.
 *
 * Re-assigning the same programme cancels the previous live assignment and removes its
 * *future* scheduled sessions only. Anything already completed, or scheduled in the
 * past, stays — that is training history, not a draft.
 */
create or replace function public.assign_program (
  p_program_id uuid,
  p_client_id uuid,
  p_start_date date
) returns uuid language plpgsql security definer
set
  search_path = public as $$
declare
  v_coach uuid := auth.uid();
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

  insert into public.assignments (coach_id, client_id, program_id, start_date)
  values (v_coach, p_client_id, p_program_id, p_start_date)
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
    p_start_date + ((d.week_no - 1) * 7) + (d.day_no - 1)
  from public.program_days d
  where d.program_id = p_program_id;

  insert into public.audit_log (actor_id, action, entity, entity_id)
  values (v_coach, 'program.assigned', 'client', p_client_id::text);

  return v_assignment;
end;
$$;

grant
execute on function public.assign_program (uuid, uuid, date) to authenticated;
