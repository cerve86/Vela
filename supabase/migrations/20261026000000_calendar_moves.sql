-- Phase 4 of the coaching-layer spec: a calendar you can move.
--
-- 1. A planned session can be moved, alone or with the rest of its block behind it. A
--    moved session remembers its programmed date and is marked as moved, so the Phase 1
--    reflow keeps it on the day the coach chose instead of pulling it back.
-- 2. Records never move: only a session still planned, today or later, can.
-- 3. Every block stays visible. A block replaced by a new one is "replaced", not
--    "cancelled", and block_progress reads each one's sessions.
-- 4. A client can ask to move a session. The request raises a coach flag, so it reaches
--    the coach the way every other decision does, and only the coach can grant it.

alter table public.sessions
add column if not exists moved_at timestamptz,
add column if not exists original_date date;

comment on column public.sessions.original_date is 'The programmed date of a moved session. Null when it sits where the programme put it.';

-- ---------------------------------------------------------------------------
-- Moving
-- ---------------------------------------------------------------------------

/**
 * The move itself, without the permission check: the callers check. With p_ripple and a
 * session from a block, every planned session of that block on or after it moves by the
 * same number of days. A session moved back onto its programmed date is no longer moved.
 */
create or replace function public.shift_sessions (p_session uuid, p_to date, p_ripple boolean) returns integer language plpgsql security definer
set
  search_path = public as $$
declare
  s public.sessions;
  v_delta integer;
  n integer;
begin
  select * into s from public.sessions where id = p_session for update;
  if s.status <> 'scheduled' then
    raise exception 'only a planned session can move' using errcode = '22023';
  end if;
  if s.scheduled_date < current_date then
    raise exception 'a past session stays where it is' using errcode = '22023';
  end if;
  if p_to < current_date then
    raise exception 'a session cannot move into the past' using errcode = '22023';
  end if;

  v_delta := p_to - s.scheduled_date;
  if v_delta = 0 then
    return 0;
  end if;

  update public.sessions x
  set scheduled_date = x.scheduled_date + v_delta,
      original_date = case
        when x.scheduled_date + v_delta = coalesce(x.original_date, x.scheduled_date) then null
        else coalesce(x.original_date, x.scheduled_date)
      end,
      moved_at = case
        when x.scheduled_date + v_delta = coalesce(x.original_date, x.scheduled_date) then null
        else now()
      end
  where x.id = s.id
     or (
       p_ripple
       and s.assignment_id is not null
       and x.assignment_id = s.assignment_id
       and x.status = 'scheduled'
       and x.scheduled_date >= s.scheduled_date
     );
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.shift_sessions (uuid, date, boolean) from public, anon, authenticated;

/** The coach moves a planned session of one of her clients. Returns how many moved. */
create or replace function public.move_session (p_session uuid, p_to date, p_ripple boolean default false) returns integer language plpgsql security definer
set
  search_path = public as $$
declare
  v_coach uuid := auth.uid();
  v_client uuid;
  n integer;
begin
  if v_coach is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select s.client_id into v_client
  from public.sessions s join public.clients c on c.id = s.client_id
  where s.id = p_session and c.coach_id = v_coach;
  if v_client is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  n := public.shift_sessions(p_session, p_to, p_ripple);

  insert into public.audit_log (actor_id, action, entity, entity_id)
  values (v_coach, case when p_ripple then 'session.moved_block' else 'session.moved' end, 'client', v_client::text);
  return n;
end;
$$;

grant
execute on function public.move_session (uuid, date, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- The reflow leaves a moved session on its day
-- ---------------------------------------------------------------------------

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

  -- Upcoming sessions whose day was removed, or moved out of this programme. A moved
  -- session goes too: the day it came from no longer exists.
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

  -- A day moved to a date that is already past, or before the chosen first day. A session
  -- the coach moved by hand keeps the day she chose.
  delete from public.sessions s
  using public.assignments a, public.program_days d
  where s.assignment_id = a.id
    and a.program_id = p_program_id
    and a.coach_id = v_coach
    and a.status = 'active'
    and d.id = s.program_day_id
    and s.status = 'scheduled'
    and s.moved_at is null
    and s.scheduled_date >= current_date
    and a.start_date + ((d.week_no - 1) * 7) + (d.day_no - 1)
        < greatest(current_date, coalesce(a.first_day, a.start_date));
  get diagnostics n = row_count;
  v_changed := v_changed + n;

  -- Upcoming sessions whose day was renamed, re-disciplined or moved within the block. A
  -- moved session takes the new title and discipline but keeps its date.
  update public.sessions s
  set title = d.title,
      discipline = d.discipline,
      scheduled_date = case
        when s.moved_at is null then a.start_date + ((d.week_no - 1) * 7) + (d.day_no - 1)
        else s.scheduled_date
      end
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
      or (
        s.moved_at is null
        and s.scheduled_date <> a.start_date + ((d.week_no - 1) * 7) + (d.day_no - 1)
      )
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

-- ---------------------------------------------------------------------------
-- Every block, including past ones
-- ---------------------------------------------------------------------------

alter table public.assignments
drop constraint assignments_status_check;

alter table public.assignments
add constraint assignments_status_check check (
  status in ('active', 'completed', 'cancelled', 'replaced')
);

/** As in Phase 1, except the block it replaces is marked replaced, not cancelled. */
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
  set status = 'replaced'
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

/** One row per block, with what became of its sessions. Row security as the reader. */
create or replace view public.block_progress
with
  (security_invoker = true) as
select
  a.id as assignment_id,
  a.client_id,
  a.program_id,
  p.name as program_name,
  p.kind as program_kind,
  p.duration_weeks,
  a.start_date,
  coalesce(a.first_day, a.start_date) as first_day,
  a.status,
  a.created_at,
  count(s.id) filter (
    where
      s.program_day_id is not null
  )::integer as planned,
  count(s.id) filter (
    where
      s.program_day_id is not null
      and s.status = 'completed'
  )::integer as done,
  count(s.id) filter (
    where
      s.moved_at is not null
  )::integer as moved
from
  public.assignments a
  join public.programs p on p.id = a.program_id
  left join public.sessions s on s.assignment_id = a.id
group by
  a.id,
  p.id;

grant select on public.block_progress to authenticated;

-- ---------------------------------------------------------------------------
-- A client asks; the coach decides
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
    'move_request'
  )
);

