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
 * Reads a window of samples and imports them.
 *
 * We deliberately re-read an overlapping window rather than tracking a high-water mark:
 * HealthKit backfills late (a scale syncs hours afterwards), so a strict watermark
 * silently loses readings. The database deduplicates on the sample UUID, so overlap is
 * free and correctness does not depend on the client tracking state properly.
 */
export async function syncHealth(days = 30): Promise<{
  inserted: number;
  scanned: number;
  error: string | null;
}> {
  const hk = loadModule();
  if (!hk) return { inserted: 0, scanned: 0, error: 'Apple Health is not available on this device.' };

  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const samples: HealthSample[] = [];

  try {
    for (const entry of READ_MAP) {
      const rows = await hk.queryQuantitySamples(entry.identifier, {
        limit: 2000,
        unit: entry.unit,
        filter: { date: { startDate: from, endDate: to } },
      });
      for (const r of rows) {
        if (!r.uuid) continue;
        if (!Number.isFinite(r.quantity)) continue;
        samples.push({
          type: entry.type,
          value: r.quantity,
          recordedAt: new Date(r.endDate ?? r.startDate).toISOString(),
          externalId: r.uuid,
        });
      }
    }
  } catch (e) {
    return {
      inserted: 0,
      scanned: samples.length,
      error: e instanceof Error ? e.message : 'Could not read from Apple Health.',
    };
  }

  const { inserted, error } = await importHealthSamples(supabase, samples);
  return { inserted, scanned: samples.length, error };
}
