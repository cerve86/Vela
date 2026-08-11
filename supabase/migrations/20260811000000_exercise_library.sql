-- Exercise library.
--
-- Two populations of rows in one table:
--   coach_id IS NULL  → the shared library Vela ships with, readable by everyone
--   coach_id = a coach → that coach's own exercises, private to them
--
-- A single table rather than two keeps programme items pointing at one foreign key,
-- which matters in Phase 2 when a programme day mixes shipped and custom exercises.

create type public.exercise_category as enum (
  'pelvic_floor',
  'strength',
  'plyometric',
  'running',
  'mobility'
);

create table public.exercises (
  id uuid primary key default uuid_generate_v4 (),
  /** NULL means part of the shipped library. */
  coach_id uuid references public.coaches (id) on delete cascade,
  name text not null,
  category public.exercise_category not null default 'strength',
  /** Coaching cues shown to the client mid-session, in order. */
  cues text[] not null default '{}',
  muscle_groups text[] not null default '{}',
  equipment text not null default 'Bodyweight',
  /** Private Storage path. Signed on read; never a public URL. */
  video_path text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exercises_coach_idx on public.exercises (coach_id);
create index exercises_category_idx on public.exercises (category);

-- Case-insensitive uniqueness per owner, so a coach cannot end up with two
-- "Single-Leg Bridge" rows and wonder which one a programme points at.
create unique index exercises_name_per_owner
  on public.exercises (coalesce(coach_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))
  where archived_at is null;

create trigger exercises_touch before
update on public.exercises for each row
execute function public.touch_updated_at ();

alter table public.exercises enable row level security;

-- Read: the shipped library plus your own.
create policy exercises_read on public.exercises for
select
  using (coach_id is null or coach_id = auth.uid ());

-- Write: only your own, and only ever as yourself. The WITH CHECK is what stops a
-- coach inserting a row owned by someone else, or editing a shipped exercise.
create policy exercises_write_own on public.exercises for all using (coach_id = auth.uid ())
with
  check (coach_id = auth.uid ());

grant
select,
insert,
update,
delete on public.exercises to authenticated;

-- ---------------------------------------------------------------------------
-- Shipped library
-- ---------------------------------------------------------------------------

insert into
  public.exercises (coach_id, name, category, cues, muscle_groups, equipment)
values
  (null, 'Connection Breath', 'pelvic_floor', array['Exhale as you lift the pelvic floor','Inhale to fully release','Release matters as much as the lift'], array['core'], 'Bodyweight'),
  (null, 'Dead Bug', 'pelvic_floor', array['Low back stays flat','Exhale as the limb extends'], array['core'], 'Bodyweight'),
  (null, 'Side-Lying Hip Abduction', 'strength', array['Leg slightly behind the hip line','No trunk roll'], array['hips','glutes'], 'Bodyweight'),
  (null, 'Single-Leg Bridge', 'strength', array['Hips stay level','Drive through the heel','Ribs down'], array['glutes','hamstrings'], 'Bodyweight'),
  (null, 'Single-Leg Calf Raise', 'strength', array['Full height through the big toe','3s lower','Count to fatigue, aim for 20'], array['calves'], 'Step'),
  (null, 'Single-Leg Sit to Stand', 'strength', array['No hands, no momentum','Knee tracks over the foot'], array['quads','glutes'], 'Box'),
  (null, 'Goblet Squat', 'strength', array['Chest tall','Breathe out on the way up','No breath holding'], array['quads','glutes'], 'Dumbbell'),
  (null, 'Romanian Deadlift', 'strength', array['Hinge from the hip','Neutral spine','Bar stays close'], array['hamstrings','glutes','back'], 'Barbell'),
  (null, 'Split Squat', 'strength', array['Torso upright','Front shin vertical at the bottom'], array['quads','glutes'], 'Dumbbell'),
  (null, 'Pogo Hops', 'plyometric', array['Quiet landings','Stiff ankles, soft knees','Stop if anything leaks or drags'], array['calves'], 'Bodyweight'),
  (null, 'Forward Bounds', 'plyometric', array['Land softly, absorb through the hip'], array['glutes','quads'], 'Bodyweight'),
  (null, 'Walk-Run Intervals', 'running', array['Run easy enough to hold a conversation','Walk before you feel you need to'], array['full_body'], 'None'),
  (null, 'Easy Continuous Run', 'running', array['Conversational pace throughout','Cadence light and quick'], array['full_body'], 'None'),
  (null, 'Single-Leg “Running Man”', 'plyometric', array['Opposite arm and hip drive, knee bent'], array['glutes','core'], 'Bodyweight'),
  (null, '90/90 Hip Rotations', 'mobility', array['Move slowly, no forcing','Breathe throughout'], array['hips'], 'Bodyweight'),
  (null, 'Thoracic Opener', 'mobility', array['Rotate from the ribcage, not the low back'], array['back','shoulders'], 'Bodyweight');
