// A self-reference rather than './domain': Node's own test runner loads this file unbundled
// and will not guess an extension, but it does resolve the package's own export map — and
// so do the bundlers and tsc, which is what makes one spelling work everywhere.
import { deriveAlerts, mean, painTrend, round } from '@vela/shared/domain';
import type { ClientAlert } from './types';

/**
 * The roster's per-client summary — one place, pure, so the card a coach reads and the
 * alert that put a client at the top of the page are computed from the same rules.
 *
 * Everything takes `today` as an argument rather than reading the clock, which is what
 * makes it testable and what keeps a server render and a later client render agreeing.
 * Dates are ISO `YYYY-MM-DD` strings compared lexically; timestamps are ISO strings.
 */

export interface RosterSession {
  clientId: string;
  scheduledDate: string;
  status: string;
  painAfter: number | null;
  completedAt: string | null;
}

export interface RosterMetric {
  clientId: string;
  type: string;
  value: number;
  recordedAt: string;
}

export interface RosterRead {
  clientId: string;
  readOn: string;
  readiness: number;
  createdAt: string;
}

export interface RosterInput {
  clientIds: string[];
  /** ISO date. The window ends here, inclusive. */
  today: string;
  sessions: RosterSession[];
  metrics: RosterMetric[];
  reads: RosterRead[];
}

export type Standing = 'at_risk' | 'watch' | 'on_track';

export interface RosterRollup {
  clientId: string;
  /** Sessions that had come due in the last 7 days, and how many of them were completed. */
  due7d: number;
  done7d: number;
  missed7d: number;
  /** null when nothing was due — a quiet week is not a bad one. */
  adherence7d: number | null;
  /** One point per day for 28 days; null where no session recorded a score. */
  painSeries: { x: string; y: number | null }[];
  painTrend: 'improving' | 'stable' | 'worsening';
  avgPain7d: number | null;
  maxPain7d: number | null;
  /** The latest completed session or daily read, whichever is later. */
  lastActivityAt: string | null;
  daysSinceLastActivity: number | null;
  weightKg: number | null;
  weightDelta28dKg: number | null;
  restingHr: number | null;
  hrvMs: number | null;
  /** 0–4, the latest daily read in the window. */
  readiness: number | null;
  alerts: ClientAlert[];
  standing: Standing;
}

export const WINDOW_DAYS = 28;
export const WEEK_DAYS = 7;

/** ISO date `n` days after `iso` (negative for before), in UTC. */
export function shiftDate(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The `days` dates ending on `today`, oldest first. */
export function dateWindow(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => shiftDate(today, i - (days - 1)));
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.floor((b - a) / 86_400_000);
}

export function standingOf(alerts: ClientAlert[]): Standing {
  if (alerts.some((a) => a.severity === 'critical')) return 'at_risk';
  if (alerts.some((a) => a.severity === 'warn')) return 'watch';
  return 'on_track';
}

export function rosterRollups(input: RosterInput): Map<string, RosterRollup> {
  const since7 = shiftDate(input.today, -(WEEK_DAYS - 1));
  const window = dateWindow(input.today, WINDOW_DAYS);
  const since28 = window[0]!;

  const out = new Map<string, RosterRollup>();
  for (const clientId of input.clientIds) {
    const sessions = input.sessions.filter(
      (s) => s.clientId === clientId && s.scheduledDate >= since28,
    );
    const metrics = input.metrics
      .filter((m) => m.clientId === clientId)
      .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    const reads = input.reads.filter((r) => r.clientId === clientId);

    // Only what has already come due counts against her: measuring Wednesday against
    // Friday's session reports a miss for work still ahead.
    const due = sessions.filter((s) => s.scheduledDate >= since7 && s.scheduledDate <= input.today);
    const done = due.filter((s) => s.status === 'completed');
    const missed = due.length - done.length;

    // The latest score per day; a day with two sessions keeps the later one.
    const painByDate = new Map<string, number>();
    for (const s of [...sessions].sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))) {
      if (s.painAfter !== null) painByDate.set(s.scheduledDate, s.painAfter);
    }
    const painSeries = window.map((x) => ({ x, y: painByDate.get(x) ?? null }));
    const scored28 = painSeries.filter((p) => p.y !== null).map((p) => p.y as number);
    const scored7 = sessions
      .filter((s) => s.scheduledDate >= since7 && s.painAfter !== null)
      .map((s) => s.painAfter as number);

    const lastSession =
      done
        .map((s) => s.completedAt)
        .concat(sessions.filter((s) => s.status === 'completed').map((s) => s.completedAt))
        .filter((t): t is string => t !== null)
        .sort()
        .at(-1) ?? null;
    const lastRead =
      reads
        .map((r) => r.createdAt)
        .sort()
        .at(-1) ?? null;
    const lastActivityAt =
      [lastSession, lastRead]
        .filter((t): t is string => t !== null)
        .sort()
        .at(-1) ?? null;
    const daysSinceLastActivity =
      lastActivityAt === null ? null : Math.max(0, daysBetween(lastActivityAt, input.today));

    const weights = metrics.filter((m) => m.type === 'weight_kg');
    const latestOf = (type: string) => metrics.filter((m) => m.type === type).at(-1)?.value ?? null;
    const latestRead =
      [...reads].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1) ?? null;

    const alerts = deriveAlerts({
      missedSessions7d: missed,
      maxPain7d: scored7.length ? Math.max(...scored7) : null,
      acwr: null,
      daysSinceLastActivity,
      nutritionAdherence7d: null,
    });

    out.set(clientId, {
      clientId,
      due7d: due.length,
      done7d: done.length,
      missed7d: missed,
      adherence7d: due.length === 0 ? null : round(done.length / due.length, 3),
      painSeries,
      painTrend: painTrend(scored28),
      avgPain7d: scored7.length ? round(mean(scored7), 1) : null,
      maxPain7d: scored7.length ? Math.max(...scored7) : null,
      lastActivityAt,
      daysSinceLastActivity,
      weightKg: weights.at(-1)?.value ?? null,
      weightDelta28dKg:
        weights.length >= 2 ? round(weights.at(-1)!.value - weights[0]!.value, 1) : null,
      restingHr: latestOf('resting_hr'),
      hrvMs: latestOf('hrv_ms'),
      readiness: latestRead?.readiness ?? null,
      alerts,
      standing: standingOf(alerts),
    });
  }
  return out;
}
