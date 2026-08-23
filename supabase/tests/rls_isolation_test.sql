-- CP1 gate: two clients must not be able to see each other, and a coach must not be
-- able to see another coach's clients.
--
-- Every negative assertion is paired with a POSITIVE one. Without that pairing this
-- whole file passes for the wrong reason: if a GRANT is missing, every query returns
-- zero rows for everybody, and "the other client sees nothing" is satisfied by an
-- app that is simply broken. That exact failure happened during CP1 — the roster was
-- empty because no privileges had been granted, not because RLS was working.
--
-- Run with:  supabase test db
begin;

select
  plan (67);

-- Fixtures -----------------------------------------------------------------
-- Token columns must be '' rather than NULL or GoTrue cannot scan the row.
insert into
  auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    email_confirmed_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change_token_current,
    email_change,
    phone_change,
    phone_change_token,
    reauthentication_token
  )
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'coach.a@test.local', now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'coach.b@test.local', now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client.one@test.local', now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client.two@test.local', now(), '', '', '', '', '', '', '', '');

update public.profiles set role = 'coach' where id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a2'
);

insert into
  public.coaches (id, practice_name)
values
  ('00000000-0000-4000-8000-0000000000a1', 'Practice A'),
  ('00000000-0000-4000-8000-0000000000a2', 'Practice B');

insert into
  public.clients (id, profile_id, coach_id, email, status)
values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'client.one@test.local', 'active'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a2', 'client.two@test.local', 'active');

insert into
  public.consents (client_id, type, policy_version)
values
  ('00000000-0000-4000-8000-0000000000f1', 'health_data_processing', 'test'),
  ('00000000-0000-4000-8000-0000000000f2', 'health_data_processing', 'test');

-- Client One ---------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';

select is (
  (select count(*) from public.clients),
  1::bigint,
  'client one sees exactly one client row (positive control)'
);

select is (
  (select count(*) from public.clients where id = '00000000-0000-4000-8000-0000000000f1'),
  1::bigint,
  'client one CAN see their own row'
);

select is (
  (select count(*) from public.clients where id = '00000000-0000-4000-8000-0000000000f2'),
  0::bigint,
  'client one cannot see client two'
);

select is (
  (select count(*) from public.consents),
  1::bigint,
  'client one sees only their own consent records'
);

-- Client Two ---------------------------------------------------------------
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c2';

select is (
  (select count(*) from public.clients where id = '00000000-0000-4000-8000-0000000000f2'),
  1::bigint,
  'client two CAN see their own row'
);

select is (
  (select count(*) from public.clients where id = '00000000-0000-4000-8000-0000000000f1'),
  0::bigint,
  'client two cannot see client one'
);

-- Coach A ------------------------------------------------------------------
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';

select is (
  (select count(*) from public.clients),
  1::bigint,
  'coach A sees exactly their own one client'
);

select is (
  (select count(*) from public.clients where coach_id = '00000000-0000-4000-8000-0000000000a1'),
  1::bigint,
  'coach A CAN see their own client (positive control)'
);

select is (
  (select count(*) from public.clients where coach_id = '00000000-0000-4000-8000-0000000000a2'),
  0::bigint,
  'coach A cannot see coach B clients'
);

select is (
  (select count(*) from public.profiles where id = '00000000-0000-4000-8000-0000000000c1'),
  1::bigint,
  'coach A CAN read the profile of their own client'
);

select is (
  (select count(*) from public.profiles where id = '00000000-0000-4000-8000-0000000000c2'),
  0::bigint,
  'coach A cannot read the profile of coach B''s client'
);

select is (
  (select count(*) from public.consents),
  1::bigint,
  'coach A sees consent records for their own client only'
);

-- Coach B ------------------------------------------------------------------
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a2';

select is (
  (select count(*) from public.clients),
  1::bigint,
  'coach B sees exactly their own one client'
);

-- Anonymous ----------------------------------------------------------------
set local role anon;

select throws_ok (
  'select count(*) from public.clients',
  '42501',
  null,
  'anonymous is denied outright, not merely filtered to zero rows'
);


-- Exercise library ---------------------------------------------------------
-- Back to the owner role to seed fixtures: the previous block left us as `anon`, and
-- as `authenticated` the WITH CHECK would rightly refuse a row owned by another coach.
reset role;

