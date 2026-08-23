-- Challenges: a group total across a coach's clients, and each client's own share of it.
--
-- The design's framing is load-bearing: "challenges run across clients, not against them."
-- What a challenge counts is participation, and the metric enum is where that is enforced —
-- there is no value for pain, weight or load, so a coach cannot construct a leaderboard
-- ranking postpartum women on their bodies even by accident. Adding one later would be a
-- schema change with this comment attached to it.
create type public.challenge_metric as enum('sessions_completed', 'fuel_days');

comment on type public.challenge_metric is 'What a challenge counts. Deliberately excludes pain, weight and load: a group board ranking clinical or body measurements is not a thing this product will do.';

create table public.challenges (
  id uuid primary key default gen_random_uuid (),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  name text not null,
  summary text,
  metric public.challenge_metric not null default 'sessions_completed',
  starts_on date not null default current_date,
  weeks int not null check (weeks between 1 and 26),
  -- Per participant, per week. The group target is this times the head count, which is why
  -- adding somebody mid-challenge raises the bar rather than making it easier to clear.
  weekly_target int not null check (weekly_target between 1 and 28),
  -- The block this grew out of, when it came from the bundle dialog's "also run as a
  -- challenge". Nullable: a challenge can outlive the programme that started it.
  program_id uuid references public.programs (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Redundant against the primary key, and there to be the target of the composite
  -- foreign key below. It is what lets challenge_participants carry its own coach_id
  -- without that copy ever being able to disagree with this one.
  unique (id, coach_id)
);

-- coach_id is denormalised here on purpose, and the composite foreign key is why it is
-- safe. Without it the two policies below recurse: reading a challenge needs to know who
-- participates, and reading a participant needs to know who owns the challenge. Postgres
-- detects that and refuses the query outright — "infinite recursion detected in policy".
--
-- Carrying the owner on the membership row breaks the cycle, and the composite key means
-- the copy is not a copy the application maintains: the database will not accept a
-- participant whose coach_id differs from its challenge's.
create table public.challenge_participants (
  challenge_id uuid not null,
  coach_id uuid not null,
  client_id uuid not null references public.clients (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (challenge_id, client_id),
  foreign key (challenge_id, coach_id) references public.challenges (id, coach_id) on delete cascade
);

create index challenges_coach_idx on public.challenges (coach_id, created_at desc);

create index challenge_participants_client_idx on public.challenge_participants (client_id);

alter table public.challenges enable row level security;

alter table public.challenge_participants enable row level security;

-- The coach owns her challenges outright.
create policy challenges_coach_all on public.challenges for all using (coach_id = auth.uid ())
with
  check (coach_id = auth.uid ());

-- A participant may read the challenge she is in — she needs its name, target and dates to
-- be shown anything at all. Reading the row says nothing about who else is in it.
create policy challenges_participant_select on public.challenges for
select
  using (
    exists (
      select
        1
      from
        public.challenge_participants p
        join public.clients c on c.id = p.client_id
      where
        p.challenge_id = challenges.id
        and c.profile_id = auth.uid ()
    )
  );

-- Reads the row's own column rather than joining back to challenges, which is what keeps
-- this out of the recursion described above. The composite foreign key guarantees the
-- column is the truth.
create policy challenge_participants_coach_all on public.challenge_participants for all using (coach_id = auth.uid ())
with
  check (coach_id = auth.uid ());

-- A client sees her OWN membership row and nobody else's.
--
-- This is the line the whole feature turns on. Letting a participant read the other rows
-- would hand her a list of who else is a patient of the same physiotherapist, which is
-- confidential regardless of what the numbers say. The group total reaches her through
-- challenge_standing() as an aggregate instead — a number with no names behind it.
create policy challenge_participants_own_select on public.challenge_participants for
select
  using (
    exists (
      select
        1
      from
        public.clients c
      where
        c.id = challenge_participants.client_id
        and c.profile_id = auth.uid ()
    )
  );

grant
select,
insert,
update,
delete on public.challenges to authenticated;

grant
select,
insert,
delete on public.challenge_participants to authenticated;

-- Membership is a fact about a moment; correcting it means removing and re-adding, which
-- leaves joined_at honest. `alter default privileges` in 20260810020000 would otherwise
-- have granted UPDATE here without anybody asking for it.
revoke
update on public.challenge_participants
from
  authenticated;

-- ---------------------------------------------------------------------------
-- Reading a challenge
-- ---------------------------------------------------------------------------
-- The two coach-facing functions are deliberately `security invoker`: they read sessions,
-- food logs and client rows through the caller's own policies, so a coach sees her clients
-- and nobody else's without this code containing a single ownership check. A definer
-- function here would mean hand-writing the isolation that RLS already gets right.
--
-- fuel_days counts a day when three of the four meal slots hold something, matching the
-- design's "log three of four meal slots a day". A single banana is not a day's eating, and
-- for a breastfeeding population the whole point of the challenge is energy availability.
create or replace function public.challenge_weeks (p_challenge uuid) returns table (week_no int, total bigint, target bigint) language sql stable security invoker
set
  search_path = public,
  pg_temp as $$
  with ch as (
    select * from public.challenges where id = p_challenge
  ),
  parts as (
    select p.client_id from public.challenge_participants p, ch where p.challenge_id = ch.id
  ),
  wk as (
    select g::int as week_no,
           ch.starts_on + (g - 1) * 7 as from_day,
           ch.starts_on + (g - 1) * 7 + 6 as to_day
    from ch, generate_series(1, ch.weeks) g
  )
  select
    wk.week_no,
    case (select metric from ch)
      when 'sessions_completed' then (
        select count(*)
        from public.sessions s
        where s.client_id in (select client_id from parts)
          and s.status = 'completed'
          and s.scheduled_date between wk.from_day and wk.to_day
      )
      else (
        select count(*)
        from (
          select f.client_id, f.logged_on
          from public.food_logs f
          where f.client_id in (select client_id from parts)
            and f.logged_on between wk.from_day and wk.to_day
          group by f.client_id, f.logged_on
          having count(distinct f.meal) >= 3
        ) full_days
      )
    end as total,
    ((select count(*) from parts) * (select weekly_target from ch))::bigint as target
  from wk
  order by wk.week_no;
$$;

comment on function public.challenge_weeks (uuid) is 'Group total per week for a challenge, with that week''s group target. Invoker rights: a coach sees her own clients, a participant sees only her own contribution.';

-- Participation, ordered by participation.
--
-- Not by performance, and never scored against anything clinical. The coach is the only
-- caller who gets more than one row out of this, because a participant can only see her own
-- membership row.
create or replace function public.challenge_board (p_challenge uuid) returns table (
  client_id uuid,
  name text,
  done bigint,
  target bigint
) language sql stable security invoker
set
  search_path = public,
  pg_temp as $$
  with ch as (
    select * from public.challenges where id = p_challenge
  ),
  span as (
    select ch.starts_on as from_day, ch.starts_on + ch.weeks * 7 - 1 as to_day from ch
  ),
  parts as (
    select p.client_id
    from public.challenge_participants p, ch
    where p.challenge_id = ch.id
  )
  select
    c.id,
    coalesce(nullif(trim(concat_ws(' ', c.first_name_hint, c.last_name_hint)), ''), c.email) as name,
    case (select metric from ch)
      when 'sessions_completed' then (
        select count(*)
        from public.sessions s, span
        where s.client_id = c.id
          and s.status = 'completed'
          and s.scheduled_date between span.from_day and span.to_day
      )
      else (
        select count(*)
        from (
          select f.logged_on
          from public.food_logs f, span
          where f.client_id = c.id
            and f.logged_on between span.from_day and span.to_day
          group by f.logged_on
          having count(distinct f.meal) >= 3
        ) full_days
      )
    end as done,
    ((select weeks from ch) * (select weekly_target from ch))::bigint as target
  from public.clients c
  where c.id in (select client_id from parts)
  order by done desc, name;
$$;

comment on function public.challenge_board (uuid) is 'Per-participant totals for a challenge, ordered by participation. Invoker rights, so only the owning coach ever receives more than her own row.';

-- What a participant is allowed to know: the group's number, and her own.
--
-- Definer rights, and this is the only place in the schema where one client's data reaches
-- another. It is safe because of what it returns rather than who it trusts: four integers.
-- No names, no rows, no way to attribute any part of the total to a person — a participant
-- learns that six people logged sixty-eight sessions, not who logged them. Adding a single
-- text column to this signature would change that, so do not.
--
-- The guard is the first statement, and it fails closed: a caller who is neither a
-- participant nor the owning coach gets nothing back at all.
create or replace function public.challenge_standing (p_challenge uuid) returns table (
  participants int,
  group_total bigint,
  group_target bigint,
  mine bigint
) language plpgsql stable security definer
set
  search_path = public,
  pg_temp as $$
declare
  ch public.challenges;
  me uuid;
begin
  select * into ch from public.challenges where id = p_challenge;
  if ch.id is null then
    return;
  end if;

  select c.id into me
  from public.clients c
  where c.profile_id = auth.uid() and c.id in (
    select p.client_id from public.challenge_participants p where p.challenge_id = ch.id
  );

  -- Neither in it nor running it: nothing.
  if me is null and ch.coach_id is distinct from auth.uid() then
    return;
  end if;

  return query
  with parts as (
    select p.client_id from public.challenge_participants p where p.challenge_id = ch.id
  ),
  span as (
    select ch.starts_on as from_day, ch.starts_on + ch.weeks * 7 - 1 as to_day
  ),
  scored as (
    select
      parts.client_id,
      case ch.metric
        when 'sessions_completed' then (
          select count(*)
          from public.sessions s, span
          where s.client_id = parts.client_id
            and s.status = 'completed'
            and s.scheduled_date between span.from_day and span.to_day
        )
        else (
          select count(*)
          from (
            select f.logged_on
            from public.food_logs f, span
            where f.client_id = parts.client_id
              and f.logged_on between span.from_day and span.to_day
            group by f.logged_on
            having count(distinct f.meal) >= 3
          ) full_days
        )
      end as done
    from parts
  )
  select
    (select count(*)::int from parts),
    (select coalesce(sum(done), 0)::bigint from scored),
    ((select count(*) from parts) * ch.weeks * ch.weekly_target)::bigint,
    (select coalesce(sum(done), 0)::bigint from scored where scored.client_id = me);
end;
$$;

comment on function public.challenge_standing (uuid) is 'Aggregates only: head count, group total, group target, and the caller''s own share. The one place a client learns anything derived from other clients, and it returns no names by design.';

revoke all on function public.challenge_standing (uuid)
from
  public;

grant
execute on function public.challenge_standing (uuid) to authenticated;

grant
execute on function public.challenge_weeks (uuid) to authenticated;

grant
execute on function public.challenge_board (uuid) to authenticated;
