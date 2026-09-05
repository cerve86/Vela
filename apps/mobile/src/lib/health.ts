import { Platform } from 'react-native';
import { importHealthSamples, type HealthSample, type MetricType } from '@vela/api';
import {
  baseline,
  cardioLoad,
  heartRateCeiling,
  maxHeartRate,
  percentile,
  type HeartRateBucket,
} from '@vela/shared';
import { supabase } from './supabase';

/**
 * Apple Health integration.
 *
 * Read-only. Vela never writes to HealthKit and never asks for data it does not use —
 * Apple reviews this, and more importantly a client can see exactly what she granted.
 *
 * The native module is loaded lazily through require() rather than a static import so
 * the app still runs in environments without it (Expo Go, the web preview, a simulator
 * build made before the module was added). Without this the whole bundle fails to load
 * rather than the one screen that needs HealthKit.
 */

interface QuantityRow {
  uuid: string;
  quantity: number;
  startDate: string | Date;
  endDate: string | Date;
}

interface CategoryRow {
  uuid: string;
  /** For sleep analysis: see ASLEEP_VALUES. */
  value: number;
  startDate: string | Date;
  endDate: string | Date;
}

const SLEEP_IDENTIFIER = 'HKCategoryTypeIdentifierSleepAnalysis';

/**
 * Instantaneous heart rate. Read through the statistics collection rather than as samples,
 * and never stored raw — it becomes one `cardio_load` figure per day. See `readCardioLoad`.
 */
const HEART_RATE_IDENTIFIER = 'HKQuantityTypeIdentifierHeartRate';

/** How finely the day is cut when weighting heart rate. */
const HR_BUCKET_MINUTES = 5;

/**
 * Sleep-analysis values, mapped to what each one is worth keeping as.
 *
 * The stages are kept separately as well as summed. How a night was composed matters more
 * than its length — seven hours that were nearly all light sleep is not the same night as
 * seven with normal deep and REM, and recovery cannot tell them apart from a total alone.
 *
 * 0 inBed is dropped entirely: it overlaps the stages and would double-count. 2 awake is
 * kept, but as its own metric rather than as sleep — time awake in bed is a fact about the
 * night, and counting it as sleep is how a restless night reads as eight hours.
 */
const SLEEP_STAGE: Record<number, MetricType | undefined> = {
  1: 'sleep_core_min', // asleepUnspecified — older watches report only this
  2: 'sleep_awake_min',
  3: 'sleep_core_min',
  4: 'sleep_deep_min',
  5: 'sleep_rem_min',
};

/** The stages that count towards the night's total. */
const ASLEEP_STAGES: ReadonlySet<MetricType> = new Set<MetricType>([
  'sleep_core_min',
  'sleep_deep_min',
  'sleep_rem_min',
]);

/** One five-minute slice of the day, as HealthKit summarised it. */
interface StatisticsBucket {
  startDate?: Date | string;
  endDate?: Date | string;
  averageQuantity?: { quantity: number; unit: string };
}

/** The slice of @kingstinct/react-native-healthkit v14 that Vela uses. */
export interface HealthKitModule {
  /** Synchronous in v14; awaiting a non-promise is harmless, so callers can await it. */
  isHealthDataAvailable: () => boolean;
  /** Single argument in v14: `{ toRead, toShare }`. Passing two silently throws. */
  requestAuthorization: (toRequest: {
    toRead?: readonly string[];
    toShare?: readonly string[];
  }) => Promise<boolean>;
  queryQuantitySamples: (
    identifier: string,
    options: {
      limit: number;
      unit?: string;
      ascending?: boolean;
      filter?: { date?: { startDate?: Date; endDate?: Date } };
    },
  ) => Promise<readonly QuantityRow[]>;
  /** Sleep is a category type, not a quantity — a different call with no unit. */
  queryCategorySamples: (
    identifier: string,
    options: {
      limit: number;
      ascending?: boolean;
      filter?: { date?: { startDate?: Date; endDate?: Date } };
    },
  ) => Promise<readonly CategoryRow[]>;
  /**
   * Bucketed statistics, computed by HealthKit rather than here.
   *
   * This is the only workable way to read heart rate. A watch records it every few seconds
   * during a workout, so a month of samples runs to tens of thousands of rows — far past
   * the `limit` the sample queries take, and a waste of the bridge even if it were not.
   * Asking HealthKit for a five-minute average returns roughly 288 small objects a day and
   * does the aggregation in native code where the samples already live.
   */
  queryStatisticsCollectionForQuantity: (
    identifier: string,
    statistics: readonly string[],
    anchorDate: Date,
    intervalComponents: { minute?: number; hour?: number; day?: number },
    options?: { unit?: string; filter?: { date?: { startDate?: Date; endDate?: Date } } },
  ) => Promise<readonly StatisticsBucket[]>;
}

