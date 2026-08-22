import { Platform } from 'react-native';
import { importHealthSamples, type HealthSample, type MetricType } from '@vela/api';
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
  { identifier: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', type: 'hrv_ms', unit: 'ms' },
  { identifier: 'HKQuantityTypeIdentifierStepCount', type: 'steps', unit: 'count' },
  { identifier: 'HKQuantityTypeIdentifierVO2Max', type: 'vo2max', unit: 'ml/(kg*min)' },
];

export const READ_PERMISSION_LABELS = [
  'Body weight',
  'Body fat percentage',
  'Resting heart rate',
  'Heart rate variability',
  'Steps',
  'VO₂ max',
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
      toRead: READ_MAP.map((r) => r.identifier),
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
 * interval samples — 137 here, 8 there — and a day only means anything summed. Weight or
 * HRV are readings of a state at a moment, where a sum would be nonsense and the mean of
 * however many readings that day is the honest summary.
 */
const CUMULATIVE: ReadonlySet<MetricType> = new Set<MetricType>(['steps']);

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
  } catch (e) {
    return {
      written: 0,
      scanned,
      error: e instanceof Error ? e.message : 'Could not read from Apple Health.',
    };
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
