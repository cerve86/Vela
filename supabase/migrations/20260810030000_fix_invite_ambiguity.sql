-- Fix: "column reference \"client_id\" is ambiguous" when creating an invite.
--
-- create_client_invite declares client_id as a RETURNS TABLE output column, which puts
-- that name in scope for the whole body. The UPDATE below then had a bare `client_id`
-- in its WHERE clause, which could equally mean the output variable or the column on
-- client_invites — so plpgsql refused it at runtime rather than guessing.
--
-- Every reference to a table column that shares a name with an output column is now
-- schema-qualified.

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
  else
    -- Refresh the coach's notes on a re-invite.
    update public.clients cl
    set first_name_hint = coalesce(p_first_name, cl.first_name_hint),
        last_name_hint = coalesce(p_last_name, cl.last_name_hint),
        condition = coalesce(p_condition, cl.condition),
        goal = coalesce(p_goal, cl.goal)
    where cl.id = v_client;
  end if;

  -- Supersede any outstanding invite for this client. Qualified to disambiguate
  -- client_invites.client_id from the output column of the same name.
  update public.client_invites i
  set revoked_at = now()
  where i.client_id = v_client
    and i.accepted_at is null
    and i.revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.client_invites (coach_id, client_id, email, token_hash, expires_at)
  values (
    v_coach,
    v_client,
    p_email,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    now() + interval '14 days'
  )
  returning id into v_invite;

  return query select v_invite, v_client, v_token;
end;
$$;

revoke all on function public.create_client_invite (text, text, text, text, text) from public;

grant
execute on function public.create_client_invite (text, text, text, text, text) to authenticated;
