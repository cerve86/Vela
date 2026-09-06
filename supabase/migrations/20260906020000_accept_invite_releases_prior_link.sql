-- Accepting an invitation moves a person, rather than failing because she has been here.
--
-- A person is linked to at most one client row (clients.profile_id is unique). Someone
-- invited a second time — by a new practice, or by the same one after her old row was
-- left behind — still held her old link, and the second accept died on the unique key
-- with a message nobody could act on. Now the old row is released first: it stays as the
-- record it is, with no login attached, and the new invitation becomes her live row.
--
-- Also hardened while here: a NULL name hint no longer fails the profile copy.
create or replace function public.accept_my_invite () returns uuid language plpgsql security definer
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
