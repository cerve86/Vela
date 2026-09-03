import type { VelaClient } from './client';

export type MetricType =
  | 'weight_kg'
  | 'body_fat_pct'
  | 'waist_cm'
  | 'resting_hr'
  | 'hrv_ms'
  | 'bp_systolic'
  | 'bp_diastolic'
  | 'spo2_pct'
  | 'sleep_min'
  | 'sleep_deep_min'
  | 'sleep_rem_min'
  | 'sleep_core_min'
  | 'sleep_awake_min'
  | 'active_energy_kcal'
  | 'exercise_min'
  | 'cardio_load'
  | 'respiratory_rate'
  | 'steps'
  | 'vo2max';

export type MetricSource = 'manual' | 'healthkit' | 'coach';

export const METRIC_META: Record<
  MetricType,
  { label: string; unit: string; decimals: number }
> = {
  weight_kg: { label: 'Weight', unit: 'kg', decimals: 1 },
  body_fat_pct: { label: 'Body fat', unit: '%', decimals: 1 },
  waist_cm: { label: 'Waist', unit: 'cm', decimals: 1 },
  resting_hr: { label: 'Resting HR', unit: 'bpm', decimals: 0 },
  hrv_ms: { label: 'HRV', unit: 'ms', decimals: 0 },
  bp_systolic: { label: 'BP systolic', unit: 'mmHg', decimals: 0 },
  bp_diastolic: { label: 'BP diastolic', unit: 'mmHg', decimals: 0 },
  spo2_pct: { label: 'SpO₂', unit: '%', decimals: 0 },
  sleep_min: { label: 'Sleep', unit: 'min', decimals: 0 },
  sleep_deep_min: { label: 'Deep sleep', unit: 'min', decimals: 0 },
  sleep_rem_min: { label: 'REM sleep', unit: 'min', decimals: 0 },
  sleep_core_min: { label: 'Core sleep', unit: 'min', decimals: 0 },
  sleep_awake_min: { label: 'Awake in bed', unit: 'min', decimals: 0 },
  active_energy_kcal: { label: 'Active energy', unit: 'kcal', decimals: 0 },
  exercise_min: { label: 'Exercise', unit: 'min', decimals: 0 },
  // Unitless on purpose, and never charted as a bare figure: see the migration. The label
  // is what a coach would say out loud, not the name of the formula behind it.
  cardio_load: { label: 'Effort', unit: '', decimals: 0 },
  respiratory_rate: { label: 'Breathing rate', unit: 'breaths/min', decimals: 1 },
  steps: { label: 'Steps', unit: '', decimals: 0 },
  vo2max: { label: 'VO₂ max', unit: 'ml/kg/min', decimals: 1 },
};

export interface Metric {
  id: string;
  recordedAt: string;
  type: MetricType;
  value: number;
  source: MetricSource;
}

export interface HealthSample {
  type: MetricType;
  recordedAt: string;
  value: number;
  /** HealthKit sample UUID. Required — it is what makes the import idempotent. */
  externalId: string;
}

/**
 * Readings for a client, oldest first — the order every chart and `latestOf` expects.
 *
 * Fetched newest-first and reversed, which is not a detail. PostgREST enforces its own
 * row ceiling (1000 on Supabase by default) whether or not the query asks for a limit,
 * and it applies that ceiling *after* ordering. An ascending query over a window holding
 * more rows than the ceiling therefore returns the oldest thousand and silently discards
 * everything newer — no error, no truncation flag, just charts frozen at whatever date
 * the cap happened to fall on. Descending inverts which end gets sacrificed: the cap can
 * only ever cost us history, never the readings someone actually opened the app to see.
 *
 * `limit` is explicit for the same reason. Relying on a server default means the day the
 * data outgrows it, the symptom is silently wrong numbers rather than a missing row.
 */