insert into
  public.exercises (coach_id, name, category, equipment)
values
  ('00000000-0000-4000-8000-0000000000a1', 'A-only Exercise', 'strength', 'Barbell'),
  ('00000000-0000-4000-8000-0000000000a2', 'B-only Exercise', 'strength', 'Barbell');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';

select is (
  (select count(*) from public.exercises where name = 'A-only Exercise'),
  1::bigint,
  'coach A CAN see their own custom exercise (positive control)'
);

select is (
  (select count(*) from public.exercises where name = 'B-only Exercise'),
  0::bigint,
  'coach A cannot see coach B custom exercise'
);

select isnt (
  (select count(*) from public.exercises where coach_id is null),
  0::bigint,
  'the shipped library is visible to a coach'
);

select is (
  (select count(*) from public.exercises where coach_id = '00000000-0000-4000-8000-0000000000a2'),
  0::bigint,
  'coach A sees no rows owned by coach B at all'
);


-- Programmes and sessions --------------------------------------------------
reset role;

insert into public.programs (id, coach_id, name, duration_weeks)
values
  ('00000000-0000-4000-8000-00000000d0a1', '00000000-0000-4000-8000-0000000000a1', 'A Programme', 2),
  ('00000000-0000-4000-8000-00000000d0a2', '00000000-0000-4000-8000-0000000000a2', 'B Programme', 2);

-- Explicit ids: a later test needs to name client one's session while acting AS client
-- two, and a subquery would be filtered by RLS to NULL — which would make the function
-- raise 'session not found' and the test pass for entirely the wrong reason.
insert into public.sessions (id, client_id, title, scheduled_date)
values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000f1', 'A client session', current_date),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-0000000000f2', 'B client session', current_date);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';

select is (
  (select count(*) from public.programs),
  1::bigint,
  'coach A sees only their own programme (positive control included)'
);

select is (
  (select count(*) from public.sessions),
  1::bigint,
  'coach A sees sessions for their client only'
);

-- The client herself -------------------------------------------------------
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';

select is (
  (select count(*) from public.sessions),
  1::bigint,
  'client one CAN see her own sessions'
);

select is (
  (select count(*) from public.programs),
  0::bigint,
  'a client cannot read programmes at all — she reads sessions, not prescriptions'
);


-- Metrics and health import -------------------------------------------------
reset role;

insert into public.metrics (client_id, recorded_at, type, value, source, external_id)
values
  ('00000000-0000-4000-8000-0000000000f1', now(), 'weight_kg', 66.4, 'healthkit', 'hk-a-1'),
  ('00000000-0000-4000-8000-0000000000f2', now(), 'weight_kg', 71.2, 'healthkit', 'hk-b-1');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';

select is (
  (select count(*) from public.metrics),
  1::bigint,
  'client one sees only her own readings (positive control)'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';

select is (
  (select count(*) from public.metrics),
  1::bigint,
  'coach A sees readings for her own client only'
);

-- Idempotency: the same HealthKit sample uuid must never land twice. This is the whole
-- reason the import re-reads overlapping windows instead of tracking a watermark.
reset role;

select throws_ok (
  $$insert into public.metrics (client_id, recorded_at, type, value, source, external_id)
    values ('00000000-0000-4000-8000-0000000000f1', now(), 'weight_kg', 66.4, 'healthkit', 'hk-a-1')$$,
  '23505',
  null,
  'a repeated HealthKit sample uuid is rejected by the unique index'
);

-- Manual entries carry no external id, so two on one day must both be allowed.
select lives_ok (
  $$insert into public.metrics (client_id, recorded_at, type, value, source)
    values ('00000000-0000-4000-8000-0000000000f1', now(), 'weight_kg', 66.2, 'manual'),
           ('00000000-0000-4000-8000-0000000000f1', now(), 'weight_kg', 66.9, 'manual')$$,
  'two manual readings on the same day are both kept'
);

-- A client must not be able to read another client's session plan.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c2';

select throws_ok (
  $$select * from public.get_session_plan('00000000-0000-4000-8000-0000000000e1')$$,
  '42501',
  null,
  'client two cannot read the session plan of client one'
);

-- ---------------------------------------------------------------------------
-- Nutrition
-- ---------------------------------------------------------------------------

reset role;

insert into
  public.nutrition_targets (client_id, coach_id, effective_from, kcal, protein_g, carbs_g, fat_g)
values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', current_date - 10, 2400, 120, 280, 80),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000a2', current_date - 10, 2100, 110, 240, 70);

