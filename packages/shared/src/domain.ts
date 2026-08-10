import type { ClientAlert, ClientRollup, Macros, Metric, Session, SetLog } from './types';

/**
 * Domain calculations. Written once here, used by the portal charts, the iOS app,
 * and the nightly rollup Edge Function — so a number never disagrees with itself
 * across surfaces.
 */

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

/**
 * Estimated one-rep max (Epley). Reps above ~12 make the estimate unreliable, so we
 * return null rather than pretend — a fake number on a progress chart is worse than
 * a gap in it.
 */
export function estimateOneRepMax(weightKg: number, reps: number): number | null {
  if (weightKg <= 0 || reps <= 0 || reps > 12) return null;
  if (reps === 1) return weightKg;
  return round(weightKg * (1 + reps / 30), 1);
}

/** Volume load = Σ (reps × kg). The simplest honest measure of session workload. */
export function volumeLoad(setLogs: SetLog[]): number {
  return setLogs.filter((s) => s.completed).reduce((sum, s) => sum + s.reps * s.weightKg, 0);
}

/**
 * Acute:chronic workload ratio — 7-day volume over the 28-day daily average scaled to
 * a week. Sports-medicine literature associates ratios above ~1.5 with elevated injury
 * risk, which for a rehab caseload is the number most worth surfacing.
 */
export function acwr(volume7d: number, volume28d: number): number | null {
  if (volume28d <= 0) return null;
  const chronicWeekly = volume28d / 4;
  if (chronicWeekly <= 0) return null;
  return round(volume7d / chronicWeekly, 2);
}

// ---------------------------------------------------------------------------
// Adherence
// ---------------------------------------------------------------------------

/** Completed ÷ scheduled, as a 0-1 fraction. Days with nothing scheduled don't count against the client. */
export function adherence(sessions: Session[]): number {
  const due = sessions.filter((s) => s.status !== 'scheduled');
  if (due.length === 0) return 1;
  return round(due.filter((s) => s.status === 'completed').length / due.length, 3);
}

export type AdherenceBand = 'good' | 'watch' | 'poor';

export function adherenceBand(value: number): AdherenceBand {
  if (value >= 0.8) return 'good';
  if (value >= 0.5) return 'watch';
  return 'poor';
}

// ---------------------------------------------------------------------------
// Pain
// ---------------------------------------------------------------------------

/**
 * Compares mean pain in the recent half of the window against the earlier half.
 * A 1-point shift on the 0-10 NRS is the smallest change generally considered
 * clinically meaningful, so anything smaller reads as "stable".
 */
export function painTrend(scoresOldestFirst: number[]): ClientRollup['painTrend'] {
  if (scoresOldestFirst.length < 4) return 'stable';
  const mid = Math.floor(scoresOldestFirst.length / 2);
  const earlier = mean(scoresOldestFirst.slice(0, mid));
  const recent = mean(scoresOldestFirst.slice(mid));
  const delta = recent - earlier;
  if (delta <= -1) return 'improving';
  if (delta >= 1) return 'worsening';
  return 'stable';
}

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export function sumMacros(entries: Macros[]): Macros {
  return entries.reduce<Macros>(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      proteinG: acc.proteinG + m.proteinG,
      carbsG: acc.carbsG + m.carbsG,
      fatG: acc.fatG + m.fatG,
    }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

/** A day counts as on-target when calories and protein are both within tolerance. */
export function isDayOnTarget(actual: Macros, target: Macros, tolerance = 0.1): boolean {
  const within = (a: number, t: number) => t > 0 && Math.abs(a - t) / t <= tolerance;
  return within(actual.kcal, target.kcal) && within(actual.proteinG, target.proteinG);
}

// ---------------------------------------------------------------------------
// Alerts — the rules that decide who needs the coach's attention today
// ---------------------------------------------------------------------------

export interface AlertInput {
  missedSessions7d: number;
  maxPain7d: number | null;
  acwr: number | null;
  daysSinceLastActivity: number | null;
  nutritionAdherence7d: number | null;
}

export function deriveAlerts(input: AlertInput): ClientAlert[] {
  const alerts: ClientAlert[] = [];

  if (input.missedSessions7d >= 2) {
    alerts.push({
      kind: 'missed_sessions',
      severity: input.missedSessions7d >= 3 ? 'critical' : 'warn',
      message: `${input.missedSessions7d} sessions missed this week`,
    });
  }

  if (input.maxPain7d !== null && input.maxPain7d >= 6) {
    alerts.push({
      kind: 'high_pain',
      severity: input.maxPain7d >= 8 ? 'critical' : 'warn',
      message: `Pain reported at ${input.maxPain7d}/10`,
    });
  }

  if (input.acwr !== null && input.acwr > 1.5) {
    alerts.push({
      kind: 'load_spike',
      severity: 'warn',
      message: `Load spike — ACWR ${input.acwr.toFixed(2)}`,
    });
  }

  if (input.daysSinceLastActivity !== null && input.daysSinceLastActivity >= 5) {
    alerts.push({
      kind: 'inactive',
      severity: input.daysSinceLastActivity >= 10 ? 'critical' : 'warn',
      message: `No activity for ${input.daysSinceLastActivity} days`,
    });
  }

  if (input.nutritionAdherence7d !== null && input.nutritionAdherence7d < 0.5) {
    alerts.push({
      kind: 'nutrition_off_target',
      severity: 'info',
      message: `Nutrition on target ${Math.round(input.nutritionAdherence7d * 100)}% of days`,
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function latestMetric(metrics: Metric[], type: Metric['type']): Metric | null {
  const of = metrics
    .filter((m) => m.type === type)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  return of[0] ?? null;
}

export function round(n: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
