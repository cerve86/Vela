-- Freshness for the coach, the divergence flag, and cycle context.
--
-- 1. Session load is defined once, here, and everything reads it: the portal's freshness
--    panel, the client report, and the divergence flag. Foster's session-RPE (RPE x
--    minutes). Where Strava supplied the session with heart rate, the intensity comes from
--    heart rate instead and the duration from Strava, so the units stay the same and the
--    ratio stays coherent when sources mix.
-- 2. Acute:chronic, monotony and strain are context for the coach, never a gate. The
--    ratio alone raises nothing: a flag needs load and wellness to disagree.
-- 3. Cycle and menopause context is special-category data with its own consent. The coach
--    reads it only while that consent stands; withdrawing it deletes it.

-- ---------------------------------------------------------------------------
-- Session load
-- ---------------------------------------------------------------------------

/**
 * One row per completed session with a duration, between two dates. `intensity` is on
 * the CR-10 scale; `basis` says where it came from: heart_rate (Strava average heart rate
 * against her maximum), rpe (what she told the app), or strava_rpe (perceived exertion
 * entered on Strava). `load` is null when none of them exists.
 *
 * Her maximum is the higher of the highest heart rate Strava recorded in six months and
 * 220 minus her age, so a client who only runs easy is not read as working hard.
 * Security invoker: row security decides whose sessions are visible.
 */
create or replace function public.session_loads (p_client uuid, p_from date, p_to date) returns table (
  session_id uuid,
  day date,
  minutes numeric,
  intensity numeric,
  basis text,
  load numeric
) language sql stable
set
  search_path = public as $$
  with hr_max as (
    select greatest(
      (select max(a.max_hr) from public.activities a
        where a.client_id = p_client and a.local_date > p_to - 180),
      (select 220 - extract(year from age(p_to, c.date_of_birth))::numeric
        from public.clients c where c.id = p_client and c.date_of_birth is not null)
    ) as v
  ),
  base as (
    select
      s.id,
      s.scheduled_date as day,
      s.duration_sec / 60.0 as minutes,
      s.session_rpe::numeric as rpe,
      a.avg_hr,
      nullif(a.raw ->> 'perceived_exertion', '')::numeric as strava_rpe
    from public.sessions s
    left join lateral (
      select a.avg_hr, a.raw from public.activities a
      where a.session_id = s.id
      order by a.started_at
      limit 1
    ) a on true
    where s.client_id = p_client
      and s.status = 'completed'
      and s.scheduled_date between p_from and p_to
      and coalesce(s.duration_sec, 0) > 0
  ),
  scored as (
    select b.*,
      case when b.avg_hr is not null and h.v >= 150 then
        case
          when b.avg_hr / h.v < 0.65 then 2
          when b.avg_hr / h.v < 0.75 then 3
          when b.avg_hr / h.v < 0.82 then 4
          when b.avg_hr / h.v < 0.87 then 5
          when b.avg_hr / h.v < 0.92 then 7
          else 9
        end
      end::numeric as hr_rpe
    from base b cross join hr_max h
  )
  select
    id,
    day,
    round(minutes, 1),
    coalesce(hr_rpe, rpe, strava_rpe),
    case
      when hr_rpe is not null then 'heart_rate'
      when rpe is not null then 'rpe'
      when strava_rpe is not null then 'strava_rpe'
    end,
    round(minutes * coalesce(hr_rpe, rpe, strava_rpe))
  from scored
$$;

grant
execute on function public.session_loads (uuid, date, date) to authenticated;

/**
 * The week against the month, from session load. Acute is the last seven days' load;
 * chronic is the 28-day load as a weekly average (so the two are on one scale, and the
 * ratio is coupled, as the spec's caveat says). Monotony is the mean daily load over its
 * spread across the last seven days, rest days counting as zero; strain is the week's
 * load times monotony. `history_days` is how long she has been recording, and the ratio
 * means little under 21.
 */
create or replace function public.client_freshness (p_client uuid, p_today date default current_date) returns table (
  acute numeric,
  chronic numeric,
  ratio numeric,
  monotony numeric,
  strain numeric,
  sessions7 integer,
  unmeasured7 integer,
  history_days integer
) language sql stable
set
  search_path = public as $$
  with l as (
    select * from public.session_loads(p_client, p_today - 27, p_today)
  ),
  days as (
    select g::date as day, coalesce((select sum(l.load) from l where l.day = g::date), 0) as load
    from generate_series(p_today - 27, p_today, interval '1 day') g
  ),
  week as (
    select sum(load) as total, avg(load) as mean, stddev_pop(load) as sd
    from days where day > p_today - 7
  ),
  month as (
    select sum(load) / 4.0 as weekly from days
  )
  select
    w.total,
    round(m.weekly, 1),
    case when m.weekly > 0 then round(w.total / m.weekly, 2) end,
    case when w.sd > 0 then round(w.mean / w.sd, 2) end,
    case when w.sd > 0 then round(w.total * w.mean / w.sd) end,
    (select count(*)::integer from l where l.day > p_today - 7),
    (select count(*)::integer from l where l.day > p_today - 7 and l.load is null),
    coalesce(p_today - (
      select min(s.scheduled_date) from public.sessions s
      where s.client_id = p_client and s.status = 'completed'
    ), 0)
  from week w cross join month m
