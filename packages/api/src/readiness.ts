import type { VelaClient } from './client';

/**
 * Weekly wellness, per-client gates, and the coach's flags.
 *
 * Wellness is the client's to write and both sides' to read. Gates are the coach's to
 * set and the client's to read, because the app asks the pelvic-floor question only when
 * the gate is on. Flags are raised by the database from what a session says, and are the
 * coach's alone: no client can read one, and nobody can write one except that trigger.
 */

export interface WellnessCheck {
  weekStart: string;
  /** 1 = best, 5 = worst, for all four. */
  sleep: number;
  fatigue: number;
  soreness: number;
  stress: number;
  createdAt: string;
}

export async function listWellness(
  supabase: VelaClient,
  clientId: string,
  weeks = 8,
): Promise<WellnessCheck[]> {
  const { data } = await supabase
    .from('wellness_checks')
    .select('week_start, sleep, fatigue, soreness, stress, created_at')
    .eq('client_id', clientId)
    .order('week_start', { ascending: false })
    .limit(weeks);
  return (data ?? []).map((r) => ({
    weekStart: r.week_start,
    sleep: r.sleep,
    fatigue: r.fatigue,
    soreness: r.soreness,
    stress: r.stress,
    createdAt: r.created_at,
  }));
}

export async function saveWellness(
  supabase: VelaClient,
  clientId: string,
  weekStart: string,
  v: { sleep: number; fatigue: number; soreness: number; stress: number },
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('wellness_checks')
    .upsert(
      { client_id: clientId, week_start: weekStart, ...v },
      { onConflict: 'client_id,week_start' },
    );
  return { error: error?.message ?? null };
}

export interface PainThreshold {
  location: string;
  max: number;
}

export interface ClientGates {
  pfGate: boolean;
  painThresholds: PainThreshold[];
}

export async function getClientGates(supabase: VelaClient, clientId: string): Promise<ClientGates> {
  const { data } = await supabase
    .from('clients')
    .select('pf_gate, pain_thresholds')
    .eq('id', clientId)
    .maybeSingle();
  return {
    pfGate: data?.pf_gate ?? false,
    painThresholds: Array.isArray(data?.pain_thresholds)
      ? (data!.pain_thresholds as unknown as PainThreshold[])
      : [],
  };
}

export async function saveClientGates(
  supabase: VelaClient,
  clientId: string,
  gates: ClientGates,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('clients')
    .update({
      pf_gate: gates.pfGate,
      pain_thresholds: gates.painThresholds as unknown as never,
    })
    .eq('id', clientId);
  return { error: error?.message ?? null };
}

export type FlagKind = 'readiness_low' | 'acute' | 'pain' | 'pelvic_floor' | 'hold' | 'divergence';

export const FLAG_LABEL: Record<FlagKind, string> = {
  readiness_low: 'Low readiness, persisting',
  acute: 'Acute symptom',
  pain: 'Pain over threshold',
  pelvic_floor: 'Pelvic-floor symptoms',
  hold: 'Today needs your decision',
  divergence: 'Load and wellness disagree',
};

export interface CoachFlag {
  id: string;
  clientId: string;
  sessionId: string | null;
  kind: FlagKind;
  detail: string;
  createdAt: string;
  notifiedAt: string | null;
  resolvedAt: string | null;
  resolution: string | null;
}

export async function listFlags(
  supabase: VelaClient,
  opts: { clientId?: string; open?: boolean; limit?: number } = {},
): Promise<CoachFlag[]> {
  let q = supabase
    .from('coach_flags')
    .select(
      'id, client_id, session_id, kind, detail, created_at, notified_at, resolved_at, resolution',
    )
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.clientId) q = q.eq('client_id', opts.clientId);
  if (opts.open) q = q.is('resolved_at', null);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: r.id,
    clientId: r.client_id,
    sessionId: r.session_id,
    kind: r.kind as FlagKind,
    detail: r.detail,
    createdAt: r.created_at,
    notifiedAt: r.notified_at,
    resolvedAt: r.resolved_at,
    resolution: r.resolution,
  }));
}

/**
 * Resolves a flag. For a hold, the coach's answer also decides what the session becomes,
 * which is what the client then sees on Today.
 */
export async function resolveFlag(
  supabase: VelaClient,
  flag: Pick<CoachFlag, 'id' | 'kind' | 'sessionId'>,
  input: {
    resolution: string;
    adjustTo?: 'gentle' | 'low_impact' | 'strength' | 'as_planned';
    note?: string | null;
  },
): Promise<{ error: string | null }> {
  if (flag.kind === 'hold' && flag.sessionId && input.adjustTo) {
    const { error } = await supabase
      .from('sessions')
      .update({ adjusted_to: input.adjustTo, adjusted_note: input.note?.trim() || null })
      .eq('id', flag.sessionId);
    if (error) return { error: error.message };
  }
  const { error } = await supabase
    .from('coach_flags')
    .update({ resolved_at: new Date().toISOString(), resolution: input.resolution })
    .eq('id', flag.id);
  return { error: error?.message ?? null };
}
