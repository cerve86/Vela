-- CP1 gate: two clients must not be able to see each other, and a coach must not be
-- able to see another coach's clients. This file is the executable form of that
-- checkpoint — CI runs it and the phase is not done until it passes.
--
-- Run with:  supabase test db
begin;

select
  plan (8);

-- Fixtures -----------------------------------------------------------------
insert into
  auth.users (id, email)
values
  (
    '00000000-0000-0000-0000-00000000c0a1',
    'coach.a@example.com'
  ),
  (
    '00000000-0000-0000-0000-00000000c0a2',
    'coach.b@example.com'
  ),
  (
    '00000000-0000-0000-0000-0000000c1e01',
    'client.one@example.com'
  ),
  (
    '00000000-0000-0000-0000-0000000c1e02',
    'client.two@example.com'
  );

insert into
  public.profiles (id, role, first_name, last_name)
values
  (
    '00000000-0000-0000-0000-00000000c0a1',
    'coach',
    'Coach',
    'A'
  ),
  (
    '00000000-0000-0000-0000-00000000c0a2',
    'coach',
    'Coach',
    'B'
  ),
  (
    '00000000-0000-0000-0000-0000000c1e01',
    'client',
    'Client',
    'One'
  ),
  (
    '00000000-0000-0000-0000-0000000c1e02',
    'client',
    'Client',
    'Two'
  );

insert into
  public.coaches (id, practice_name)
values
  ('00000000-0000-0000-0000-00000000c0a1', 'Practice A'),
  ('00000000-0000-0000-0000-00000000c0a2', 'Practice B');

insert into
  public.clients (id, profile_id, coach_id, email, status)
values
  (
    '00000000-0000-0000-0000-00000000cl01',
    '00000000-0000-0000-0000-0000000c1e01',
    '00000000-0000-0000-0000-00000000c0a1',
    'client.one@example.com',
    'active'
  ),
  (
    '00000000-0000-0000-0000-00000000cl02',
    '00000000-0000-0000-0000-0000000c1e02',
    '00000000-0000-0000-0000-00000000c0a2',
    'client.two@example.com',
    'active'
  );

-- Client One ---------------------------------------------------------------
set
  local role authenticated;

set
  local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c1e01';

select
  is (
    (
      select
        count(*)
      from
        public.clients
    ),
    1::bigint,
    'client one sees exactly one client row'
  );

select
  is (
    (
      select
        count(*)
      from
        public.clients
      where
        id = '00000000-0000-0000-0000-00000000cl02'
    ),
    0::bigint,
    'client one cannot see client two'
  );

-- Client Two ---------------------------------------------------------------
set
  local request.jwt.claim.sub = '00000000-0000-0000-0000-0000000c1e02';

select
  is (
    (
      select
        count(*)
      from
        public.clients
    ),
    1::bigint,
    'client two sees exactly one client row'
  );

select
  is (
    (
      select
        count(*)
      from
        public.clients
      where
        id = '00000000-0000-0000-0000-00000000cl01'
    ),
    0::bigint,
    'client two cannot see client one'
  );

-- Coach A ------------------------------------------------------------------
set
  local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c0a1';

select
  is (
    (
      select
        count(*)
      from
        public.clients
    ),
    1::bigint,
    'coach A sees only their own client'
  );

select
  is (
    (
      select
        count(*)
      from
        public.clients
      where
        coach_id = '00000000-0000-0000-0000-00000000c0a2'
    ),
    0::bigint,
    'coach A cannot see coach B clients'
  );

-- Coach B ------------------------------------------------------------------
set
  local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000c0a2';

select
  is (
    (
      select
        count(*)
      from
        public.clients
    ),
    1::bigint,
    'coach B sees only their own client'
  );

-- Anonymous ----------------------------------------------------------------
set
  local role anon;

select
  is (
    (
      select
        count(*)
      from
        public.clients
    ),
    0::bigint,
    'anonymous sees nothing'
  );

select
  *
from
  finish ();

rollback;
