-- Security review, 21 September 2026: five findings, each closed at the database.
--
-- 1. Anyone signed in could make herself a coach: `authenticated` held INSERT on coaches
--    and a table-wide UPDATE on profiles, so a client could insert her own coach row and
--    set her role. Coach rows are made by the provisioning script with the service role,
--    and a role is never the person's own to change.
-- 2. Either side of a conversation could rewrite the other's message: the UPDATE meant
--    for read_at was granted on every column.
-- 3. A coach could enrol a client she does not own in a challenge, and the standing
--    function, running as definer, would then count that client's sessions for her.
-- 4. Anyone signed in could write a shared Open Food Facts row with any figures, and the
--    first row per barcode was final. The portal now looks products up and caches them.
-- 5. Acceptance of an invitation was keyed on the email alone: a second practice could
--    invite the same address and, being newer, capture the person; a password reset
--    could move a linked client without a word. A pending invitation from another
--    practice now refuses a second, and moving practices is an explicit choice.

-- ---------------------------------------------------------------------------
-- 1. Coaches are provisioned; roles are not self-served
-- ---------------------------------------------------------------------------
revoke insert on public.coaches from authenticated;

drop policy if exists coaches_self on public.coaches;

create policy coaches_self_select on public.coaches for
select
  using (id = auth.uid ());

create policy coaches_self_update on public.coaches for update using (id = auth.uid ())
with
  check (id = auth.uid ());

revoke update on public.profiles from authenticated;

grant update (first_name, last_name, avatar_path, locale, timezone) on public.profiles to authenticated;

-- Belt and braces: even a future grant cannot let the signed-in role change a role.
create or replace function public.profiles_guard_role () returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and current_user = 'authenticated' then
    raise exception 'role is not yours to change' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;

create trigger profiles_guard_role before update on public.profiles for each row
execute function public.profiles_guard_role ();

-- ---------------------------------------------------------------------------
-- 2. A sent message is read, never edited
-- ---------------------------------------------------------------------------
revoke update on public.messages from authenticated;

grant update (read_at) on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Only her own clients in her challenges, and only they are counted
-- ---------------------------------------------------------------------------
drop policy if exists challenge_participants_coach_all on public.challenge_participants;

create policy challenge_participants_coach_all on public.challenge_participants for all using (coach_id = auth.uid ())
with
  check (
    coach_id = auth.uid ()
    and public.is_coach_of (client_id)
  );

create or replace function public.challenge_standing (p_challenge uuid) returns table (
  participants integer,
  group_total bigint,
  group_target bigint,
  mine bigint
) language plpgsql stable security definer
set
  search_path to 'public',
  'pg_temp' as $$
declare
  ch public.challenges;
  me uuid;
begin
  select * into ch from public.challenges where id = p_challenge;
  if ch.id is null then
    return;
  end if;

  select c.id into me
  from public.clients c
  where c.profile_id = auth.uid() and c.id in (
    select p.client_id from public.challenge_participants p where p.challenge_id = ch.id
  );

  if me is null and ch.coach_id is distinct from auth.uid() then
    return;
  end if;

  return query
  -- Only the coach's own clients count, whatever a membership row says.
  with parts as (
    select p.client_id
    from public.challenge_participants p
    join public.clients c on c.id = p.client_id and c.coach_id = ch.coach_id
    where p.challenge_id = ch.id
  ),
  span as (
    select ch.starts_on as from_day, ch.starts_on + ch.weeks * 7 - 1 as to_day
  ),
  scored as (
    select
      parts.client_id,
      case ch.metric
        when 'sessions_completed' then (
          select count(*)
          from public.sessions s, span
          where s.client_id = parts.client_id
            and s.status = 'completed'
            and s.scheduled_date between span.from_day and span.to_day
        )
        else (
          select count(*)
          from (
            select f.logged_on
            from public.food_logs f, span
            where f.client_id = parts.client_id
              and f.logged_on between span.from_day and span.to_day
            group by f.logged_on
            having count(distinct f.meal) >= 3
          ) full_days
        )
      end as done
    from parts
  )
  select
    (select count(*)::int from parts),
    (select coalesce(sum(done), 0)::bigint from scored),
    ((select count(*) from parts) * ch.weeks * ch.weekly_target)::bigint,
    (select coalesce(sum(done), 0)::bigint from scored where scored.client_id = me);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The shared product cache is written by the portal, not by whoever scanned
