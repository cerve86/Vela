/**
 * Milestones — the three things worth noticing, derived from what actually happened.
 *
 * These are not badges handed out for opening the app. Each one is a claim about the
 * training record, so each is computed from the record rather than stored: nothing here can
 * drift out of sync with the sessions and meals it describes, and nothing can be awarded by
 * a bug in a write path. Recomputing is cheap and the truth is always the data.
 *
 * Deliberately three, and deliberately not scored. A list that grows every week turns into a
 * scoreboard, and a scoreboard is the wrong instrument for someone rebuilding after a birth
 * — the point is to notice a good week, not to rank it.
 *
 * Pure, and date-injected: no `Date.now()` anywhere, so the same inputs always give the same
 * answer and the whole thing is testable without freezing a clock.
 */

export type MilestoneKey = 'first-full-week' | 'fuel-week' | 'pain-under-three';

/** Which character carries the milestone. Green trains, amber feeds, violet recovers. */
export type MilestoneCharacter = 'athlete' | 'star' | 'cloud';

export interface Milestone {
  key: MilestoneKey;
  /** Two lines in the design; the break is the caller's business. */
  title: string;
  character: MilestoneCharacter;
  earned: boolean;
  /** The day it was earned, for "recently earned" treatment. Null while in progress. */
  earnedOn: string | null;
  /** What to show under the title: "Earned", "Day 4 of 7", "In progress". */
  label: string;
}

export interface MilestoneInput {
  /** Every session in the window, due or not. */
  sessions: { scheduledDate: string; status: string; painAfter: number | null }[];
  /** Distinct ISO days on which at least one meal was logged. Order does not matter. */
  fuelDays: string[];
  /** Today, as a local YYYY-MM-DD. */
  today: string;
}

/** The fuel streak target, and the number of readings the pain milestone judges on. */
export const FUEL_TARGET = 7;
export const PAIN_WINDOW = 3;
export const PAIN_CEILING = 3;

/** A milestone earned within this many days is still worth pointing at. */
export const RECENT_DAYS = 7;

export function deriveMilestones(input: MilestoneInput): Milestone[] {
  return [firstFullWeek(input), fuelWeek(input), painUnderThree(input)];
}

/** Whether any milestone was earned recently enough to be worth a dot on the tab. */
export function hasRecentlyEarned(milestones: Milestone[], today: string): boolean {
  return milestones.some(
    (m) => m.earnedOn !== null && daysBetween(m.earnedOn, today) <= RECENT_DAYS,
  );
}

/**
 * First full week — a completed week in which nothing was missed.
 *
 * "Full" is measured against what was due, not against a fixed number of sessions. A week
 * with two prescribed sessions and two completed is a full week; judging it against an
 * arbitrary three would mark someone down for following the programme she was given.
 *
 * The current week is excluded. It is not finished, so it cannot yet be kept — and showing
 * it as earned on Wednesday only to withdraw it on Sunday is worse than showing nothing.
 */
