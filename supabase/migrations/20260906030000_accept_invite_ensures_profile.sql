-- Accepting an invitation must not depend on a trigger having fired.
--
-- Every user is meant to get a profile from handle_new_user the moment auth.users gains
-- a row. On the hosted project a client reached the welcome page, set a password, and
-- accept_my_invite failed on clients_profile_id_fkey: no profile. Whether the trigger
-- was never installed there or the row was removed later, the accept must not fail for
-- it — the function is SECURITY DEFINER and knows everything the trigger knows, so it
-- creates the profile itself when it is missing. The trigger is re-asserted too.
create or replace function public.accept_my_invite () returns uuid language plpgsql security definer
set
  search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_verified timestamptz;
  v_meta jsonb;
  v_invite public.client_invites;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select lower(u.email), u.email_confirmed_at, coalesce(u.raw_user_meta_data, '{}'::jsonb)
  into v_email, v_verified, v_meta
  from auth.users u where u.id = v_user;

  if v_verified is null then
    raise exception 'email not verified' using errcode = '42501';
  end if;

  select i.* into v_invite
  from public.client_invites i
  where lower(i.email) = v_email
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if v_invite.id is null then
    raise exception 'no pending invitation for this email address' using errcode = 'P0002';
  end if;

  -- The profile the trigger should have made. Names from the invitation's metadata,
  -- else the address; the hints on the client row are copied over below.
  insert into public.profiles (id, role, first_name, last_name)
  values (
    v_user,
    'client',
    coalesce(nullif(v_meta->>'first_name', ''), split_part(v_email, '@', 1)),
    coalesce(nullif(v_meta->>'last_name', ''), '')
  )
  on conflict (id) do nothing;

  -- One login, one live client row: release any earlier one before linking the new.
  update public.clients
  set profile_id = null
  where profile_id = v_user and id <> v_invite.client_id;

  update public.clients
  set profile_id = v_user, status = 'active'
  where id = v_invite.client_id;

  update public.client_invites set accepted_at = now() where id = v_invite.id;

  update public.profiles p
  set first_name = coalesce(nullif(p.first_name, ''), c.first_name_hint, ''),
      last_name = coalesce(nullif(p.last_name, ''), c.last_name_hint, '')
  from public.clients c
  where c.id = v_invite.client_id and p.id = v_user;

  insert into public.audit_log (actor_id, action, entity, entity_id)
  values (v_user, 'invite.accepted', 'client', v_invite.client_id::text);

  return v_invite.client_id;
end;
$$;

-- Re-assert the trigger, so a project where it was never installed gets it now.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users for each row
execute function public.handle_new_user ();
