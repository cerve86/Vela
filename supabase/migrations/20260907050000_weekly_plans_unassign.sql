-- Weekly plans, and taking a programme off a client.
--
-- The weekly plan is the lightest channel a physiotherapist has: one piece of text per
-- client per week — what to do, in her words — written on the client's page or sent
-- from her Claude, read on the phone the moment it is saved. No programme to assign and
-- un-assign each week; the week is the key, and last week's stays as history.
create table if not exists public.client_plans (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- The Monday of the week the plan is for.
  week_start date not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, week_start)
);

create index if not exists client_plans_client_week_idx on public.client_plans (client_id, week_start desc);

alter table public.client_plans enable row level security;

create policy client_plans_coach on public.client_plans for all
  using (public.is_coach_of (client_id))
  with check (public.is_coach_of (client_id) and coach_id = auth.uid());

create policy client_plans_client_read on public.client_plans for select
  using (public.is_the_client (client_id));

grant select, insert, update, delete on public.client_plans to authenticated;

-- Taking a programme off a client: the assignment is cancelled and the sessions it put
-- on her calendar that have not happened yet are removed. Anything she completed stays
-- — that is training history. The coach's own assignment only.
create or replace function public.unassign_program (p_assignment_id uuid) returns void language plpgsql security definer
set
  search_path = public as $$
declare
  v_coach uuid := auth.uid();
  v_client uuid;
begin
  if v_coach is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select a.client_id into v_client
  from public.assignments a
  where a.id = p_assignment_id and a.coach_id = v_coach and a.status = 'active';
  if v_client is null then
    raise exception 'assignment not found' using errcode = 'P0002';
  end if;

  update public.assignments set status = 'cancelled' where id = p_assignment_id;

  delete from public.sessions s
  where s.assignment_id = p_assignment_id
    and s.status = 'scheduled'
    and s.scheduled_date >= current_date;

  insert into public.audit_log (actor_id, action, entity, entity_id)
  values (v_coach, 'program.unassigned', 'client', v_client::text);
end;
$$;

grant execute on function public.unassign_program (uuid) to authenticated;