insert into
  public.food_logs (client_id, logged_on, meal, description, kcal, protein_g, carbs_g, fat_g, source)
values
  ('00000000-0000-4000-8000-0000000000f1', current_date, 'breakfast', 'Porridge', 350, 12, 55, 8, 'search'),
  ('00000000-0000-4000-8000-0000000000f2', current_date, 'breakfast', 'Toast', 220, 8, 38, 4, 'search');

insert into
  public.foods (coach_id, source, name, kcal_100g, protein_100g, carbs_100g, fat_100g)
values
  ('00000000-0000-4000-8000-0000000000a1', 'custom', 'A-only Food', 118, 4.6, 15.2, 4.1),
  ('00000000-0000-4000-8000-0000000000a2', 'custom', 'B-only Food', 209, 26, 0, 11.6);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';

-- Positive control first: without it, an empty result below proves nothing.
select is (
  (select count(*) from public.food_logs),
  1::bigint,
  'client one sees her own diary entry'
);

select is (
  (select count(*) from public.food_logs where client_id = '00000000-0000-4000-8000-0000000000f2'),
  0::bigint,
  'client one cannot read client two''s diary'
);

select is (
  (select count(*) from public.nutrition_targets),
  1::bigint,
  'client one reads her own target and no other'
);

-- She may read the target but never write one; setting her own would defeat the point
-- of a coach-led model.
select throws_ok (
  $$insert into public.nutrition_targets (client_id, coach_id, effective_from, kcal, protein_g, carbs_g, fat_g)
    values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000a1', current_date, 1200, 60, 120, 40)$$,
  '42501',
  null,
  'a client cannot set her own macro target'
);

select throws_ok (
  $$select * from public.nutrition_days('00000000-0000-4000-8000-0000000000f2', current_date - 6, current_date)$$,
  '42501',
  null,
  'client one cannot read client two''s daily totals'
);

-- She must be able to find the foods her own coach added — that is what they are for.
-- Getting this wrong made the search box return nothing and look merely empty.
select is (
  (select count(*) from public.foods where name = 'A-only Food'),
  1::bigint,
  'a client CAN search the custom foods her own coach created'
);

select is (
  (select count(*) from public.foods where name = 'B-only Food'),
  0::bigint,
  'a client cannot see another coach''s custom foods'
);

-- The coach reads the diary, and only her own client's.
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';

select is (
  (select count(*) from public.food_logs),
  1::bigint,
  'coach A reads her own client''s diary and no other'
);

select is (
  (select entries from public.nutrition_days('00000000-0000-4000-8000-0000000000f1', current_date, current_date)),
  1::int,
  'the coach''s daily totals resolve through the same function the app uses'
);

select is (
  (select target_kcal from public.nutrition_days('00000000-0000-4000-8000-0000000000f1', current_date, current_date)),
  2400,
  'the target in force on the day is attached to it'
);

-- What a client ate is her account of her own day. A coach silently editing it would
-- make the record worth nothing.
update public.food_logs
set kcal = 1
where client_id = '00000000-0000-4000-8000-0000000000f1';

select is (
  (select kcal from public.food_logs where client_id = '00000000-0000-4000-8000-0000000000f1'),
  350::numeric,
  'a coach cannot rewrite what her client logged'
);

-- ---------------------------------------------------------------------------
-- HealthKit import: one row per day, and a day that is allowed to grow
-- ---------------------------------------------------------------------------

-- Apple Health hands out interval samples, not daily figures, so the import buckets them
-- by day on the device and keys each row `type:YYYY-MM-DD`. That key changes what the
-- write has to guarantee, and these assertions pin both halves of it.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';

-- One payload repeating a day key must collapse rather than abort. Postgres refuses to
-- update the same row twice in one upsert, so without the dedup step this raises
-- 'cannot affect row a second time' and loses the entire sync, not just the duplicate.
select is (
  public.import_health_metrics (
    '[{"type":"steps","recordedAt":"2026-08-17T09:00:00Z","value":1200,"externalId":"steps:2026-08-17"},
      {"type":"steps","recordedAt":"2026-08-17T10:00:00Z","value":1500,"externalId":"steps:2026-08-17"}]'::jsonb
  ),
  1,
  'a payload repeating one day key writes a single row'
);

