import type { VelaClient } from './client';

/**
 * Freshness from session load, and the client's cycle context.
 *
 * Load is defined once, in the database (`session_loads`), and these read it: the portal
 * panel, the client report and the divergence flag all see the same numbers. Cycle
 * context is the client's to record under its own consent; the coach reads it only while
 * that consent stands, and withdrawing it deletes it.
 */

export type LoadBasis = 'heart_rate' | 'rpe' | 'strava_rpe';

export interface SessionLoad {
  sessionId: string;
  day: string;
  minutes: number;
  /** CR-10. */
  intensity: number | null;
  basis: LoadBasis | null;
  /** Foster AU: intensity × minutes. Null when nothing gave an intensity. */
  load: number | null;
}

export interface Freshness {
  /** The last seven days' load. */
  acute: number;
  /** The last 28 days' load as a weekly average. */
  chronic: number;
  ratio: number | null;
  monotony: number | null;
  strain: number | null;
  sessions7: number;
  unmeasured7: number;
  /** Days since her first completed session; the ratio means little under 21. */
  historyDays: number;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function listSessionLoads(
  supabase: VelaClient,
  clientId: string,
  from: string,
  to: string,
): Promise<SessionLoad[]> {
  const { data } = await supabase.rpc('session_loads', {
    p_client: clientId,
    p_from: from,
    p_to: to,
  });
  return (data ?? []).map((r) => ({
    sessionId: r.session_id,
    day: r.day,
    minutes: Number(r.minutes),
    intensity: num(r.intensity),
    basis: (r.basis as LoadBasis | null) ?? null,
    load: num(r.load),
  }));
}

export async function getFreshness(
  supabase: VelaClient,
  clientId: string,
  today?: string,
): Promise<Freshness | null> {
  const { data } = await supabase.rpc('client_freshness', {
    p_client: clientId,
    ...(today ? { p_today: today } : {}),
  });
  const r = data?.[0];
  if (!r) return null;
  return {
    acute: Number(r.acute ?? 0),
    chronic: Number(r.chronic ?? 0),
    ratio: num(r.ratio),
    monotony: num(r.monotony),
    strain: num(r.strain),
    sessions7: r.sessions7 ?? 0,
    unmeasured7: r.unmeasured7 ?? 0,
    historyDays: r.history_days ?? 0,
  };
}

export type CycleStatus = 'regular' | 'irregular' | 'perimenopause' | 'menopause' | 'not_currently';

export const CYCLE_STATUS_LABEL: Record<CycleStatus, string> = {
  regular: 'Regular cycle',
  irregular: 'Irregular cycle',
  perimenopause: 'Perimenopause',
  menopause: 'Menopause',
  not_currently: 'No periods at the moment',
};

export interface CycleContext {
  status: CycleStatus;
  /** Newest first. */
  periodStarts: string[];
}

/** Null when there is no consent, or nothing recorded under it. */
export async function getCycleContext(
  supabase: VelaClient,
  clientId: string,
): Promise<CycleContext | null> {
  const [{ data: ctx }, { data: starts }] = await Promise.all([
    supabase.from('cycle_context').select('status').eq('client_id', clientId).maybeSingle(),
    supabase
      .from('period_starts')
      .select('started_on')
      .eq('client_id', clientId)
      .order('started_on', { ascending: false })
      .limit(12),
  ]);
  if (!ctx) return null;
  return {
    status: ctx.status as CycleStatus,
    periodStarts: (starts ?? []).map((s) => s.started_on),
  };
}

export async function hasCycleConsent(supabase: VelaClient, clientId: string): Promise<boolean> {
  const { data } = await supabase.rpc('has_cycle_consent', { p_client: clientId });
  return data === true;
}

export async function saveCycleStatus(
  supabase: VelaClient,
  clientId: string,
  status: CycleStatus,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('cycle_context')
    .upsert(
      { client_id: clientId, status, updated_at: new Date().toISOString() },
      { onConflict: 'client_id' },
    );
  return { error: error?.message ?? null };
}

export async function addPeriodStart(
  supabase: VelaClient,
  clientId: string,
  day: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('period_starts')
    .upsert(
      { client_id: clientId, started_on: day },
      { onConflict: 'client_id,started_on', ignoreDuplicates: true },
    );
  return { error: error?.message ?? null };
}

export async function removePeriodStart(
  supabase: VelaClient,
  clientId: string,
  day: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('period_starts')
    .delete()
    .eq('client_id', clientId)
    .eq('started_on', day);
  return { error: error?.message ?? null };
}

/** Withdraws the consent; the database deletes the cycle data with it. */
export async function withdrawCycleConsent(
  supabase: VelaClient,
  clientId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('consents')
    .update({ revoked_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .eq('type', 'cycle_context')
    .is('revoked_at', null);
  return { error: error?.message ?? null };
}