-- ---------------------------------------------------------------------------
drop policy if exists foods_cache_insert on public.foods;

-- ---------------------------------------------------------------------------
-- 5. One practice at a time, and a move is said out loud
-- ---------------------------------------------------------------------------
create or replace function public.create_client_invite (
  p_email text,
  p_first_name text,
  p_last_name text,
  p_condition text default null,
  p_goal text default null,
  p_delivery_type delivery_type default 'not_applicable',
  p_weeks_postpartum integer default null,
  p_breastfeeding boolean default false
) returns table (invite_id uuid, client_id uuid, token text) language plpgsql security definer
set
  search_path to 'public' as $$
declare
  v_coach uuid := auth.uid();
  v_client uuid;
  v_token text;
  v_invite uuid;
  v_elsewhere text;
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

  -- Another practice already has a live invitation out for this address. First come,
  -- first served: a second invitation would otherwise be the newer one and win the
  -- acceptance, whoever's email the person actually opened.
  select co.practice_name into v_elsewhere
  from public.client_invites i
  join public.coaches co on co.id = i.coach_id
  where lower(i.email) = p_email
    and i.coach_id <> v_coach
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  limit 1;
  if v_elsewhere is not null then
    raise exception 'This person has already been invited by another practice (%). Ask them to accept or decline that first.', v_elsewhere
      using errcode = 'P0004';
  end if;

  select cl.id into v_client
  from public.clients cl
  where cl.coach_id = v_coach and lower(cl.email) = p_email;

  if v_client is null then
    insert into public.clients (
      coach_id, email, first_name_hint, last_name_hint, condition, goal, status,
      delivery_type, weeks_postpartum, breastfeeding
    )
    values (
      v_coach, p_email, p_first_name, p_last_name, p_condition, p_goal, 'invited',
      p_delivery_type, p_weeks_postpartum, p_breastfeeding
    )
    returning id into v_client;
  else
    update public.clients cl
    set first_name_hint = coalesce(p_first_name, cl.first_name_hint),
        last_name_hint = coalesce(p_last_name, cl.last_name_hint),
        condition = coalesce(p_condition, cl.condition),
        goal = coalesce(p_goal, cl.goal),
        delivery_type = p_delivery_type,
        weeks_postpartum = coalesce(p_weeks_postpartum, cl.weeks_postpartum),
        breastfeeding = p_breastfeeding
    where cl.id = v_client;
  end if;

  update public.client_invites i
  set revoked_at = now()
  where i.client_id = v_client
    and i.accepted_at is null
    and i.revoked_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');

  insert into public.client_invites (coach_id, client_id, email, token_hash, expires_at)
  values (
    v_coach, v_client, p_email,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    now() + interval '14 days'
  )
  returning id into v_invite;

  return query select v_invite, v_client, v_token;
end;
$$;

drop function if exists public.accept_my_invite ();

create or replace function public.accept_my_invite (p_move boolean default false) returns uuid language plpgsql security definer
set
  search_path to 'public' as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_verified timestamptz;
  v_meta jsonb;
  v_invite public.client_invites;
  v_from text;
  v_to text;
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

  -- Already a client somewhere else: moving is her decision, made knowing both names,
  -- never a side effect of a password reset.
  if not p_move then
    select co_from.practice_name, co_to.practice_name into v_from, v_to
    from public.clients c
    join public.coaches co_from on co_from.id = c.coach_id
    join public.coaches co_to on co_to.id = v_invite.coach_id
    where c.profile_id = v_user
      and c.id <> v_invite.client_id
      and c.coach_id <> v_invite.coach_id
    limit 1;
    if v_from is not null then
      raise exception 'You are already a client of %. Confirm if you want to move to %.', v_from, v_to
        using errcode = 'P0003';
    end if;
  end if;

  insert into public.profiles (id, role, first_name, last_name)
  values (
    v_user,
    'client',
    coalesce(nullif(v_meta->>'first_name', ''), split_part(v_email, '@', 1)),
    coalesce(nullif(v_meta->>'last_name', ''), '')
  )
  on conflict (id) do nothing;

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
  values (v_user, case when p_move then 'invite.accepted_move' else 'invite.accepted' end, 'client', v_invite.client_id::text);

  return v_invite.client_id;
end;
$$;

revoke all on function public.accept_my_invite (boolean) from public;

grant
execute on function public.accept_my_invite (boolean) to authenticated;