select is (
  (select count(*) from public.metrics
   where client_id = '00000000-0000-4000-8000-0000000000f1' and external_id = 'steps:2026-08-17'),
  1::bigint,
  'the day key is stored exactly once'
);

select is (
  (select value from public.metrics
   where client_id = '00000000-0000-4000-8000-0000000000f1' and external_id = 'steps:2026-08-17'),
  1500::numeric,
  'the later sample in the payload is the one kept'
);

-- Re-syncing a day later in the afternoon must RAISE its total. This is precisely what
-- `on conflict do nothing` could not do: a day first synced at 9am would have stayed
-- pinned at its morning figure permanently, which is a quieter bug than the one the
-- rollup was written to fix and a good deal harder to notice.
select is (
  public.import_health_metrics (
    '[{"type":"steps","recordedAt":"2026-08-17T18:00:00Z","value":8400,"externalId":"steps:2026-08-17"}]'::jsonb
  ),
  1,
  're-importing the same day reports a row written, not zero'
);

select is (
  (select value from public.metrics
   where client_id = '00000000-0000-4000-8000-0000000000f1' and external_id = 'steps:2026-08-17'),
  8400::numeric,
  'a daily total climbs as later samples arrive'
);

select is (
  (select count(*) from public.metrics
   where client_id = '00000000-0000-4000-8000-0000000000f1' and type = 'steps'),
  1::bigint,
  'and the re-import does not accumulate a second row for that day'
);

-- ---------------------------------------------------------------------------
-- create_client_invite resolves to exactly one function
-- ---------------------------------------------------------------------------

-- A second overload once sat beside this one, left behind by a `create or replace` that
-- changed the argument list. Every five-argument call then matched both candidates and
-- Postgres refused to choose, which broke inviting a client from the portal outright.
--
-- The seed never caught it: it passes all eight arguments, which matches the newer
-- function uniquely. So the only call shape the application actually sends was the one
-- shape nothing tested. Both halves are asserted below — the count, and the arity.
reset role;

