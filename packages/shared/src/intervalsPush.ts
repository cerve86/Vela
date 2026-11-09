/**
 * Vela sessions → intervals.icu calendar events.
 *
 * Vela is where the plan lives; intervals.icu is how it reaches the watch. A coach turns
 * sending on for an athlete, and from then on her planned sessions for the next nine
 * weeks are mirrored onto her intervals.icu calendar, one event per session. intervals.icu
 * passes the coming week on to a Garmin, Coros or Suunto by itself, if she has allowed it.
 *
 * This file is the pure half: what an event says, and given what Vela holds and what was
 * sent before, what to create, update and delete. The portal does the sending
 * (apps/web/src/lib/intervalsPush.ts).
 *
 * What reaches the watch: a run whose day has watch steps (intervals.icu workout text,
 * "- 10m Z2 HR") becomes a structured workout. Everything else goes as a note-like
 * workout with its notes and movements as text. intervals.icu cannot send sets and reps
 * to a watch, so a strength session shows on her calendar and stays ticked off in Vela.
 */

/** How far the mirror reaches: yesterday (her today, wherever she is) to nine weeks on. */
export const PUSH_DAYS_BACK = 1;
export const PUSH_DAYS_AHEAD = 63;

/** A claimed row that never got its event id is retried after this long. */
export const PUSH_STALE_MS = 2 * 60_000;

export type PushSessionStatus = 'scheduled' | 'in_progress' | 'completed' | 'skipped';

export interface PushItem {
  block: string;
  exerciseName: string;
  sets: number;
  reps: string;
  targetLoadKg: number | null;
  targetRpe: number | null;
  tempo: string | null;
  restSec: number;
  notes: string | null;
}

/** A session as the mirror needs it. */
export interface PushSession {
  id: string;
  title: string;
  discipline: string;
  scheduledDate: string;
  status: PushSessionStatus;
  dayNotes: string | null;
  watchSteps: string | null;
  items: PushItem[];
}

/** The body of one intervals.icu calendar event (EventEx), as much of it as Vela sets. */
export interface IcuEventPayload {
  category: 'WORKOUT';
  start_date_local: string;
  type: string;
  name: string;
  description: string;
  external_id: string;
  /** Planned seconds; null when the steps say how long it is (clears a duration sent before). */
  moving_time?: number | null;
}

/**
 * The intervals.icu sport for a session. Its type decides the icon on her calendar and
 * the sport profile on her watch, so a swim in a cross-training day is a swim.
 */
export function icuSportType(discipline: string, title: string): string {
  switch (discipline) {
    case 'run':
      return 'Run';
    case 'strength':
      return 'WeightTraining';
    case 'cross': {
      const t = title.toLowerCase();
      if (/\b(swim|pool)/.test(t)) return 'Swim';
      if (/\b(bike|ride|spin|cycl|turbo|zwift)/.test(t)) return 'Ride';
      if (/\bhike/.test(t)) return 'Hike';
      if (/\bwalk/.test(t)) return 'Walk';
      if (/\brow/.test(t)) return 'Rowing';
      if (/\b(elliptical|cross ?trainer)/.test(t)) return 'Elliptical';
      return 'Workout';
    }
    default:
      // Mobility and rehab: a session, not a sport.
      return 'Workout';
  }
}

/**
 * intervals.icu reads a line that starts with "-" as a workout step and a line like "4x"
 * as a repeat. Notes and movement lines are text, so a coach's bullet must not turn into
 * a step: it becomes "•". Only the watch steps are parsed as steps.
 */
export function asPlainText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line.replace(/^(\s*)[-–—*]\s*/, '$1• ').replace(/^(\s*\d+)\s*[x×]\s*$/i, '$1 times'),
    )
    .join('\n')
    .trim();
}

/** One prescription as a line: "A. Romanian Deadlift — 3 × 8 to 10, 32.5 kg, RPE 7, rest 90s". */
export function itemLine(i: PushItem): string {
  return (
    `${i.block}. ${i.exerciseName} — ${i.sets} × ${i.reps}` +
    (i.targetLoadKg ? `, ${i.targetLoadKg} kg` : '') +
    (i.targetRpe ? `, RPE ${i.targetRpe}` : '') +
    (i.tempo ? `, tempo ${i.tempo}` : '') +
    `, rest ${i.restSec}s` +
    (i.notes ? ` — ${i.notes}` : '')
  );
}

/**
 * What she reads on intervals.icu: the day's notes, the movements, a line back to Vela,
 * and last the watch steps, so nothing after them is read as part of the workout.
 */
export function icuDescription(s: PushSession, companionUrl: string): string {
  const parts: string[] = [];
  if (s.dayNotes?.trim()) parts.push(asPlainText(s.dayNotes));
  if (s.items.length) parts.push(asPlainText(s.items.map(itemLine).join('\n')));
  parts.push(`From your Vela plan: ${companionUrl}`);
  if (s.watchSteps?.trim()) parts.push(s.watchSteps.trim());
  return parts.join('\n\n');
}

/**
 * Planned minutes from the notes' first line ("60 min · 8.1 km", the plan-sheet shape),
 * for a session with no watch steps, so her calendar shows how long it is. Steps carry
 * their own duration.
 */