$$;

grant
execute on function public.client_freshness (uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- The divergence flag
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
    'divergence'
  )
);

/**
 * Raised when a weekly wellness check disagrees with training load: wellness three or
 * more points worse than her last few weeks while the ratio is steady, or the ratio up
 * past 1.5 while wellness is no worse. Needs two earlier checks and three weeks of
 * recording; without both there is nothing to diverge from, and the ratio alone never
 * raises anything.
 */
create or replace function public.raise_wellness_flags () returns trigger language plpgsql security definer
set
  search_path = public as $$
declare
  v_coach uuid;
  v_total integer := new.sleep + new.fatigue + new.soreness + new.stress;
  v_prev numeric;
  v_n integer;
  f record;
begin
  select avg(w.sleep + w.fatigue + w.soreness + w.stress), count(*) into v_prev, v_n
  from (
    select * from public.wellness_checks w
    where w.client_id = new.client_id and w.week_start < new.week_start
    order by w.week_start desc
    limit 3
  ) w;
  if v_n < 2 then
    return new;
  end if;

  select * into f from public.client_freshness(new.client_id, current_date);
  if f.history_days < 21 or f.ratio is null then
    return new;
  end if;

  select c.coach_id into v_coach from public.clients c where c.id = new.client_id;

  if v_total - v_prev >= 3 and f.ratio between 0.8 and 1.3 then
    insert into public.coach_flags (client_id, coach_id, kind, detail)
    values (new.client_id, v_coach, 'divergence',
      format('Weekly wellness is %s points worse than her recent weeks (%s against %s, 4 is best) while training load is steady (acute:chronic %s). Worth asking what is happening outside training.',
        round(v_total - v_prev, 1), v_total, round(v_prev, 1), f.ratio))
    on conflict do nothing;
  elsif v_total - v_prev <= 0 and f.ratio > 1.5 then
    insert into public.coach_flags (client_id, coach_id, kind, detail)
    values (new.client_id, v_coach, 'divergence',
      format('Training load is up sharply (acute:chronic %s) while her weekly wellness is no worse than usual (%s against %s). Worth a check-in before it shows.',
        f.ratio, v_total, round(v_prev, 1)))
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger wellness_raise_flags
after insert
or
update of sleep,
fatigue,
soreness,
stress on public.wellness_checks for each row
execute function public.raise_wellness_flags ();

-- ---------------------------------------------------------------------------
-- Cycle and menopause context
-- ---------------------------------------------------------------------------

alter type public.consent_type
add value if not exists 'cycle_context';

/** True while the client's consent to share cycle context stands. Compares as text so
 *  this file can use the enum value it adds. */
create or replace function public.has_cycle_consent (p_client uuid) returns boolean language sql stable security definer
set
  search_path = public as $$
  select exists (
    select 1 from public.consents c
    where c.client_id = p_client
      and c.type::text = 'cycle_context'
      and c.revoked_at is null
  );
$$;

create table public.cycle_context (
  client_id uuid primary key references public.clients (id) on delete cascade,
  status text not null check (
    status in (
      'regular',
      'irregular',
      'perimenopause',
      'menopause',
      'not_currently'
    )
  ),
  updated_at timestamptz not null default now()
);

create table public.period_starts (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  started_on date not null,
  created_at timestamptz not null default now(),
  unique (client_id, started_on)
);

alter table public.cycle_context enable row level security;

alter table public.period_starts enable row level security;

create policy cycle_context_client_all on public.cycle_context for all using (public.is_the_client (client_id))
with
  check (
    public.is_the_client (client_id)
    and public.has_cycle_consent (client_id)
  );

create policy cycle_context_coach_read on public.cycle_context for
select
  using (
    public.is_coach_of (client_id)
    and public.has_cycle_consent (client_id)
  );

create policy period_starts_client_all on public.period_starts for all using (public.is_the_client (client_id))
with
  check (
    public.is_the_client (client_id)
    and public.has_cycle_consent (client_id)
  );

create policy period_starts_coach_read on public.period_starts for
select
  using (
    public.is_coach_of (client_id)
    and public.has_cycle_consent (client_id)
  );

grant select, insert, update, delete on public.cycle_context to authenticated;

grant select, insert, delete on public.period_starts to authenticated;

/** Withdrawing consent deletes what it covered. */
create or replace function public.forget_cycle_on_revoke () returns trigger language plpgsql security definer
set
  search_path = public as $$
begin
  if new.type::text = 'cycle_context' and new.revoked_at is not null and old.revoked_at is null
     and not public.has_cycle_consent(new.client_id) then
    delete from public.period_starts where client_id = new.client_id;
    delete from public.cycle_context where client_id = new.client_id;
  end if;
  return new;
end;
$$;

create trigger consents_forget_cycle
after
update of revoked_at on public.consents for each row
execute function public.forget_cycle_on_revoke ();