select is (
  (select count(*) from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_client_invite'),
  1::bigint,
  'exactly one create_client_invite exists, so no call can be ambiguous'
);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';

-- Named arguments, five of them: byte for byte what the portal's createInvite sends.
select lives_ok (
  $$select * from public.create_client_invite(
      p_email => 'new.patient@test.local',
      p_first_name => 'New',
      p_last_name => 'Patient',
      p_condition => 'Sore knee',
      p_goal => 'Walk 5k without pain'
    )$$,
  'the five-argument invite the portal sends resolves and runs'
);

-- ---------------------------------------------------------------------------
-- Messages: both sides read the thread, neither can write as the other
-- ---------------------------------------------------------------------------

reset role;

insert into public.messages (client_id, sender, body)
values
  ('00000000-0000-4000-8000-0000000000f1', 'coach', 'How did Friday feel?'),
  ('00000000-0000-4000-8000-0000000000f2', 'coach', 'Other practice, other client');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';

select is (
  (select count(*) from public.messages),
  1::bigint,
  'client one sees only her own thread (positive control)'
);

select lives_ok (
  $$insert into public.messages (client_id, sender, body)
    values ('00000000-0000-4000-8000-0000000000f1', 'client', 'Sore on the bounds, fine otherwise')$$,
  'a client can write to her own thread as herself'
);

-- The forgery guard. Without the sender check on the insert policy, `sender` would be a
-- decoration the recipient could set, and clinical advice could be fabricated by the
-- person receiving it.
select throws_ok (
  $$insert into public.messages (client_id, sender, body)
    values ('00000000-0000-4000-8000-0000000000f1', 'coach', 'Cleared to run — signed, your physio')$$,
  '42501',
  null,
  'a client CANNOT post a message that appears to come from her physiotherapist'
);

select throws_ok (
  $$insert into public.messages (client_id, sender, body)
    values ('00000000-0000-4000-8000-0000000000f2', 'client', 'Into another client thread')$$,
  '42501',
  null,
  'a client cannot write into another client thread'
);

-- Coach A reads her own client's thread and writes as the coach.
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';

select is (
  (select count(*) from public.messages),
  2::bigint,
  'coach A sees the thread for her own client only, both directions'
);

select lives_ok (
  $$insert into public.messages (client_id, sender, body)
    values ('00000000-0000-4000-8000-0000000000f1', 'coach', 'Then we hold the impact work')$$,
  'a coach can reply as the coach'
);

-- Coach B owns a different practice and must see none of it.
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a2';

select is (
  (select count(*) from public.messages where client_id = '00000000-0000-4000-8000-0000000000f1'),
  0::bigint,
  'coach B cannot read another practice thread'
);

-- ---------------------------------------------------------------------------
-- A client sees her own coach, and only her own
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';

select is (
  (select count(*) from public.coaches where id = '00000000-0000-4000-8000-0000000000a1'),
  1::bigint,
  'client one CAN see the practice she belongs to (positive control)'
);

select is (
  (select practice_name from public.coaches where id = '00000000-0000-4000-8000-0000000000a1'),
  'Practice A',
  'and reads its name, which the invitation email already told her'
);

select is (
  (select count(*) from public.coaches where id = '00000000-0000-4000-8000-0000000000a2'),
  0::bigint,
  'client one cannot see a practice she has no relationship with'
);

select is (
  (select count(*) from public.profiles where id = '00000000-0000-4000-8000-0000000000a2'),
  0::bigint,
  'nor that other coach''s profile'
);

select is (
  (select count(*) from public.profiles where id = '00000000-0000-4000-8000-0000000000c2'),
  0::bigint,
  'and still cannot see another client — the new policy widened nothing else'
);

-- ---------------------------------------------------------------------------
-- Daily reads: hers to write, her coach's to see, nobody's to revise
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';

select lives_ok (
  $$insert into public.daily_reads (client_id, read_on, read_window, readiness, symptom)
    values ('00000000-0000-4000-8000-0000000000f1', '2026-08-23', 'morning', 3, 'Nothing')$$,
  'a client can log her own morning read (positive control)'
);

-- The lock. Enforced by the index rather than by the app, because "already logged" is a
-- fact about the data and an app that forgets it would let a window be overwritten.
select throws_ok (
  $$insert into public.daily_reads (client_id, read_on, read_window, readiness)
    values ('00000000-0000-4000-8000-0000000000f1', '2026-08-23', 'morning', 1)$$,
  '23505',
  null,
  'the same window on the same day cannot be logged twice'
);

select lives_ok (
  $$insert into public.daily_reads (client_id, read_on, read_window, readiness)
    values ('00000000-0000-4000-8000-0000000000f1', '2026-08-23', 'evening', 2)$$,
  'but a different window the same day is fine'
);

-- Denied by privilege, not merely filtered to nothing. Default privileges in this schema
-- hand `authenticated` UPDATE on every new table, so without the explicit revoke this
-- statement succeeds against zero rows — an immutability guarantee that holds only while
-- nobody adds a policy, and fails silently when somebody does.
select throws_ok (
  $$update public.daily_reads set readiness = 0
    where client_id = '00000000-0000-4000-8000-0000000000f1'$$,
  '42501',
  null,
  'a locked read cannot be revised, even by the person who wrote it'
);

select throws_ok (
  $$delete from public.daily_reads
    where client_id = '00000000-0000-4000-8000-0000000000f1'$$,
  '42501',
  null,
  'nor deleted — the history is the point'
);

select throws_ok (
  $$insert into public.daily_reads (client_id, read_on, read_window, readiness)
    values ('00000000-0000-4000-8000-0000000000f2', '2026-08-23', 'morning', 4)$$,
  '42501',
  null,
  'and she cannot log a read against another client'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';

select is (
  (select count(*) from public.daily_reads),
  2::bigint,
  'her coach can finally see them — which is the whole reason for the table'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a2';

select is (
  (select count(*) from public.daily_reads),
  0::bigint,
  'another practice sees none of it'
);

-- ---------------------------------------------------------------------------
-- The anonymous role holds nothing
-- ---------------------------------------------------------------------------

-- A hosted project applies its own default privileges, and the deployed database was
-- found holding SELECT for `anon` on four tables that RLS alone was protecting. Empty
-- results and denied results look identical from outside; this asserts the difference.
reset role;

select is (
  (select count(*) from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'),
  0::bigint,
  'anon holds no privilege on any table in public'
);

select * from finish ();

rollback;
