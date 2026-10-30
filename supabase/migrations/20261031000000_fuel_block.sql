-- Her race-block fuelling notes. A day's fuelling type can now name which long-run card of
-- a block it gets — gut training (weeks 1–3), the absorption week (week 4), race rehearsal
-- (weeks 5–7) — or a double day. Untagged days read their type from the day as before.

alter table public.program_days
drop constraint program_days_fuel_type_known;

alter table public.program_days
add constraint program_days_fuel_type_known check (
  fuel_type is null
  or fuel_type in (
    'long',
    'long_gut',
    'long_absorb',
    'long_rehearsal',
    'quality',
    'double',
    'easy',
    'strength'
  )
);

/**
 * The keys of her coach's cards kept as drafts. A client reads only published cards, so
 * without this a shipped default stayed on her phone after the coach set it to Draft; the
 * phone now hides the default under each key. Only the keys: a draft's wording stays with
 * the coach.
 */
create or replace function public.hidden_fuel_cards () returns setof text language sql stable security definer
set
  search_path = public as $$
  select f.key
  from public.fuel_cards f
  join public.clients c on c.coach_id = f.coach_id
  where c.profile_id = auth.uid() and not f.published;
$$;

grant
execute on function public.hidden_fuel_cards () to authenticated;