function firstFullWeek(input: MilestoneInput): Milestone {
  const thisWeek = startOfWeekIso(input.today);
  const byWeek = new Map<string, { due: number; kept: number; last: string }>();

  for (const s of input.sessions) {
    const week = startOfWeekIso(s.scheduledDate);
    if (week >= thisWeek) continue;

    /**
     * Every session in a finished week was due.
     *
     * This used to test for a 'missed' status, which does not exist: session_status is
     * ('scheduled','in_progress','completed','skipped') and "missed" is a display state the
     * heatmap derives from a past date that was never completed. So the test never matched,
     * a skipped session was not counted as due, and a week where she completed two of three
     * was awarded as a full week. Exactly the false award this milestone exists to avoid.
     *
     * The current week is already excluded above, so there is no future session here to
     * mistake for a due one and no status check is needed at all.
     */
    const entry = byWeek.get(week) ?? { due: 0, kept: 0, last: s.scheduledDate };
    entry.due += 1;
    if (s.status === 'completed') {
      entry.kept += 1;
      if (s.scheduledDate > entry.last) entry.last = s.scheduledDate;
    }
    byWeek.set(week, entry);
  }

  const full = [...byWeek.entries()]
    .filter(([, v]) => v.due > 0 && v.kept === v.due)
    .sort(([a], [b]) => (a < b ? -1 : 1));

  const first = full[0];

  if (first) {
    return {
      key: 'first-full-week',
      title: 'First full week',
      character: 'athlete',
      earned: true,
      earnedOn: first[1].last,
      label: 'Earned',
    };
  }

  // Say how close the best week came, rather than "In progress" — a near miss is
  // information, and "3 of 4 kept" is the sentence that makes the next week feel gettable.
  const best = [...byWeek.values()].sort((a, b) => b.kept / b.due - a.kept / a.due)[0];

  return {
    key: 'first-full-week',
    title: 'First full week',
    character: 'athlete',
    earned: false,
    earnedOn: null,
    label: best ? `Best ${best.kept} of ${best.due}` : 'Not started',
  };
}

/**
 * Fuel logged seven days — consecutive days with at least one meal on them.
 *
 * The run is counted back from today, and from yesterday if today is still empty. Without
 * that second start a six-day streak reads as zero every morning until breakfast is logged,
 * which is precisely when someone would look at it and conclude the streak had broken.
 */
function fuelWeek(input: MilestoneInput): Milestone {
  const days = new Set(input.fuelDays);
  const from = days.has(input.today) ? input.today : shiftIso(input.today, -1);

  let run = 0;
  let cursor = from;
  while (days.has(cursor) && run < FUEL_TARGET) {
    run += 1;
    cursor = shiftIso(cursor, -1);
  }

  const earned = run >= FUEL_TARGET;

  return {
    key: 'fuel-week',
    title: 'Fuel logged seven days',
    character: 'star',
    earned,
    // The streak's final day, which is where it was reached rather than when it started.
    earnedOn: earned ? from : null,
    label: earned ? 'Earned' : run === 0 ? 'Not started' : `Day ${run} of ${FUEL_TARGET}`,
  };
}

/**
 * Pain under three — the last three logged sessions all below three.
 *
 * Judged on the most recent readings rather than an all-time average, because the question
 * this answers is "is it settling now", and an average is dragged down forever by a bad
 * fortnight in week one. Sessions with no score are skipped, not counted as zero: an unasked
 * question is not an answer of "no pain".
 */
function painUnderThree(input: MilestoneInput): Milestone {
  const scored = input.sessions
    .filter((s) => s.status === 'completed' && s.painAfter !== null)
    .sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1))
    .slice(0, PAIN_WINDOW);

  const under = scored.filter((s) => (s.painAfter ?? Infinity) < PAIN_CEILING);
  const earned = scored.length === PAIN_WINDOW && under.length === PAIN_WINDOW;

  return {
    key: 'pain-under-three',
    title: 'Pain under three',
    character: 'cloud',
    earned,
    earnedOn: earned ? (scored[0]?.scheduledDate ?? null) : null,
    label: earned
      ? 'Earned'
      : scored.length === 0
        ? 'No scores yet'
        : `${under.length} of ${PAIN_WINDOW} sessions`,
  };
}

/* ─────────────────────────────────────────────────────────────
 * Date helpers — string in, string out, no Date arithmetic leaking out
 * ───────────────────────────────────────────────────────────── */

/** Sunday-based, matching the week strip and heatmap on Progress. */
function startOfWeekIso(iso: string): string {
  const dt = parse(iso);
  return shiftIso(iso, -dt.getDay());
}

function shiftIso(iso: string, days: number): string {
  const dt = parse(iso);
  dt.setDate(dt.getDate() + days);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = parse(toIso).getTime() - parse(fromIso).getTime();
  return Math.round(ms / 86_400_000);
}

/** Local midnight, not UTC — these are calendar dates, and a UTC parse shifts the day. */
function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
