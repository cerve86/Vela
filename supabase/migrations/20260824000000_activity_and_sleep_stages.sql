-- The signals strain and recovery were missing.
--
-- Strain counted prescribed sets, so a day's actual effort was invisible unless it came from
-- a session Vela had written down. Someone who ran 8k and skipped her strength work read as
-- having done nothing, which is both wrong and demoralising in exactly the wrong direction.
-- Active energy is the honest measure: it already includes the session, the run, the walk
-- with the pram, and the flight of stairs.
--
-- Recovery had the whole night flattened into one number. Apple delivers sleep as its
-- stages, and how a night was composed matters more than its length — seven hours that were
-- mostly light is not seven hours with normal deep and REM. Those stages were being summed
-- and discarded.
alter type public.metric_type
add value if not exists 'active_energy_kcal';

alter type public.metric_type
add value if not exists 'exercise_min';

alter type public.metric_type
add value if not exists 'sleep_deep_min';

alter type public.metric_type
add value if not exists 'sleep_rem_min';

alter type public.metric_type
add value if not exists 'sleep_core_min';

alter type public.metric_type
add value if not exists 'sleep_awake_min';
