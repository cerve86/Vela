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
  plan (18);

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

select * from finish ();

rollback;
