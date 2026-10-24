-- Phase 5 of the coaching-layer spec: her library, not a catalogue.
--
-- 1. A movement carries what the coach's sheet says about it: a code and a domain, its
--    type and phases, the dose with its load rule, the L1–L4 ladder and the regression,
--    why it is there, what to watch for, the gates it sits behind, and where its video
--    comes from. "Selected" marks her curated library; the rest of the catalogue stays
--    searchable behind it.
-- 2. Domains are the coach's own (code, name, what the domain buys in running).
-- 3. Each client has priorities in the library, from the sheet's Assignment tab.
-- 4. Gates are cleared per client by the coach, and overridden per block. A gated item
--    whose gate is neither cleared nor overridden waits: the session plan says so, and
--    the app leaves it out until the coach decides.
-- 5. A session block is a named circuit, prescribed as one item, filmed once.
-- 6. A programme day can carry a heat finish.

alter table public.exercises
add column if not exists code text,
add column if not exists domain text,
add column if not exists movement_type text,
add column if not exists phases text[] not null default '{}',
add column if not exists dose text,
add column if not exists load_rule text,
add column if not exists ladder text[] not null default '{}',
add column if not exists regression text,
add column if not exists why text,
add column if not exists watch_for text,
add column if not exists gates text[] not null default '{}',
add column if not exists video_source text,
add column if not exists video_url text,
add column if not exists selected boolean not null default false,
add column if not exists kind text not null default 'movement',
add column if not exists block_items jsonb not null default '[]';

alter table public.exercises
add constraint exercises_gates_known check (gates <@ array['pelvic_floor', 'shin']::text[]),
add constraint exercises_video_source_known check (
  video_source is null
  or video_source in ('own', 'stock')
),
add constraint exercises_kind_known check (kind in ('movement', 'block')),
add constraint exercises_ladder_four check (cardinality(ladder) <= 4),
add constraint exercises_block_items_array check (jsonb_typeof(block_items) = 'array');

create unique index if not exists exercises_code_per_owner on public.exercises (coach_id, code)
where
  code is not null
  and archived_at is null;

create table public.exercise_domains (
  coach_id uuid not null references public.coaches (id) on delete cascade,
  code text not null,
  name text not null,
  purpose text,
  sort integer not null default 0,
  primary key (coach_id, code)
);

alter table public.exercise_domains enable row level security;

create policy exercise_domains_own on public.exercise_domains for all using (coach_id = auth.uid ())
with
  check (coach_id = auth.uid ());

grant select, insert, update, delete on public.exercise_domains to authenticated;

/** A movement the coach marked for a client: a priority, or simply in her set. */
create table public.client_exercise_priority (
  client_id uuid not null references public.clients (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  level text not null check (level in ('priority', 'yes')),
  primary key (client_id, exercise_id)
);

alter table public.client_exercise_priority enable row level security;

create policy client_exercise_priority_coach on public.client_exercise_priority for all using (public.is_coach_of (client_id))
with
  check (public.is_coach_of (client_id));

create policy client_exercise_priority_client_read on public.client_exercise_priority for
select
  using (public.is_the_client (client_id));

grant select, insert, update, delete on public.client_exercise_priority to authenticated;

alter table public.clients
add column if not exists cleared_gates text[] not null default '{}';

alter table public.clients
add constraint clients_cleared_gates_known check (cleared_gates <@ array['pelvic_floor', 'shin']::text[]);

comment on column public.clients.cleared_gates is 'Gates the coach has cleared this client through. A gated movement is served only past a cleared gate, or with an override on the block.';

alter table public.assignments
add column if not exists gate_overrides text[] not null default '{}';

alter table public.assignments
add constraint assignments_gate_overrides_known check (gate_overrides <@ array['pelvic_floor', 'shin']::text[]);

alter table public.program_days
add column if not exists heat_finish boolean not null default false;

comment on column public.program_days.heat_finish is 'Sauna or a 40 °C bath, 20–30 minutes, within 10 minutes of finishing.';

/** The coach overrides a gate for one block of one of her clients. */
create or replace function public.set_gate_override (p_assignment uuid, p_gate text, p_on boolean) returns void language plpgsql security definer
set
  search_path = public as $$
begin
  if p_gate not in ('pelvic_floor', 'shin') then
    raise exception 'unknown gate' using errcode = '22023';
  end if;
  update public.assignments a
  set gate_overrides = case
    when p_on then (select array_agg(distinct g) from unnest(a.gate_overrides || p_gate) g)
    else array_remove(a.gate_overrides, p_gate)
  end
  where a.id = p_assignment and a.coach_id = auth.uid();
  if not found then
    raise exception 'assignment not found' using errcode = 'P0002';
  end if;
  insert into public.audit_log (actor_id, action, entity, entity_id)
  values (auth.uid(), case when p_on then 'gate.overridden' else 'gate.override_removed' end, 'assignment', p_assignment::text);
end;
$$;

grant
execute on function public.set_gate_override (uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- The session plan carries the card and the gate
-- ---------------------------------------------------------------------------

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
  category text,
  gates text[],
  gate_open boolean,
  why text,
  watch_for text,
  regression text,
  ladder text[],
  video_url text,
  kind text,
  block_items jsonb
) language plpgsql security definer
set
  search_path to 'public' as $$
declare
  v_client uuid;
  v_open text[];
begin
  select s.client_id, c.cleared_gates || coalesce(a.gate_overrides, '{}')
  into v_client, v_open
  from public.sessions s
  join public.clients c on c.id = s.client_id
  left join public.assignments a on a.id = s.assignment_id
  where s.id = p_session_id;
  if v_client is null then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if not (public.is_the_client(v_client) or public.is_coach_of(v_client)) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  return query
  select
    i.id, e.id, e.name, e.cues, i.block, i.sets, i.reps,
    i.target_load_kg, i.target_rpe, i.tempo, i.rest_sec, i.notes, e.category::text,
    e.gates,
    e.gates <@ v_open,
    e.why, e.watch_for, e.regression, e.ladder, e.video_url, e.kind,
    case when e.kind = 'block' then coalesce((
      select jsonb_agg(jsonb_build_object('name', x.name, 'dose', b.v ->> 'dose', 'cue', x.cues[1]) order by b.ord)
      from jsonb_array_elements(e.block_items) with ordinality b(v, ord)
      join public.exercises x on x.id = (b.v ->> 'exercise_id')::uuid
    ), '[]'::jsonb) else '[]'::jsonb end
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
