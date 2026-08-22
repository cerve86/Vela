-- ---------------------------------------------------------------------------
-- One HealthKit reading per metric per day
-- ---------------------------------------------------------------------------

/**
 * Apple Health does not hand out daily figures. It hands out samples: a step count is
 * dozens of short interval rows per day, HRV several a night. Importing those verbatim
 * put 2,056 step rows and 494 HRV rows into one client's 90 days, and broke the product
 * in two separate ways.
 *
 * The visible one: a chart point read "168 steps", because it was a ten-minute bucket
 * rather than a day. The invisible one, which was worse: PostgREST caps result rows
 * server-side and applies the cap after ordering, so an ascending read over a window
 * holding more rows than the cap returns the OLDEST thousand and silently drops the rest.
 * Every screen sat frozen at a date three weeks in the past with no error anywhere.
 *
 * Aggregation itself belongs on the device — only the phone knows which timezone its
 * owner is living in, and a day summed in UTC cuts a Singapore day at 8am. What belongs
 * here is the write contract that makes a day key safe, and the repair of rows already
 * stored under the old scheme.
 */

-- ---------------------------------------------------------------------------
-- The import becomes an upsert
-- ---------------------------------------------------------------------------

/**
 * Same signature, one changed guarantee: a repeated day key now updates rather than being
 * ignored.
 *
 * Under a sample UUID, `do nothing` was correct — a sample is immutable, so a second
 * sighting carries no news. Under a day key the opposite holds. Sync at 9am and today's
 * total is a few hundred steps; sync again at 6pm and the same key must climb to the real
 * figure. `do nothing` would have pinned every day at whatever its first sync of the
 * morning happened to catch, which is a subtler and more damaging bug than the one this
 * migration set out to fix.
 *
 * The count returned is therefore rows *written*, not rows new. Callers surface it to a
 * client as "imported N days", where an updated day is every bit as true as a fresh one.
 */
create or replace function public.import_health_metrics (p_samples jsonb) returns int language plpgsql security definer
set
  search_path = public as $$
declare
  v_client uuid;
  v_written int;
begin
  select c.id into v_client from public.clients c where c.profile_id = auth.uid();
  if v_client is null then
    raise exception 'no client record for this user' using errcode = '42501';
  end if;

  -- Health data may only be imported once the client has actually consented to us
  -- processing it. Without this the consent screen would be decoration.
  if not public.has_health_consent(v_client) then
    raise exception 'health data consent not granted' using errcode = '42501';
  end if;

  with incoming as (
    select
      (s->>'type')::public.metric_type as type,
      (s->>'recordedAt')::timestamptz as recorded_at,
      (s->>'value')::numeric as value,
      nullif(s->>'externalId', '') as external_id
    from jsonb_array_elements(p_samples) as s
  ),
  -- One row per (type, external_id) before it reaches the insert. Postgres refuses to
  -- update the same row twice in a single upsert, so a payload that repeated a day key
  -- would abort the whole import with "cannot affect row a second time". The device
  -- already buckets, making this a guard rather than a workaround — but a guard on the
  -- one failure mode that would take out an entire sync.
  deduped as (
    select distinct on (type, external_id) type, recorded_at, value, external_id
    from incoming
    where external_id is not null
    order by type, external_id, recorded_at desc
  ),
  ins as (
    insert into public.metrics (client_id, recorded_at, type, value, source, external_id)
    select v_client, d.recorded_at, d.type, d.value, 'healthkit', d.external_id
    from deduped d
    on conflict (client_id, type, external_id) where external_id is not null
      do update set value = excluded.value, recorded_at = excluded.recorded_at
    returning 1
  )
  select count(*) into v_written from ins;

  return v_written;
end;
$$;

grant
execute on function public.import_health_metrics (jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Repair what the old scheme already wrote
-- ---------------------------------------------------------------------------

/**
 * Collapses stored raw samples to one row per client, type and day.
 *
 * Bucketed in UTC, which is the best this side can do — the timezone each reading was
 * taken in is not recorded, and inventing one would be worse than approximating. The
 * approximation is self-correcting: the day keys written here share the device's
 * `type:YYYY-MM-DD` format, so the next sync from the phone upserts straight onto these
 * rows and replaces each one with a correctly bucketed local-day figure.
 *
 * Summed for cumulative types and averaged for the rest, matching the device.
 */
create temporary table hk_daily on commit drop as
select
  client_id,
  type,
  (recorded_at at time zone 'UTC')::date as day,
  case when type = 'steps' then sum(value) else avg(value) end as value,
  max(recorded_at) as recorded_at
from public.metrics
where source = 'healthkit'
group by client_id, type, (recorded_at at time zone 'UTC')::date;

delete from public.metrics where source = 'healthkit';

insert into public.metrics (client_id, recorded_at, type, value, source, external_id)
select
  client_id,
  recorded_at,
  type,
  round(value, 3),
  'healthkit',
  type::text || ':' || to_char(day, 'YYYY-MM-DD')
from hk_daily;
