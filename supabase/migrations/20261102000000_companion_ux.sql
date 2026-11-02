-- The companion UX pass (2 November 2026): close the loop with the coach.
--
-- Additive only. Two things the coach could not see before, and one she can now set:
--
--   1. The verdict her morning check showed her (companion_readiness.verdict), so the
--      coach reads the same "go / ease / easy" the athlete read, not a recomputation that
--      might disagree with it.
--   2. Her nutrition check results, when she chooses to share them
--      (companion_nutrition_shares). The check itself stays on her phone; a share carries
--      only the three section results, whether her periods flagged, and the date. Never
--      her answers.
--   3. Her race (companion_profiles.race_name / race_date), set by the coach, for the
--      countdown strip on Progress.
--
-- The coach already reads companion_readiness (companion_readiness_coach_read in
-- 20261101000000_companion.sql) and already writes companion_profiles
-- (companion_profiles_coach, for all), so no policy on either changes here.

-- ---------------------------------------------------------------------------
-- Her race, for the countdown
-- ---------------------------------------------------------------------------

alter table public.companion_profiles
add column race_name text,
add column race_date date;

comment on column public.companion_profiles.race_name is 'The race she is training for, as the coach names it ("Angkor Wat Half"). Set by the coach.';

comment on column public.companion_profiles.race_date is 'Race day. Drives the countdown on the companion''s Progress. Set by the coach.';

-- ---------------------------------------------------------------------------
-- The verdict she was shown
-- ---------------------------------------------------------------------------

alter table public.companion_readiness
add column verdict text check (verdict in ('go', 'ease', 'easy', 'rest'));

comment on column public.companion_readiness.verdict is 'The verdict the companion showed her when she saved the check: go, ease, easy, or rest on a rest day. Null on checks saved before 2 November 2026.';

-- The old comment promised that the coach confirms the verdict. No screen did; the coach
-- now reads it on the client page, which is what the comment should say.
comment on table public.companion_readiness is 'The companion''s morning check: four taps, optional manual HRV / resting HR, and the verdict it showed her. Her coach reads it on the client page in the portal.';

-- ---------------------------------------------------------------------------
-- Nutrition check results she chose to share
-- ---------------------------------------------------------------------------

create table public.companion_nutrition_shares (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  /** Low energy availability section: clear, watch or flag. A flag suggests a GP visit. */
  energy text not null check (energy in ('clear', 'watch', 'flag')),
  iron text not null check (iron in ('clear', 'watch', 'flag')),
  vitamin_d text not null check (vitamin_d in ('clear', 'watch', 'flag')),
  /** Her periods have stopped or become irregular: flags the energy section on its own. */
  periods_flag boolean not null default false
);

comment on table public.companion_nutrition_shares is 'Nutrition check results the athlete chose to send her coach from the companion. Only the three section results and the date; her answers stay on her phone. Append-only: a new check is a new row.';

create index companion_nutrition_shares_client_idx on public.companion_nutrition_shares (client_id, created_at desc);

alter table public.companion_nutrition_shares enable row level security;

-- Hers to send and to read back; her coach reads it. Nobody edits a share after the fact:
-- a later check is a new row, so the coach sees what was true on the day it was sent.
create policy companion_nutrition_shares_client_insert on public.companion_nutrition_shares for insert
with
  check (public.is_the_client (client_id));

create policy companion_nutrition_shares_client_read on public.companion_nutrition_shares for
select
  using (public.is_the_client (client_id));

create policy companion_nutrition_shares_coach_read on public.companion_nutrition_shares for
select
  using (public.is_coach_of (client_id));

-- Supabase's default privileges hand a new table every right; take them back so "no
-- updates" is a refusal, not just a policy that happens to match nothing.
revoke all on public.companion_nutrition_shares from anon, authenticated;

grant select, insert on public.companion_nutrition_shares to authenticated;
