-- Review fixes for the activities/calendar migration.
--
-- Three things the review caught, each a policy that trusted one column too many.

-- ---------------------------------------------------------------------------
-- 1. Calendar tokens: the client reads and deletes her row; only the function writes it
-- ---------------------------------------------------------------------------
-- The previous FOR ALL policy checked client_id and nothing else, so a client could set
-- profile_id on her own row to her coach's id and the feed would then mint a session as
-- the coach. profile_id is written once by ensure_calendar_token (SECURITY DEFINER, from
-- auth.uid()) and nothing signed-in may touch the row's contents after that.
drop policy if exists calendar_tokens_client_all on public.calendar_tokens;

create policy calendar_tokens_client_read on public.calendar_tokens for
select
  using (public.is_the_client (client_id));

create policy calendar_tokens_client_delete on public.calendar_tokens for delete using (public.is_the_client (client_id));

revoke insert,
update on public.calendar_tokens
from
  authenticated;

-- ---------------------------------------------------------------------------
-- 2. Sessions: a client may add a recorded activity's session and nothing else
-- ---------------------------------------------------------------------------
-- The insert policy let a client write any session row for herself — back-dated, marked
-- completed, attached to a programme day. The only session she legitimately creates is
-- the one her Strava sync files for an activity with no planned match: no programme day,
-- no assignment, logged via strava.
drop policy if exists sessions_client_insert on public.sessions;

create policy sessions_client_insert on public.sessions for insert
with
  check (
    public.is_the_client (client_id)
    and program_day_id is null
    and assignment_id is null
    and logged_via = 'strava'
  );

-- ---------------------------------------------------------------------------
-- 3. Session plans for many sessions at once, for the calendar feed
-- ---------------------------------------------------------------------------
-- The feed asked get_session_plan once per session — forty-five round trips for a block.
-- Same ownership rule, one call: every session id must be the caller's own or her coach's.
create or replace function public.get_session_plans (p_session_ids uuid[]) returns table (
  session_id uuid,
  item_id uuid,
  exercise_name text,
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
begin
  if exists (
    select 1 from public.sessions s
    where s.id = any (p_session_ids)
      and not (public.is_the_client(s.client_id) or public.is_coach_of(s.client_id))
  ) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  return query
  select
    s.id, i.id, e.name, i.block, i.sets, i.reps,
    i.target_load_kg, i.target_rpe, i.tempo, i.rest_sec, i.notes
  from public.sessions s
  join public.program_items i on i.program_day_id = s.program_day_id
  join public.exercises e on e.id = i.exercise_id
  where s.id = any (p_session_ids)
  order by s.id, i.block, i.order_index;
end;
$$;

revoke all on function public.get_session_plans (uuid[]) from public;

grant
execute on function public.get_session_plans (uuid[]) to authenticated;