/**
 * HealthKit identifier → our metric type, with the unit we ask for.
 *
 * The unit is always explicit: HealthKit will happily answer body mass in pounds on a
 * US-locale phone, and a silently mixed-unit weight series is worse than no series. VO₂
 * max has only one unit in HealthKit, but naming it keeps the table uniform.
 */
const READ_MAP: { identifier: string; type: MetricType; unit: string }[] = [
  { identifier: 'HKQuantityTypeIdentifierBodyMass', type: 'weight_kg', unit: 'kg' },
  { identifier: 'HKQuantityTypeIdentifierBodyFatPercentage', type: 'body_fat_pct', unit: '%' },
  { identifier: 'HKQuantityTypeIdentifierRestingHeartRate', type: 'resting_hr', unit: 'count/min' },
  { identifier: 'HKQuantityTypeIdentifierStepCount', type: 'steps', unit: 'count' },
  { identifier: 'HKQuantityTypeIdentifierVO2Max', type: 'vo2max', unit: 'ml/(kg*min)' },
  // The whole day's effort, whatever produced it. This is what makes strain reflect a run
  // she went on rather than only the sets Vela had written down for her.
  { identifier: 'HKQuantityTypeIdentifierActiveEnergyBurned', type: 'active_energy_kcal', unit: 'kcal' },
  { identifier: 'HKQuantityTypeIdentifierAppleExerciseTime', type: 'exercise_min', unit: 'min' },
];

/**
 * Readings the watch takes while she sleeps, filed to the morning she woke.
 *
 * These used to sit in READ_MAP and be averaged by sample timestamp, which split every
 * night down the middle: the readings before midnight went under yesterday's key and the
 * ones after under today's, and "last night" then saw only the second half. Sleep itself was
 * already attributed to the wake morning; these get the same treatment. See `nightKey`.
 *
 * Both are the early signals recovery leans on — a rising breathing rate or a falling HRV
 * moves days before she feels anything — which is exactly why they must be read as whole
 * nights rather than as halves.
 */
const NIGHT_MAP: { identifier: string; type: MetricType; unit: string }[] = [
  { identifier: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', type: 'hrv_ms', unit: 'ms' },
  { identifier: 'HKQuantityTypeIdentifierRespiratoryRate', type: 'respiratory_rate', unit: 'count/min' },
];

/**
 * Which morning a night-time reading belongs to, or null if it was not taken at night.
 *
 * Before midday it is last night, ending this morning. From eight in the evening it is
 * tonight, which ends tomorrow morning. The afternoon in between is excluded: an HRV taken
 * during a Breathe session at three o'clock is a different measurement from an overnight
 * one, noisier and not what recovery is asking about.
 */
function nightKey(d: Date): string | null {
  const h = d.getHours();
  if (h < 12) return localDayKey(d);
  if (h >= 20) {
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    return localDayKey(next);
  }
  return null;
}

export const READ_PERMISSION_LABELS = [
  'Body weight',
  'Body fat percentage',
  'Resting heart rate',
  'Heart rate variability',
  'Steps',
  'VO₂ max',
  'Sleep, including its stages',
  'Active energy and exercise minutes',
  'Heart rate',
  'Breathing rate',
];

let cached: HealthKitModule | null | undefined;

function loadModule(): HealthKitModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS !== 'ios') {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@kingstinct/react-native-healthkit');
    cached = (mod.default ?? mod) as HealthKitModule;
  } catch {
    cached = null;
  }
  return cached;
}

export async function isHealthAvailable(): Promise<boolean> {
  const hk = loadModule();
  if (!hk) return false;
  try {
    return Boolean(await hk.isHealthDataAvailable());
  } catch {
    return false;
  }
}

