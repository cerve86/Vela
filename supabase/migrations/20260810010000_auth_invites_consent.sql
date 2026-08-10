-- CP1 — invite flow, profile provisioning, consent and account deletion.
--
-- The security model in one sentence: a coach may create an invite, but only the
-- invited person, having proved control of the mailbox, can turn it into a link
-- between their auth account and that client row.
--
-- Everything a client does to accept runs through SECURITY DEFINER functions with a
-- locked search_path, because acceptance necessarily has to read an invite row that
-- RLS would otherwise hide from an unlinked user.

-- gen_random_bytes / digest for token minting and hashing.
create extension if not exists pgcrypto
with
  schema extensions;

-- ---------------------------------------------------------------------------
-- Invites: opaque tokens, never guessable, single use
-- ---------------------------------------------------------------------------

-- The coach names the client before that person has an account of their own, so the
-- name lives here until acceptance copies it onto the real profile.
alter table public.clients
  add column if not exists first_name_hint text,
  add column if not exists last_name_hint text;

-- The raw token is emailed; only its digest is stored. A leaked database backup
-- therefore does not yield usable invite links.
alter table public.client_invites
  add column if not exists token_hash text,
  add column if not exists revoked_at timestamptz;

-- Drop the plaintext column if this is a fresh environment; keep data otherwise.
alter table public.client_invites
  alter column token drop not null;

create unique index if not exists client_invites_token_hash_key
  on public.client_invites (token_hash)
  where token_hash is not null;

create index if not exists client_invites_client_id_idx on public.client_invites (client_id);

-- ---------------------------------------------------------------------------
-- Profile provisioning
-- ---------------------------------------------------------------------------

/**
 * Every auth.users row gets a profile. Role defaults to 'client' — a coach is only
 * ever promoted deliberately, so an accidental signup can never land with coach
 * privileges and start reading other people's clients.
 */