export function plannedSeconds(notes: string | null): number | undefined {
  const first = notes?.trim().split(/\r?\n/)[0] ?? '';
  const m = /^(\d{1,3})\s*min\b/i.exec(first);
  if (!m) return undefined;
  const min = Number(m[1]);
  return min > 0 && min <= 600 ? min * 60 : undefined;
}

export function icuEventFor(s: PushSession, companionUrl: string): IcuEventPayload {
  const event: IcuEventPayload = {
    category: 'WORKOUT',
    start_date_local: `${s.scheduledDate}T00:00:00`,
    type: icuSportType(s.discipline, s.title),
    name: s.title.trim().slice(0, 80) || 'Session',
    description: icuDescription(s, companionUrl),
    external_id: `vela-${s.id}`,
  };
  // An update changes only the fields it sends, so steps added later must clear the
  // duration sent with the notes; intervals.icu then takes the length from the steps.
  if (s.watchSteps?.trim()) event.moving_time = null;
  else {
    const secs = plannedSeconds(s.dayNotes);
    if (secs) event.moving_time = secs;
  }
  return event;
}

/**
 * A short fingerprint of what was sent to whom, so a sync only sends what changed.
 * cyrb53: not cryptographic, and it does not need to be.
 */
export function eventSignature(event: IcuEventPayload, icuId: string): string {
  const str = JSON.stringify([icuId, event]);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** A row of intervals_events: what was sent for one session. */
export interface TrackedEvent {
  sessionId: string;
  icuAthleteId: string;
  /** Null between claiming the row and intervals.icu answering. */
  icuEventId: number | null;
  eventDate: string;
  signature: string;
  syncedAt: string;
}

export interface SyncPlan {
  /** New events. `retry` when the row exists already (a claim that never completed). */
  create: {
    sessionId: string;
    date: string;
    event: IcuEventPayload;
    signature: string;
    retry: boolean;
  }[];
  update: {
    sessionId: string;
    icuEventId: number;
    date: string;
    event: IcuEventPayload;
    signature: string;
  }[];
  /** Delete the event (when it has an id) and the row. */
  remove: { sessionId: string; icuAthleteId: string; icuEventId: number | null }[];
  /** Drop the row only: the event is in the past, and stays on her calendar as history. */
  forget: string[];
  /** Upcoming sessions already on her calendar as they are. */
  unchanged: number;
}

/**
 * What to do, given her sessions in the window and the events sent before.
 *
 * Sending (and linked): every scheduled session in the window should have an event, as it
 * is now. A session she did keeps its event (intervals.icu pairs it with the activity).
 * A session that went — skipped, removed, moved out of the window — takes its event
 * with it. Not sending: every upcoming event Vela made goes. Past events are never
 * touched; their rows are just forgotten.
 */
export function planIntervalsSync(input: {
  sending: boolean;
  icuId: string | null;
  sessions: PushSession[];
  tracked: TrackedEvent[];
  windowStart: string;
  now: number;
  companionUrl: string;
}): SyncPlan {
  const { sending, icuId, sessions, tracked, windowStart, now, companionUrl } = input;
  const plan: SyncPlan = { create: [], update: [], remove: [], forget: [], unchanged: 0 };
  const on = sending && !!icuId;
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const wanted = on ? sessions.filter((s) => s.status === 'scheduled') : [];
  const wantedIds = new Set(wanted.map((s) => s.id));
  const rows = new Map(tracked.map((t) => [t.sessionId, t]));

  for (const s of wanted) {
    const event = icuEventFor(s, companionUrl);
    const signature = eventSignature(event, icuId!);
    const row = rows.get(s.id);
    if (!row) {
      plan.create.push({ sessionId: s.id, date: s.scheduledDate, event, signature, retry: false });
    } else if (row.icuAthleteId !== icuId) {
      // Relinked to another intervals.icu athlete: off the old calendar, onto the new.
      plan.remove.push({
        sessionId: s.id,
        icuAthleteId: row.icuAthleteId,
        icuEventId: row.icuEventId,
      });
      plan.create.push({ sessionId: s.id, date: s.scheduledDate, event, signature, retry: false });
    } else if (row.icuEventId === null) {
      if (now - Date.parse(row.syncedAt) > PUSH_STALE_MS)
        plan.create.push({ sessionId: s.id, date: s.scheduledDate, event, signature, retry: true });
      else plan.unchanged++;
    } else if (row.signature !== signature) {
      plan.update.push({
        sessionId: s.id,
        icuEventId: row.icuEventId,
        date: s.scheduledDate,
        event,
        signature,
      });
    } else {
      plan.unchanged++;
    }
  }

  for (const row of tracked) {
    if (wantedIds.has(row.sessionId)) continue;
    if (row.eventDate < windowStart) {
      plan.forget.push(row.sessionId);
      continue;
    }
    const s = byId.get(row.sessionId);
    const done = s && (s.status === 'completed' || s.status === 'in_progress');
    if (on && done && row.icuAthleteId === icuId) continue;
    plan.remove.push({
      sessionId: row.sessionId,
      icuAthleteId: row.icuAthleteId,
      icuEventId: row.icuEventId,
    });
  }
  return plan;
}

/** The window's first and last dates, from a UTC "now". */
export function pushWindow(now: number): { from: string; to: string } {
  const day = 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(now - PUSH_DAYS_BACK * day), to: iso(now + PUSH_DAYS_AHEAD * day) };
}
