/**
 * Is an athlete's intervals.icu actually feeding Vela? Read from what intervals.icu hands
 * back, so the coach's portal and the athlete's setup guide tell the same story.
 *
 * Two things about intervals.icu's API decide the answer, and neither is visible from its
 * website:
 *
 * - It withholds some activities. Strava's terms forbid passing Strava data on, so an
 *   activity that reached intervals.icu through Strava comes back as a stub: its source,
 *   its date and a `_note`, with no distance, time or effort. The coach sees the run on
 *   intervals.icu; Vela never can. Garmin's new terms may do the same to Garmin data, and
 *   a withheld Garmin activity would carry the same note, so the note is what is read.
 * - It writes a wellness row for every day with training (fitness, fatigue, form), so a
 *   row alone says nothing. Only a reading counts: HRV, resting HR, sleep.
 *
 * Pure: the fetching is the server's (apps/web src/lib/intervals.ts).
 */

/** An activity as intervals.icu's API returns it; only what this file reads. */
export interface IcuActivityLike {
  source?: string | null;
  _note?: string | null;
  start_date_local?: string | null;
}

/** A wellness row as intervals.icu's API returns it (or as Vela's route normalises it). */
export interface IcuWellnessLike {
  id?: string | null;
  date?: string | null;
  hrv?: number | null;
  restingHR?: number | null;
  sleepSecs?: number | null;
  weight?: number | null;
}

/** Where an activity came from, in the words an athlete would use. */
const SOURCE_NAMES: Record<string, string> = {
  GARMIN_CONNECT: 'Garmin',
  COROS: 'Coros',
  POLAR: 'Polar',
  SUUNTO: 'Suunto',
  WAHOO: 'Wahoo',
  ZEPP: 'Amazfit',
  HUAWEI: 'Huawei',
  ZWIFT: 'Zwift',
  CONCEPT2: 'Concept2',
  STRAVA: 'Strava',
  UPLOAD: 'file uploads',
  MANUAL: 'manual entries',
  OAUTH_CLIENT: 'a connected app',
  DROPBOX: 'Dropbox',
};

export function icuSourceName(source: string | null | undefined): string {
  return (source && SOURCE_NAMES[source]) || 'another app';
}

/** intervals.icu holds this activity but will not share it with Vela. */
export function icuWithheld(a: IcuActivityLike): boolean {
  return a.source === 'STRAVA' || (typeof a._note === 'string' && a._note.trim() !== '');
}

const reading = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** The day carries something the companion reads, rather than only fitness and fatigue. */
export function icuHasReading(w: IcuWellnessLike): boolean {
  return reading(w.hrv) || reading(w.restingHR) || reading(w.sleepSecs) || reading(w.weight);
}

export type IcuIssue =
  /** Every activity came in through Strava (or another withheld source): Vela sees none. */
  | 'withheld-only'
  /** No HRV and no resting HR in the window: the watch's wellness sync is off. */
  | 'no-wellness'
  /** Some activities are withheld beside ones that come through. Worth a word, not a fix. */
  | 'some-withheld'
  /** No activities at all in the window. */
  | 'no-activities';

export interface IcuConnection {
  /** Days in the wellness window, and how many of them had each reading. */
  days: number;
  hrvDays: number;
  restingDays: number;
  /** Activities intervals.icu shared, by where they came from, most first. */
  shared: { name: string; count: number }[];
  sharedCount: number;
  /** Activities intervals.icu holds but withholds from Vela, by where they came from. */
  withheld: { name: string; count: number }[];
  withheldCount: number;
  /** The newest activity date (shared or withheld), "YYYY-MM-DD", or null. */
  lastActivity: string | null;
  /** The newest day with an HRV or resting HR reading, or null. */
  lastReading: string | null;
  /** The one thing to fix, most important first; null when everything is coming through. */
  issue: IcuIssue | null;
}

function bySource(list: IcuActivityLike[]): { name: string; count: number }[] {
  const acc = new Map<string, number>();
  for (const a of list) {
    const name = icuSourceName(a.source);
    acc.set(name, (acc.get(name) ?? 0) + 1);
  }
  return [...acc.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((x, y) => y.count - x.count || x.name.localeCompare(y.name));
}

/**
 * What came through from intervals.icu over the last `days` days of wellness and the
 * activities given (the caller picks the activity window; four weeks reads a normal
 * training pattern without waiting on a long history).
 */
export function readIcuConnection(input: {
  wellness: IcuWellnessLike[];
  activities: IcuActivityLike[];
  days: number;
}): IcuConnection {
  const withheldList = input.activities.filter(icuWithheld);
  const sharedList = input.activities.filter((a) => !icuWithheld(a));
  const day = (w: IcuWellnessLike) => String(w.id ?? w.date ?? '').slice(0, 10);
  const hrv = new Set(input.wellness.filter((w) => reading(w.hrv)).map(day));
  const resting = new Set(input.wellness.filter((w) => reading(w.restingHR)).map(day));
  hrv.delete('');
  resting.delete('');
  const readingDays = [...new Set([...hrv, ...resting])].sort();
  const dates = input.activities
    .map((a) => String(a.start_date_local ?? '').slice(0, 10))
    .filter(Boolean)
    .sort();

  let issue: IcuIssue | null = null;
  if (withheldList.length > 0 && sharedList.length === 0) issue = 'withheld-only';
  else if (hrv.size === 0 && resting.size === 0) issue = 'no-wellness';
  else if (withheldList.length > 0) issue = 'some-withheld';
  else if (sharedList.length === 0) issue = 'no-activities';

  return {
    days: input.days,
    hrvDays: hrv.size,
    restingDays: resting.size,
    shared: bySource(sharedList),
    sharedCount: sharedList.length,
    withheld: bySource(withheldList),
    withheldCount: withheldList.length,
    lastActivity: dates.at(-1) ?? null,
    lastReading: readingDays.at(-1) ?? null,
    issue,
  };
}

/**
 * The athlete's intervals.icu id from what a coach is likely to paste: the id itself
 * ("i12345", or the all-digit ids of older accounts) or any intervals.icu link with it in
 * the path (".../athlete/i12345/calendar"). null when there is no id in it.
 */
export function parseIcuId(input: string): string | null {
  const s = input.trim();
  if (/^i?\d{1,12}$/i.test(s)) return s.toLowerCase();
  const m = /intervals\.icu\/(?:api\/v1\/)?athlete\/(i?\d{1,12})(?:[/?#]|$)/i.exec(s);
  return m ? m[1]!.toLowerCase() : null;
}
