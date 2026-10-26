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