create or replace function public.handle_new_user () returns trigger language plpgsql security definer
set
  search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, role, first_name, last_name)
  values (
    new.id,
    'client',
    coalesce(nullif(meta->>'first_name', ''), split_part(new.email, '@', 1)),
    coalesce(nullif(meta->>'last_name', ''), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users for each row
execute function public.handle_new_user ();

-- ---------------------------------------------------------------------------
-- Creating an invite
-- ---------------------------------------------------------------------------

/**
 * Called by the coach. Creates (or reuses) the client row, mints a token, and returns
 * the raw token exactly once — the caller emails it and it is never retrievable again.
 */
create or replace function public.create_client_invite (
  p_email text,
  p_first_name text,
  p_last_name text,
  p_condition text default null,
  p_goal text default null
) returns table (invite_id uuid, client_id uuid, token text) language plpgsql security definer
set
  search_path = public as $$
declare
  v_coach uuid := auth.uid();
  v_client uuid;
  v_token text;
  v_invite uuid;
begin
  if v_coach is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not exists (select 1 from public.coaches c where c.id = v_coach) then
    raise exception 'only a coach can invite clients' using errcode = '42501';
  end if;

  p_email := lower(trim(p_email));
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email address' using errcode = '22023';
  end if;

  -- Re-inviting the same address reuses the client row rather than creating a duplicate.
  select cl.id into v_client
  from public.clients cl
  where cl.coach_id = v_coach and lower(cl.email) = p_email;

  if v_client is null then
    insert into public.clients (coach_id, email, first_name_hint, last_name_hint, condition, goal, status)
    values (v_coach, p_email, p_first_name, p_last_name, p_condition, p_goal, 'invited')
    returning id into v_client;
  end if;

  -- Supersede any outstanding invite for this client.
  update public.client_invites
  set revoked_at = now()
  where client_id = v_client and accepted_at is null and revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.client_invites (coach_id, client_id, email, token_hash, expires_at)
  values (v_coach, v_client, p_email, encode(extensions.digest(v_token, 'sha256'), 'hex'), now() + interval '14 days')
  returning id into v_invite;

  return query select v_invite, v_client, v_token;
end;
$$;

revoke all on function public.create_client_invite (text, text, text, text, text) from public;
grant
execute on function public.create_client_invite (text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Accepting an invite
-- ---------------------------------------------------------------------------

/**
 * Called by the invited user immediately after they verify their email.
 *
 * Three checks stand between a token and a link:
 *   1. the token digest matches a live, unexpired, unrevoked, unaccepted invite;
 *   2. the caller is authenticated;
 *   3. the caller's *verified* email equals the address the invite was issued to.
 *
 * Check 3 is what makes the flow trustworthy — a forwarded invite link is useless to
 * anyone but the intended recipient, because the token alone is not enough.
 */
create or replace function public.accept_client_invite (p_token text) returns uuid language plpgsql security definer
set
  search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_verified timestamptz;
  v_invite public.client_invites;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select lower(u.email), u.email_confirmed_at into v_email, v_verified
  from auth.users u where u.id = v_user;

  if v_verified is null then
    raise exception 'email not verified' using errcode = '42501';
  end if;

  select * into v_invite
  from public.client_invites i
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');

  if v_invite.id is null then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if v_invite.accepted_at is not null then
    raise exception 'invite already used' using errcode = '22023';
  end if;
  if v_invite.revoked_at is not null then
    raise exception 'invite revoked' using errcode = '22023';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'invite expired' using errcode = '22023';
  end if;
  if lower(v_invite.email) <> v_email then
    raise exception 'invite was issued to a different email address' using errcode = '42501';
  end if;

  update public.clients
  set profile_id = v_user, status = 'active'
  where id = v_invite.client_id;

  update public.client_invites set accepted_at = now() where id = v_invite.id;

  -- Carry the coach's naming across to the real profile if the user left it blank.
  update public.profiles p
  set first_name = coalesce(nullif(p.first_name, ''), c.first_name_hint),
      last_name = coalesce(nullif(p.last_name, ''), c.last_name_hint)
  from public.clients c
  where c.id = v_invite.client_id and p.id = v_user;

  insert into public.audit_log (actor_id, action, entity, entity_id)
  values (v_user, 'invite.accepted', 'client', v_invite.client_id::text);

  return v_invite.client_id;
end;
$$;

revoke all on function public.accept_client_invite (text) from public;
grant
execute on function public.accept_client_invite (text) to authenticated;

/** Lets the app show "You've been invited by X" before asking the user to sign in. */
create or replace function public.peek_client_invite (p_token text) returns table (
  coach_name text,
  practice_name text,
  email text,
  expired boolean
) language plpgsql security definer
set
  search_path = public as $$
begin
  return query
  select (p.first_name || ' ' || p.last_name)::text,
         co.practice_name,
         i.email,
         (i.expires_at < now() or i.accepted_at is not null or i.revoked_at is not null)
  from public.client_invites i
  join public.coaches co on co.id = i.coach_id
  join public.profiles p on p.id = co.id
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
end;
$$;

grant
execute on function public.peek_client_invite (text) to anon,
authenticated;

-- ---------------------------------------------------------------------------
-- Consent — recorded against the client, by the client only
-- ---------------------------------------------------------------------------

create or replace function public.record_consent (p_types public.consent_type[], p_version text) returns void language plpgsql security definer
set
  search_path = public as $$
declare
  v_client uuid;
  t public.consent_type;
begin
  select c.id into v_client from public.clients c where c.profile_id = auth.uid();
  if v_client is null then
    raise exception 'no client record for this user' using errcode = '42501';
  end if;

  foreach t in array p_types loop
    insert into public.consents (client_id, type, policy_version)
    values (v_client, t, p_version);
  end loop;
end;
$$;

grant
execute on function public.record_consent (public.consent_type[], text) to authenticated;

/** True once the client has granted, and not revoked, health-data processing consent. */
create or replace function public.has_health_consent (p_client uuid) returns boolean language sql stable security definer
set
  search_path = public as $$
  select exists (
    select 1 from public.consents c
    where c.client_id = p_client
      and c.type = 'health_data_processing'
      and c.revoked_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- Account deletion — Apple 5.1.1(v) and GDPR Article 17
-- ---------------------------------------------------------------------------

/**
 * Erases the caller's own account. Deliberately a hard delete rather than a soft flag:
 * "deleted" that still holds the data is not erasure, and this is special-category
 * health data. The audit row deliberately keeps no subject identifier.
 */
create or replace function public.delete_my_account () returns void language plpgsql security definer
set
  search_path = public as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id)
  values (null, 'account.deleted', 'profile', null);

  delete from public.clients where profile_id = v_user;
  delete from public.profiles where id = v_user;
  delete from auth.users where id = v_user;
end;
$$;

grant
execute on function public.delete_my_account () to authenticated;

-- ---------------------------------------------------------------------------
-- Invite visibility
-- ---------------------------------------------------------------------------

-- Invite rows are readable only by the coach who issued them; an invited user never
-- needs to SELECT one, because peek/accept run as SECURITY DEFINER.
drop policy if exists invites_coach_all on public.client_invites;

create policy invites_coach_all on public.client_invites for all using (coach_id = auth.uid ())
with
  check (coach_id = auth.uid ());