export async function requestHealthAccess(): Promise<{ granted: boolean; error: string | null }> {
  const hk = loadModule();
  if (!hk) return { granted: false, error: 'Apple Health is not available on this device.' };
  try {
    // No toShare key at all: read-only, explicitly.
    const granted = await hk.requestAuthorization({
      // Sleep and heart rate ride along here rather than in READ_MAP. Sleep is a category
      // type; heart rate is a quantity but is never rolled up as a daily mean, because the
      // mean of a day's heart rate is a number about nothing.
      toRead: [
        ...READ_MAP.map((r) => r.identifier),
        ...NIGHT_MAP.map((r) => r.identifier),
        SLEEP_IDENTIFIER,
        HEART_RATE_IDENTIFIER,
      ],
    });
    return { granted, error: null };
  } catch (e) {
    return { granted: false, error: e instanceof Error ? e.message : 'Could not ask for access.' };
  }
}

/**
 * Metric types HealthKit records as an accumulating count rather than a state.
 *
 * The distinction decides how a day's samples combine. Steps arrive as dozens of short
 * interval samples — 137 here, 8 there — and a day only means anything summed. Sleep is the
 * same shape for a different reason: a night is delivered as its stages, and the night is
 * their sum. Weight or HRV are readings of a state at a moment, where a sum would be
 * nonsense and the mean of however many readings that day is the honest summary.
 */
const CUMULATIVE: ReadonlySet<MetricType> = new Set<MetricType>([
  'steps',
  'sleep_min',
  'sleep_deep_min',
  'sleep_rem_min',
  'sleep_core_min',
  'sleep_awake_min',
  'active_energy_kcal',
  'exercise_min',
  'cardio_load',
]);

/** `YYYY-MM-DD` in the phone's own timezone — see the note in `syncHealth`. */
function localDayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Reads a window of samples and imports them as one reading per metric per day.
 *
 * We deliberately re-read an overlapping window rather than tracking a high-water mark:
 * HealthKit backfills late (a scale syncs hours afterwards), so a strict watermark
 * silently loses readings. Overlap is free because the import upserts on a day key.
 *
 * The rollup is the important part, and it was not always here. Storing HealthKit's raw
 * samples put 2,056 step rows and 494 HRV rows into a single client's 90 days, which was
 * wrong twice over: a chart point read "168 steps" because it was one ten-minute bucket
 * rather than a day, and the sheer row count pushed the table past the ceiling the read
 * query silently truncates at, so the newest fortnight stopped arriving at all.
 *
 * Bucketing happens here, on the phone, rather than in SQL, because only the device knows
 * which timezone the person was actually living in. A day summed in UTC would cut a
 * Singapore day at 8am and split one walk across two points.
 */