create table public.move_requests (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  from_date date not null,
  to_date date not null,
  note text check (char_length(note) <= 500),
  status text not null default 'pending' check (
    status in ('pending', 'accepted', 'declined', 'withdrawn')
  ),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create unique index move_requests_pending_once on public.move_requests (session_id)
where
  status = 'pending';

alter table public.move_requests enable row level security;

create policy move_requests_client_read on public.move_requests for
select
  using (public.is_the_client (client_id));

create policy move_requests_coach_read on public.move_requests for
select
  using (public.is_coach_of (client_id));

-- Read only: every write goes through the functions below.
grant select on public.move_requests to authenticated;

/** The client asks to move one of her own planned sessions to another day. */
create or replace function public.request_session_move (p_session uuid, p_to date, p_note text default null) returns uuid language plpgsql security definer
set
  search_path = public as $$
declare
  s public.sessions;
  v_coach uuid;
  v_id uuid;
begin
  select x.* into s
  from public.sessions x join public.clients c on c.id = x.client_id
  where x.id = p_session and c.profile_id = auth.uid();
  if s.id is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if s.status <> 'scheduled' or s.scheduled_date < current_date then
    raise exception 'only a planned session can move' using errcode = '22023';
  end if;
  if p_to < current_date or p_to = s.scheduled_date then
    raise exception 'pick another day, today or later' using errcode = '22023';
  end if;

  insert into public.move_requests (client_id, session_id, from_date, to_date, note)
  values (s.client_id, s.id, s.scheduled_date, p_to, nullif(trim(p_note), ''))
  returning id into v_id;

  select c.coach_id into v_coach from public.clients c where c.id = s.client_id;
  insert into public.coach_flags (client_id, coach_id, session_id, kind, detail)
  values (s.client_id, v_coach, s.id, 'move_request',
    format('She asks to move "%s" from %s to %s.%s', s.title,
      to_char(s.scheduled_date, 'Dy DD Mon'), to_char(p_to, 'Dy DD Mon'),
      case when nullif(trim(p_note), '') is null then '' else format(' "%s"', trim(p_note)) end))
  on conflict do nothing;

  return v_id;
end;
$$;

grant
execute on function public.request_session_move (uuid, date, text) to authenticated;

/** The client takes her request back before the coach has decided. */
create or replace function public.withdraw_move_request (p_session uuid) returns void language plpgsql security definer
set
  search_path = public as $$
begin
  update public.move_requests r
  set status = 'withdrawn', decided_at = now()
  from public.clients c
  where r.session_id = p_session and r.status = 'pending'
    and c.id = r.client_id and c.profile_id = auth.uid();
  if not found then
    raise exception 'no request to withdraw' using errcode = 'P0002';
  end if;
  update public.coach_flags
  set resolved_at = now(), resolution = 'withdrawn'
  where session_id = p_session and kind = 'move_request' and resolved_at is null;
end;
$$;

grant
execute on function public.withdraw_move_request (uuid) to authenticated;

/**
 * The coach answers a request: move it to the day asked for (or another she picks), or
 * keep the session where it is. Either way the flag is resolved.
 */
create or replace function public.decide_move_request (p_session uuid, p_accept boolean, p_to date default null) returns void language plpgsql security definer
set
  search_path = public as $$
declare
  r public.move_requests;
begin
  select x.* into r
  from public.move_requests x join public.clients c on c.id = x.client_id
  where x.session_id = p_session and x.status = 'pending' and c.coach_id = auth.uid();
  if r.id is null then
    raise exception 'no request to decide' using errcode = 'P0002';
  end if;

  if p_accept then
    perform public.shift_sessions(p_session, coalesce(p_to, r.to_date), false);
  end if;

  update public.move_requests
  set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now()
  where id = r.id;

  update public.coach_flags
  set resolved_at = now(),
      resolution = case when p_accept then 'moved' else 'kept' end
  where session_id = p_session and kind = 'move_request' and resolved_at is null;

  insert into public.audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), case when p_accept then 'session.move_granted' else 'session.move_declined' end, 'client', r.client_id::text);
end;
$$;

grant
execute on function public.decide_move_request (uuid, boolean, date) to authenticated;
