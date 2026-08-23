-- How much of a session actually happened.
--
-- Until now the logger wrote status, completion time and pain, and threw the rest away:
-- which sets were ticked lived in AsyncStorage on the phone and was deleted the moment the
-- session was sent. So "completed" covered both every set done and one set done, and the
-- coach could not tell them apart — nor could anything compute a training load.
--
-- Two integers rather than a row per set. The set-by-set detail is a live scratchpad during
-- a session, not a clinical record; what survives is what was asked for and what was done.
alter table public.sessions
add column if not exists sets_planned int check (sets_planned is null or sets_planned >= 0),
add column if not exists sets_done int check (sets_done is null or sets_done >= 0);

comment on column public.sessions.sets_planned is 'Working sets the plan asked for, recorded at the moment it was logged — the prescription can change afterwards, this should not.';

comment on column public.sessions.sets_done is 'Working sets actually ticked. The basis of the day''s strain, and the difference between "completed" and "completed all of it".';