export async function syncHealth(days = 30): Promise<{
  written: number;
  scanned: number;
  error: string | null;
}> {
  const hk = loadModule();
  if (!hk) return { written: 0, scanned: 0, error: 'Apple Health is not available on this device.' };

  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);

  // (type, local day) -> running total, count, and the latest moment seen in that day.
  const buckets = new Map<string, { type: MetricType; day: string; total: number; n: number; at: number }>();
  let scanned = 0;

  try {
    for (const entry of READ_MAP) {
      const rows = await hk.queryQuantitySamples(entry.identifier, {
        limit: 5000,
        unit: entry.unit,
        filter: { date: { startDate: from, endDate: to } },
      });
      for (const r of rows) {
        if (!Number.isFinite(r.quantity)) continue;
        const when = new Date(r.endDate ?? r.startDate);
        if (Number.isNaN(when.getTime())) continue;

        scanned++;
        const day = localDayKey(when);
        const key = `${entry.type}:${day}`;
        const b = buckets.get(key);
        if (b) {
          b.total += r.quantity;
          b.n++;
          if (when.getTime() > b.at) b.at = when.getTime();
        } else {
          buckets.set(key, { type: entry.type, day, total: r.quantity, n: 1, at: when.getTime() });
        }
      }
    }

    // The night readings, keyed to the morning they belong to. Same accumulator as the
    // day readings; only the key differs.
    for (const entry of NIGHT_MAP) {
      const rows = await hk.queryQuantitySamples(entry.identifier, {
        limit: 5000,
        unit: entry.unit,
        filter: { date: { startDate: from, endDate: to } },
      });
      for (const r of rows) {
        if (!Number.isFinite(r.quantity)) continue;
        const when = new Date(r.endDate ?? r.startDate);
        if (Number.isNaN(when.getTime())) continue;
        const day = nightKey(when);
        if (!day) continue;

        scanned++;
        const key = `${entry.type}:${day}`;
        const b = buckets.get(key);
        if (b) {
          b.total += r.quantity;
          b.n++;
          if (when.getTime() > b.at) b.at = when.getTime();
        } else {
          buckets.set(key, { type: entry.type, day, total: r.quantity, n: 1, at: when.getTime() });
        }
      }
    }

    /**
     * Sleep, attributed to the morning you woke.
     *
     * Segments are summed per night rather than taken as one block: Apple splits a night
     * into core, deep and REM stages, plus wakes, so a single night arrives as a dozen
     * rows and the longest of them is not the night's sleep.
     *
     * Only segments ending before midday count. Sleep is the thing recovery is asked about,
     * and without that cut an afternoon nap lands on the same day key and inflates last
     * night. It does mean a night-shift sleep from 09:00 is missed, which for this
     * population is the right trade — and it is a miss rather than a wrong number.
     */
    const sleepRows = await hk.queryCategorySamples(SLEEP_IDENTIFIER, {
      limit: 5000,
      filter: { date: { startDate: from, endDate: to } },
    });

    for (const r of sleepRows) {
      const stage = SLEEP_STAGE[r.value];
      if (!stage) continue;

      const start = new Date(r.startDate);
      const end = new Date(r.endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      if (end.getHours() >= 12) continue;

      const minutes = (end.getTime() - start.getTime()) / 60000;
      if (!(minutes > 0)) continue;

      scanned++;
      const day = localDayKey(end);

      // The stage, and the total it contributes to. Both are written, so a screen can ask
      // either "how long" or "how well" without recombining anything.
      const targets: MetricType[] = ASLEEP_STAGES.has(stage) ? [stage, 'sleep_min'] : [stage];

      for (const type of targets) {
        const key = `${type}:${day}`;
        const b = buckets.get(key);
        if (b) {
          b.total += minutes;
          b.n++;
          if (end.getTime() > b.at) b.at = end.getTime();
        } else {
          buckets.set(key, { type, day, total: minutes, n: 1, at: end.getTime() });
        }
      }
    }
  } catch (e) {
    return {
      written: 0,
      scanned,
      error: e instanceof Error ? e.message : 'Could not read from Apple Health.',
    };
  }

  /**
   * Heart rate, in its own try.
   *
   * Deliberately not inside the block above: this is the one read that depends on a newer
   * library call, and everything else here is worth having without it. A phone that cannot
   * answer the statistics query should lose the effort figure and keep its weight, sleep and
   * steps, rather than failing the whole sync and reporting that Apple Health is broken.
   */
  try {
    const restingByDay = new Map<string, number>();
    for (const b of buckets.values()) {
      if (b.type === 'resting_hr' && b.n > 0) restingByDay.set(b.day, b.total / b.n);
    }

    const load = await readCardioLoad(hk, from, to, restingByDay);
    for (const [day, entry] of load) {
      scanned += entry.samples;
      buckets.set(`cardio_load:${day}`, {
        type: 'cardio_load',
        day,
        total: entry.load,
        n: 1,
        at: entry.at,
      });
    }
  } catch {
    // See above. Strain falls back to active energy, and then to prescribed sets.
  }

  const samples: HealthSample[] = [];
  for (const [key, b] of buckets) {
    samples.push({
      type: b.type,
      value: CUMULATIVE.has(b.type) ? b.total : b.total / b.n,
      recordedAt: new Date(b.at).toISOString(),
      // The day key IS the identity. A HealthKit sample UUID cannot serve here: the same
      // day is re-read on every sync and has to land on the same row, updating as later
      // samples raise the total, rather than accumulating a new row each time.
      externalId: key,
    });
  }

  const { written, error } = await importHealthSamples(supabase, samples);
  return { written, scanned, error };
}

/**
 * Days of heart rate the ceiling is drawn from. Deliberately longer than the load window.
 *
 * The ceiling and the loads used to come from the same thirty days, and that made the scale
 * a function of what happened to fall off the back of the window: the day her hardest run
 * aged out, every reserve widened and every load rose, with no change in her at all. Sixty
 * days for the ceiling means a hard effort defines the scale for two months rather than one,
 * and the loads written in the last thirty are all measured against the same ceiling.
 *
 * The exponential made this worse than a uniform rescale. Shrinking the reserve span
 * shrinks a hard day's load proportionally more than an easy day's, so the ratio strain
 * shows — today against her peak — did not cancel the shift; it distorted it.
 */
const CEILING_DAYS = 60;

