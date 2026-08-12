-- Postpartum context on the client record.
--
-- These were added to the shared domain model during the Vela reposition but never to
-- the schema, so the portal could not read them. They matter clinically: delivery type
-- and weeks postpartum drive impact readiness and load progression, and breastfeeding
-- affects energy availability and RED-S risk.

create type public.delivery_type as enum (
  'vaginal',
  'assisted_vaginal',
  'caesarean',
  'not_applicable'
);

alter table public.clients
  add column if not exists delivery_type public.delivery_type not null default 'not_applicable',
  /** NULL when not postpartum; the app then hides the return-to-running pathway. */
  add column if not exists weeks_postpartum int
    check (weeks_postpartum is null or weeks_postpartum between 0 and 520),
  add column if not exists breastfeeding boolean not null default false,
  add column if not exists date_of_birth date,
  add column if not exists height_cm numeric(5, 1);

comment on column public.clients.weeks_postpartum is
  'Weeks since delivery at the time of onboarding. Recomputed against started_on for display rather than trusted as a live value.';

/**
 * Extended invite: carries the postpartum context the coach already knows at invite
 * time, so the client's first session is prescribed correctly rather than after a
 * follow-up conversation.
 */
create or replace function public.create_client_invite (
  p_email text,
  p_first_name text,
  p_last_name text,
  p_condition text default null,
  p_goal text default null,
  p_delivery_type public.delivery_type default 'not_applicable',
  p_weeks_postpartum int default null,
  p_breastfeeding boolean default false
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

grant
execute on function public.create_client_invite (
  text, text, text, text, text, public.delivery_type, int, boolean
) to authenticated;