export async function listMetrics(
  supabase: VelaClient,
  // `readonly` because this only ever reads the list. A caller holding an `as const` array
  // — the honest way to declare a fixed set of series — should not have to copy it to pass
  // it in, and nothing here mutates it.
  opts: { clientId?: string; types?: readonly MetricType[]; since?: string; limit?: number } = {},
): Promise<Metric[]> {
  let q = supabase
    .from('metrics')
    .select('id, recorded_at, type, value, source')
    .order('recorded_at', { ascending: false })
    .limit(opts.limit ?? 1000);

  if (opts.clientId) q = q.eq('client_id', opts.clientId);
  if (opts.types?.length) q = q.in('type', opts.types);
  if (opts.since) q = q.gte('recorded_at', opts.since);

  const { data } = await q;
  return (data ?? [])
    .map((m) => ({
      id: m.id,
      recordedAt: m.recorded_at,
      type: m.type as MetricType,
      value: Number(m.value),
      source: m.source as MetricSource,
    }))
    .reverse();
}

export async function latestMetric(
  supabase: VelaClient,
  type: MetricType,
  clientId?: string,
): Promise<Metric | null> {
  let q = supabase
    .from('metrics')
    .select('id, recorded_at, type, value, source')
    .eq('type', type)
    .order('recorded_at', { ascending: false })
    .limit(1);
  if (clientId) q = q.eq('client_id', clientId);

  const { data } = await q;
  const m = data?.[0];
  if (!m) return null;
  return {
    id: m.id,
    recordedAt: m.recorded_at,
    type: m.type as MetricType,
    value: Number(m.value),
    source: m.source as MetricSource,
  };
}

/** Manual entry by the client. No external id, so it is never deduplicated away. */
export async function recordManualMetric(
  supabase: VelaClient,
  clientId: string,
  type: MetricType,
  value: number,
  recordedAt = new Date().toISOString(),
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('metrics')
    .insert({ client_id: clientId, type, value, recorded_at: recordedAt, source: 'manual' });
  return { error: error?.message ?? null };
}

/**
 * Batch import from Apple Health, one reading per metric per day.
 *
 * Returns rows *written* rather than rows newly inserted, because with a day key the two
 * differ in a way that matters: re-syncing at 6pm legitimately rewrites today's step
 * total, and reporting that as "nothing new" would tell a client her afternoon walk had
 * not registered.
 */
export async function importHealthSamples(
  supabase: VelaClient,
  samples: HealthSample[],
): Promise<{ written: number; error: string | null }> {
  if (samples.length === 0) return { written: 0, error: null };
  const { data, error } = await supabase.rpc('import_health_metrics', {
    // The generated signature wants the Json union; HealthSample[] is structurally
    // compatible but TypeScript cannot see that through the recursive type.
    p_samples: samples as unknown as never,
  });
  return { written: (data as number) ?? 0, error: error?.message ?? null };
}

export interface SessionPlanItem {
  itemId: string;
  exerciseId: string;
  exerciseName: string;
  cues: string[];
  block: string;
  sets: number;
  reps: string;
  targetLoadKg: number | null;
  targetRpe: number | null;
  tempo: string | null;
  restSec: number;
  notes: string | null;
}

/** The prescription for one session. Narrow by design — see get_session_plan. */
export async function getSessionPlan(
  supabase: VelaClient,
  sessionId: string,
): Promise<SessionPlanItem[]> {
  const { data } = await supabase.rpc('get_session_plan', { p_session_id: sessionId });
  return ((data as unknown[]) ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      itemId: r.item_id as string,
      exerciseId: r.exercise_id as string,
      exerciseName: r.exercise_name as string,
      cues: (r.cues as string[]) ?? [],
      block: r.block as string,
      sets: r.sets as number,
      reps: r.reps as string,
      targetLoadKg: r.target_load_kg === null ? null : Number(r.target_load_kg),
      targetRpe: r.target_rpe === null ? null : Number(r.target_rpe),
      tempo: (r.tempo as string) ?? null,
      restSec: r.rest_sec as number,
      notes: (r.notes as string) ?? null,
    };
  });
}
