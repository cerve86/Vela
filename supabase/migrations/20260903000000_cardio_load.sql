-- Cardiovascular load: the day's effort weighted by how hard the heart was working.
--
-- Strain has had two bases and both were blunt. Sets counted only what Vela had
-- prescribed, so anything she chose to do herself was invisible. Active energy fixed that
-- but is derived by Apple mostly from movement and body mass, which means it reads a brisk
-- walk and a set of hill repeats as closer together than they are, and barely registers
-- strength work at all.
--
-- This is minutes weighted by heart rate reserve — Banister's TRIMP, computed on the phone
-- from five-minute heart-rate buckets because only the device knows which timezone the day
-- belongs to, and because sending a month of raw heart rate to the server would be both
-- enormous and pointless.
--
-- The value is unitless and is NOT comparable between people. Every reading of it in this
-- product is a ratio against the same person's own recent days. It is deliberately not
-- shown as a raw figure anywhere.
--
-- Recomputed rather than accumulated: the sync re-reads an overlapping thirty-day window
-- and upserts on the day key, so changing the formula and re-syncing rewrites the recent
-- history rather than leaving two definitions of the same column side by side.
alter type public.metric_type
add value if not exists 'cardio_load';

comment on type public.metric_type is 'What a metrics row measures. cardio_load is derived on-device (heart-rate-weighted minutes), not a raw Apple Health reading — it is scored only against the same client''s own recent days.';
