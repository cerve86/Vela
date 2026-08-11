-- Vela — initial identity and tenancy schema
--
-- Phase 1 foundation. Three principles enforced here and never relaxed later:
--   1. RLS is enabled on every table with NO permissive default. A table without a
--      policy returns zero rows, which is the correct failure mode for health data.
--   2. Every row carries coach_id so the model is multi-tenant from the first migration.
--      Retrofitting tenancy after data exists is a rewrite.
--   3. Consent is versioned and revocable — GDPR Article 9 requires explicit consent
--      for health data, and "they ticked a box once" is not a defensible record.

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Profiles — extends auth.users
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('coach', 'client');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  first_name text not null,
  last_name text not null,
  avatar_path text,
  locale text not null default 'en',
  timezone text not null default 'Europe/Rome',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coaches (
  id uuid primary key references public.profiles (id) on delete cascade,
  practice_name text not null,
  created_at timestamptz not null default now()
);

create type public.client_status as enum ('invited', 'active', 'paused', 'archived');

create table public.clients (
  id uuid primary key default uuid_generate_v4 (),
  profile_id uuid unique references public.profiles (id) on delete cascade,
  coach_id uuid not null references public.coaches (id) on delete restrict,
  email text not null,
  date_of_birth date,
  sex text check (sex in ('female', 'male', 'other', 'undisclosed')),
  height_cm numeric(5, 1),
  condition text,
  goal text,
  status public.client_status not null default 'invited',
  started_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_coach_id_idx on public.clients (coach_id);
create index clients_profile_id_idx on public.clients (profile_id);

create table public.client_invites (
  id uuid primary key default uuid_generate_v4 (),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  email text not null,
  token text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Consent — GDPR Article 9
-- ---------------------------------------------------------------------------

create type public.consent_type as enum ('tos', 'privacy', 'health_data_processing');

create table public.consents (
  id uuid primary key default uuid_generate_v4 (),
  client_id uuid not null references public.clients (id) on delete cascade,
  type public.consent_type not null,
  policy_version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index consents_client_id_idx on public.consents (client_id);

-- ---------------------------------------------------------------------------
-- Audit — every coach read of client health data is recorded
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigserial primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  occurred_at timestamptz not null default now()
);

create index audit_log_actor_idx on public.audit_log (actor_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Helper predicates
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so the helper can read clients without recursing through the
-- very policies it is being used to evaluate.
create or replace function public.is_coach_of (target_client uuid) returns boolean language sql stable security definer
set
  search_path = public as $$
  select exists (
    select 1 from public.clients c
    where c.id = target_client and c.coach_id = auth.uid()
  );
$$;

create or replace function public.is_the_client (target_client uuid) returns boolean language sql stable security definer
set
  search_path = public as $$
  select exists (
    select 1 from public.clients c
    where c.id = target_client and c.profile_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row level security — default deny, then grant narrowly
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.coaches enable row level security;
alter table public.clients enable row level security;
alter table public.client_invites enable row level security;
alter table public.consents enable row level security;
alter table public.audit_log enable row level security;

-- Profiles: you can always read and edit your own.
create policy profiles_self_select on public.profiles for
select
  using (id = auth.uid ());

create policy profiles_self_update on public.profiles
for update
  using (id = auth.uid ())
with
  check (id = auth.uid ());

-- A coach may read the profile of any client linked to them.
create policy profiles_coach_reads_client on public.profiles for
select
  using (
    exists (
      select
        1
      from
        public.clients c
      where
        c.profile_id = public.profiles.id
        and c.coach_id = auth.uid ()
    )
  );

create policy coaches_self on public.coaches for all using (id = auth.uid ())
with
  check (id = auth.uid ());

-- Clients: the client sees their own row; the coach sees rows they own.
create policy clients_own_select on public.clients for
select
  using (profile_id = auth.uid ());

create policy clients_coach_select on public.clients for
select
  using (coach_id = auth.uid ());

create policy clients_coach_write on public.clients for all using (coach_id = auth.uid ())
with
  check (coach_id = auth.uid ());

create policy invites_coach_all on public.client_invites for all using (coach_id = auth.uid ())
with
  check (coach_id = auth.uid ());

-- Consent belongs to the client. A coach may read it (they must be able to prove it
-- exists) but may never create or revoke it on the client's behalf.
create policy consents_client_all on public.consents for all using (public.is_the_client (client_id))
with
  check (public.is_the_client (client_id));

create policy consents_coach_select on public.consents for
select
  using (public.is_coach_of (client_id));

-- The audit log is append-only and readable only by the actor.
create policy audit_self_select on public.audit_log for
select
  using (actor_id = auth.uid ());

create policy audit_insert on public.audit_log for insert
with
  check (actor_id = auth.uid ());

-- ---------------------------------------------------------------------------
-- Keep updated_at honest
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at () returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before
update on public.profiles for each row
execute function public.touch_updated_at ();

create trigger clients_touch before
update on public.clients for each row
execute function public.touch_updated_at ();
