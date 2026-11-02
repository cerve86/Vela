-- The companion, round two (3 November 2026): the coach's feedback.
--
-- Additive only. Two things:
--
--   1. The coach's WhatsApp link (profiles.whatsapp_url). WhatsApp is where her athletes
--      already talk to her, so the companion's contact buttons open it instead of writing
--      to the in-app messages. She sets it once in portal Settings; her clients read it
--      under profiles_client_reads_own_coach, which already exists.
--   2. Today's movements (companion_session_movements): the exercises prescribed in her
--      sessions, with the library card's domain, why, cues and demo video, so Today can
--      show what a strength session holds without opening the Vela app.

-- ---------------------------------------------------------------------------
-- The coach's WhatsApp link
-- ---------------------------------------------------------------------------
-- A prefix match on the three shapes WhatsApp hands out: a chat link (wa.me/<digits>),
-- the long form (api.whatsapp.com/send?phone=<digits>) and a group invite
-- (chat.whatsapp.com/<code>). Anything after the prefix (?text=…) is allowed. https only:
-- the link becomes an href on her athletes' phones.
alter table public.profiles
add column whatsapp_url text check (
  whatsapp_url is null
  or whatsapp_url ~ '^https://(wa\.me/[0-9]+|api\.whatsapp\.com/send\?phone=[0-9]+|chat\.whatsapp\.com/[A-Za-z0-9]+)'
);

-- It is the coach's link for her athletes; a client has no athletes to reach her.
alter table public.profiles
add constraint profiles_whatsapp_url_coach_only check (whatsapp_url is null or role = 'coach');

comment on column public.profiles.whatsapp_url is 'The coach''s WhatsApp link for her athletes (wa.me/<digits>, api.whatsapp.com/send?phone=<digits> or a chat.whatsapp.com group invite). Set by the coach in portal Settings; the companion''s contact buttons open it. Coaches only.';

-- profiles has column-level update grants (20260921000000_security_review.sql): add this
-- one, so profiles_self_update lets her set her own link and nothing else changes.
grant update (whatsapp_url) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Today's movements
-- ---------------------------------------------------------------------------
-- Same ownership rule as get_session_plans: every session id must be the caller's own or
-- one of her clients'; one stranger's id refuses the whole call. A movement behind a gate
-- that is not open for her (her cleared gates plus the block's overrides) is left out, as
-- companion_my_strength leaves it out: the coach decides when it is safe, not the list.
create or replace function public.companion_session_movements (p_session_ids uuid[]) returns table (
  session_id uuid,
  exercise_name text,
  block text,
  sets int,
  reps text,
  tempo text,
  notes text,
  order_index int,
  domain text,
  why text,
  cues text[],
  video_url text
) language plpgsql stable security definer
set
  search_path = public as $$
begin
  if exists (
    select 1 from public.sessions s
    where s.id = any (p_session_ids)
      and not (public.is_the_client(s.client_id) or public.is_coach_of(s.client_id))
  ) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  return query
  select
    s.id, e.name, i.block, i.sets, i.reps, i.tempo, i.notes, i.order_index,
    e.domain, e.why, e.cues, e.video_url
  from public.sessions s
  join public.clients c on c.id = s.client_id
  left join public.assignments a on a.id = s.assignment_id
  join public.program_items i on i.program_day_id = s.program_day_id
  join public.exercises e on e.id = i.exercise_id
  where s.id = any (p_session_ids)
    and e.gates <@ (c.cleared_gates || coalesce(a.gate_overrides, '{}'))
  order by s.id, i.block, i.order_index;
end;
$$;

comment on function public.companion_session_movements (uuid[]) is 'The movements prescribed in the given sessions, with the library card (domain, why, cues, video), for the companion''s Today. The caller''s own sessions or her clients'' only (42501 otherwise); gated movements she is not cleared for are left out.';

revoke all on function public.companion_session_movements (uuid[]) from public;

grant execute on function public.companion_session_movements (uuid[]) to authenticated;
