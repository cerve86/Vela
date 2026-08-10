-- Local development seed. Runs on `supabase db reset`.
--
-- Creates one confirmed coach account so the portal is usable immediately. There is no
-- client data here on purpose: clients must arrive through the real invite flow, which
-- is the thing CP1 exists to prove.
--
-- Never run this against a hosted project.

-- The token columns must be '' rather than NULL: GoTrue scans them into Go strings and
-- a NULL there fails every lookup with "error finding user", which surfaces as an
-- opaque "Database error finding user" at the sign-in screen.
insert into
  auth.users (
    id,
    instance_id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    created_at,
    updated_at,
    raw_app_meta_data,
    raw_user_meta_data,
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
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'coach@coachapp.test',
    crypt ('not-used-magic-link-only', gen_salt ('bf')),
    now(),
    now(),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"first_name":"Andrea","last_name":"Cervellin"}',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    ''
  )
on conflict (id) do nothing;

-- GoTrue also needs an identity row, or the account exists but cannot authenticate.
insert into
  auth.identities (
    id,
    user_id,
    provider_id,
    provider,
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
  )
values
  (
    gen_random_uuid (),
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000001',
    'email',
    '{"sub":"00000000-0000-4000-8000-000000000001","email":"coach@coachapp.test","email_verified":true,"phone_verified":false}',
    now(),
    now(),
    now()
  )
on conflict do nothing;

-- The handle_new_user trigger created a 'client' profile; a coach is promoted deliberately.
update public.profiles
set
  role = 'coach',
  first_name = 'Andrea',
  last_name = 'Cervellin'
where
  id = '00000000-0000-4000-8000-000000000001';

insert into
  public.coaches (id, practice_name)
values
  (
    '00000000-0000-4000-8000-000000000001',
    'Cervellin Physiotherapy & Performance'
  )
on conflict (id) do nothing;
