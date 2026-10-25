-- The fuelling check after a session.
--
-- After a session that had a fuel card (long, quality, strength), she answers three taps:
-- did she fuel as planned, was it enough for the session, and how was her stomach; and,
-- when she did not fuel as planned, what got in the way. Followed and enough stay separate
-- because together they say what to change: followed and short means the plan is too
-- light, not followed and short means the plan is not happening.
--
-- The coach is flagged, conservatively, when she had to stop for her stomach, or ran out
-- of energy on two fuelled sessions within 14 days.

alter table public.sessions
  add column if not exists fuel_followed text check (fuel_followed in ('yes', 'partly', 'no')),
  add column if not exists fuel_enough text
    check (fuel_enough in ('ran_out', 'short', 'right', 'heavy')),
  add column if not exists fuel_gut smallint check (fuel_gut between 0 and 3),
  add column if not exists fuel_barrier text
    check (fuel_barrier in ('forgot', 'not_with_me', 'stomach', 'not_hungry', 'changed'));

comment on column public.sessions.fuel_followed is 'Did she fuel as planned: yes, partly or no. Asked after a session with a fuel card.';
comment on column public.sessions.fuel_enough is 'Was it enough for the session, as she felt it: ran_out, short, right, or heavy (sat heavy on her stomach).';
comment on column public.sessions.fuel_gut is 'Her stomach during the session: 0 none, 1 mild, 2 slowed her down, 3 had to stop.';
comment on column public.sessions.fuel_barrier is 'What got in the way, when she did not fuel as planned.';

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
    'deload_check',
    'fuel'
  )
);

/**
 * Raises a fuel flag when she had to stop for her stomach (once per session), or when this
 * answer makes two fuelled sessions in 14 days where she ran out of energy (once until the
 * coach resolves it). For a client flagged for restrictive patterns the flag says so: the
 * answer is a conversation, not a bigger plan.
 */
create or replace function public.raise_fuel_flags () returns trigger language plpgsql security definer
set
  search_path = public as $$
declare
  v_coach uuid;
  v_restrictive boolean;
  v_ran_out integer;
begin
  select c.coach_id, c.restrictive_pattern into v_coach, v_restrictive
  from public.clients c
  where c.id = new.client_id;
  if v_coach is null then
    return new;
  end if;

  if new.fuel_gut = 3 and (tg_op = 'INSERT' or old.fuel_gut is distinct from new.fuel_gut) then
    insert into public.coach_flags (client_id, coach_id, session_id, kind, detail)
    values (new.client_id, v_coach, new.id, 'fuel',
      format('Had to stop for her stomach on %s. Worth asking what she took, and when.',
        coalesce(new.title, 'a session')))
    on conflict do nothing;
  end if;

  if new.fuel_enough = 'ran_out'
     and (tg_op = 'INSERT' or old.fuel_enough is distinct from new.fuel_enough) then
    select count(*) into v_ran_out
    from public.sessions s
    where s.client_id = new.client_id
      and s.fuel_enough = 'ran_out'
      and s.scheduled_date > current_date - 14;
    if v_ran_out >= 2 then
      insert into public.coach_flags (client_id, coach_id, kind, detail)
      values (new.client_id, v_coach, 'fuel',
        format('Ran out of energy on %s fuelled sessions in the last 14 days. %s',
          v_ran_out,
          case when v_restrictive
            then 'She is flagged for restrictive patterns: worth a conversation before any change to the plan.'
            else 'Check whether the plan is too light or is not happening.'
          end))
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$;

create trigger sessions_raise_fuel_flags
after insert
or
update of fuel_enough,
fuel_gut on public.sessions for each row
execute function public.raise_fuel_flags ();
