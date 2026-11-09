-- Sessions to the watch (9 November 2026): Vela puts an athlete's planned sessions on her
-- intervals.icu calendar, and intervals.icu passes them on to her Garmin, Coros or Suunto.
--
-- Additive only. Three things:
--
--   1. program_days.watch_steps: a run's steps in intervals.icu's workout text, so the
--      session reaches the watch as a structured workout rather than a note.
--   2. companion_profiles: whether the coach sends this athlete's sessions, when Vela last
--      did, what went wrong if it failed, and a per-athlete lock so two syncs never run
--      at once (the coach's assistant makes edits in quick succession, and each one
--      starts a sync after it answers).
--   3. intervals_events: which intervals.icu event holds which Vela session, so an edit
--      updates the event in place, and a removed session takes its event with it.
--
-- The writes go out with the coach's intervals.icu API key (INTERVALS_API_KEY on the
-- portal's host), the same key that already reads her athletes. Nothing here holds it.

-- ---------------------------------------------------------------------------
-- A run's steps for the watch
-- ---------------------------------------------------------------------------
alter table public.program_days
add column watch_steps text check (
  watch_steps is null
  or char_length(watch_steps) <= 2000
);

comment on column public.program_days.watch_steps is 'The day''s steps in intervals.icu workout text (one step per line, "- 10m Z2 HR"; a "4x" line repeats the steps under it). Sent with the session to the athlete''s intervals.icu calendar, which turns it into a structured workout on her watch. Null: the session goes as a note with its notes and movements.';

-- ---------------------------------------------------------------------------
-- Sending, per athlete
-- ---------------------------------------------------------------------------
alter table public.companion_profiles
add column intervals_push boolean not null default false,
add column intervals_synced_at timestamptz,
add column intervals_sync_error text,
add column intervals_sync_lock timestamptz,
add column intervals_sync_again boolean not null default false;

comment on column public.companion_profiles.intervals_push is 'The coach sends this athlete''s planned sessions to her intervals.icu calendar. Turned on and off on the Companion card, or by the coach''s assistant.';

comment on column public.companion_profiles.intervals_synced_at is 'When Vela last brought her intervals.icu calendar in line with her sessions.';

comment on column public.companion_profiles.intervals_sync_error is 'Why the last sync failed, in words for the coach; null when it worked.';

comment on column public.companion_profiles.intervals_sync_lock is 'Set while a sync runs. Older than two minutes counts as abandoned.';

comment on column public.companion_profiles.intervals_sync_again is 'Something changed while a sync was running: it runs once more before letting go.';

-- ---------------------------------------------------------------------------
-- Which event is which session
-- ---------------------------------------------------------------------------
-- No foreign key to sessions: when a session is deleted (a programme unassigned, a day
-- removed), its row here is what says which intervals.icu event to delete.
create table public.intervals_events (
  client_id uuid not null references public.clients (id) on delete cascade,
  session_id uuid not null,
  -- The intervals.icu athlete the event was put on. A relink to another athlete moves
  -- the events: deleted from this one, created on the new one.
  icu_athlete_id text not null,
  -- Null for the moment between claiming the row and intervals.icu answering. A sync that
  -- finds it null and older than two minutes creates the event again.
  icu_event_id bigint,
  event_date date not null,
  -- What was sent, condensed: a sync sends only the sessions whose signature changed.
  signature text not null,
  synced_at timestamptz not null default now(),
  primary key (client_id, session_id)
);

comment on table public.intervals_events is 'The intervals.icu calendar events Vela made from an athlete''s sessions: one row per session, written by the coach''s syncs.';

alter table public.intervals_events enable row level security;

create policy intervals_events_coach on public.intervals_events for all using (public.is_coach_of (client_id))
with
  check (public.is_coach_of (client_id));

grant select, insert, update, delete on public.intervals_events to authenticated;

-- ---------------------------------------------------------------------------
-- The lock
-- ---------------------------------------------------------------------------
-- Claim: true when this caller now runs her sync. When someone else is running it, they
-- are asked to go round once more, and the caller can leave: the running sync will pick
-- up whatever the caller just changed. Security invoker, so only her coach claims it.
create or replace function public.intervals_sync_claim (p_client_id uuid) returns boolean language plpgsql security invoker
set
  search_path = public as $$
declare
  got boolean;
begin
  update companion_profiles
     set intervals_sync_lock = now(), intervals_sync_again = false
   where client_id = p_client_id
     and (intervals_sync_lock is null or intervals_sync_lock < now() - interval '2 minutes')
  returning true into got;
  if got then
    return true;
  end if;
  update companion_profiles set intervals_sync_again = true where client_id = p_client_id;
  return false;
end;
$$;

-- Release: true when the lock is let go. False when something changed while the sync ran;
-- the flag is cleared, the lock is kept, and the caller syncs once more. p_ok records the
-- outcome: the time on success, the error (or null) either way.
create or replace function public.intervals_sync_release (
  p_client_id uuid,
  p_ok boolean,
  p_error text default null
) returns boolean language plpgsql security invoker
set
  search_path = public as $$
declare
  got boolean;
begin
  update companion_profiles
     set intervals_sync_lock = null,
         intervals_synced_at = case when p_ok then now() else intervals_synced_at end,
         intervals_sync_error = p_error
   where client_id = p_client_id
     and not intervals_sync_again
  returning true into got;
  if got then
    return true;
  end if;
  update companion_profiles
     set intervals_sync_again = false, intervals_sync_lock = now()
   where client_id = p_client_id;
  return false;
end;
$$;

revoke all on function public.intervals_sync_claim (uuid) from public;
revoke all on function public.intervals_sync_release (uuid, boolean, text) from public;
grant execute on function public.intervals_sync_claim (uuid) to authenticated;
grant execute on function public.intervals_sync_release (uuid, boolean, text) to authenticated;
