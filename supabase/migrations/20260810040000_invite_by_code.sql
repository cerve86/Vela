-- Invite acceptance by verified email, replacing the token-in-a-deep-link approach.
--
-- Why the token goes away entirely:
--
-- The long invite token only ever proved one thing — that you could read the mailbox
-- it was sent to. The six-digit OTP proves exactly the same thing, and GoTrue already
-- issues, expires and single-uses it for us. Carrying our own token alongside it added
-- no security and one real failure mode: it had to be threaded through auth user
-- metadata to reach the email template, where a re-invite silently mailed the previous
-- (already revoked) token.
--
-- So acceptance is now keyed on the caller's VERIFIED email. The guarantee is
-- unchanged: you cannot link yourself to a client row unless you demonstrably control
-- the address the coach invited.

/**
 * Redeems the pending invitation belonging to the caller's verified email address.
 *
 * Known limitation: if the same person is invited by two different coaches, this
 * accepts the most recent invitation only. The app currently assumes one client row
 * per account; supporting a client of two practices is a deliberate later decision,
 * not an oversight.
 */
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

revoke all on function public.accept_my_invite () from public;

grant
execute on function public.accept_my_invite () to authenticated;

-- The token-based path is gone. Dropping rather than leaving it dormant: an unused
-- SECURITY DEFINER function is attack surface that nothing exercises or tests.
drop function if exists public.accept_client_invite (text);

drop function if exists public.peek_client_invite (text);
