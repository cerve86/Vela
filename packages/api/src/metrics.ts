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

export async function listMetrics(
  supabase: VelaClient,
  opts: { clientId?: string; types?: MetricType[]; since?: string } = {},
): Promise<Metric[]> {
  let q = supabase
    .from('metrics')
    .select('id, recorded_at, type, value, source')
    .order('recorded_at', { ascending: true });

  if (opts.clientId) q = q.eq('client_id', opts.clientId);
  if (opts.types?.length) q = q.in('type', opts.types);
  if (opts.since) q = q.gte('recorded_at', opts.since);

  const { data } = await q;
  return (data ?? []).map((m) => ({
    id: m.id,
    recordedAt: m.recorded_at,
    type: m.type as MetricType,
    value: Number(m.value),
    source: m.source as MetricSource,
  }));
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
 * Batch import from Apple Health. Returns the count of genuinely new readings, so the
 * UI can report what actually landed rather than what was offered.
 */
export async function importHealthSamples(
  supabase: VelaClient,
  samples: HealthSample[],
): Promise<{ inserted: number; error: string | null }> {
  if (samples.length === 0) return { inserted: 0, error: null };
  const { data, error } = await supabase.rpc('import_health_metrics', {
    // The generated signature wants the Json union; HealthSample[] is structurally
    // compatible but TypeScript cannot see that through the recursive type.
    p_samples: samples as unknown as never,
  });
  return { inserted: (data as number) ?? 0, error: error?.message ?? null };
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