/**
 * A day-by-day cardiovascular load, from five-minute heart rate averages.
 *
 * The shape of the calculation lives in `@vela/shared` so it is testable and so the coach's
 * portal can one day read it the same way. What belongs here is everything that needs the
 * device: the timezone the day was actually lived in, and the two personal numbers the
 * weighting is relative to.
 *
 * Returns nothing at all rather than a poor guess. A load computed against a scale we do not
 * really have is worse than no strain figure, because the screen has an honest fallback and
 * a wrong number has nothing behind it.
 */
async function readCardioLoad(
  hk: HealthKitModule,
  from: Date,
  to: Date,
  restingByDay: Map<string, number>,
): Promise<Map<string, { load: number; at: number; samples: number }>> {
  const empty = new Map<string, { load: number; at: number; samples: number }>();

  const ceilingFrom = new Date(to.getTime() - CEILING_DAYS * 86400000);

  // Anchored to local midnight so the buckets line up with clock time rather than with
  // whatever moment the sync happened to run.
  const anchor = new Date(ceilingFrom);
  anchor.setHours(0, 0, 0, 0);

  // Averages only. The per-bucket maximum used to be requested for the ceiling, and it is
  // exactly the value a strap artifact lands in — see `heartRateCeiling`.
  const rows = await hk.queryStatisticsCollectionForQuantity(
    HEART_RATE_IDENTIFIER,
    ['discreteAverage'],
    anchor,
    { minute: HR_BUCKET_MINUTES },
    { unit: 'count/min', filter: { date: { startDate: ceilingFrom, endDate: to } } },
  );

  const perDay = new Map<string, { buckets: HeartRateBucket[]; at: number }>();
  const averages: number[] = [];
  const loadFrom = from.getTime();

  for (const r of rows) {
    const avg = r.averageQuantity?.quantity;
    if (typeof avg !== 'number' || !Number.isFinite(avg) || avg <= 0) continue;

    const stamp = r.endDate ?? r.startDate;
    if (!stamp) continue;
    const end = new Date(stamp);
    if (Number.isNaN(end.getTime())) continue;

    // Every bucket feeds the ceiling; only the recent ones get a load written.
    averages.push(avg);
    if (end.getTime() < loadFrom) continue;

    const day = localDayKey(end);
    const entry = perDay.get(day) ?? { buckets: [], at: 0 };
    // Every bucket that holds a reading is counted as its full five minutes. HealthKit
    // returns no bucket at all where the watch recorded nothing, so this reads as "her
    // heart was doing roughly this for these five minutes", which is the claim intended.
    entry.buckets.push({ minutes: HR_BUCKET_MINUTES, bpm: avg });
    if (end.getTime() > entry.at) entry.at = end.getTime();
    perDay.set(day, entry);
  }

  if (perDay.size === 0) return empty;

  /**
   * The floor — and the same definition recovery uses for its resting-rate baseline: the
   * median of Apple's daily figure with today left out, once there are enough days for a
   * median to mean anything. There used to be two definitions of her resting rate in the
   * product, one including today and one not, and neither knew about the other.
   *
   * Apple's figure is preferred because it is computed from far more than this window.
   * Failing that, the quiet end of her own distribution is a resting measurement in all but
   * name.
   */
  const todayKey = localDayKey(to);
  const reported = [...restingByDay.entries()]
    .filter(([d, v]) => d !== todayKey && v > 0)
    .map(([, v]) => v);
  const restingHr = baseline(reported) ?? percentile(averages, 0.05);
  if (restingHr === null) return empty;

  const maxHr = maxHeartRate({
    // Not collected anywhere in the product today — the column exists and nothing fills it.
    // Passing it explicitly rather than omitting it is what makes this one line to change
    // if intake ever asks.
    dateOfBirth: null,
    observedMaxHr: heartRateCeiling(averages),
    onDate: todayKey,
  });
  if (maxHr === null) return empty;

  const scale = { restingHr: Math.round(restingHr), maxHr };

  // A span this narrow means we are looking at a quiet fortnight rather than a real ceiling,
  // and every reserve computed from it would be overstated. Better to say nothing yet.
  if (scale.maxHr - scale.restingHr < 40) return empty;

  const out = new Map<string, { load: number; at: number; samples: number }>();
  for (const [day, entry] of perDay) {
    const load = cardioLoad(entry.buckets, scale);
    // Zero is a fact — a day she genuinely rested — and is written, so the chart shows a
    // rest day rather than a gap that reads as a missing sync.
    out.set(day, { load: Math.round(load * 10) / 10, at: entry.at, samples: entry.buckets.length });
  }
  return out;
}
