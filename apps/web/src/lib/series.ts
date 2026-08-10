import {
  TODAY,
  daysAgo,
  metricsByClient,
  nutritionByClient,
  nutritionTargetByClient,
  sessionsByClient,
  setLogsByClient,
  sumMacros,
  volumeLoad,
} from '@coachapp/shared';
import type { MetricType } from '@coachapp/shared';
import type { Panel, Point } from '@/components/charts';

/** Ordered list of ISO dates covering the last `days` days, oldest first. */
export function dateWindow(days: number): string[] {
  return Array.from({ length: days }, (_, i) => daysAgo(days - 1 - i));
}

function byDate<T>(items: T[], dateOf: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const item of items) {
    const k = dateOf(item);
    const arr = m.get(k);
    if (arr) arr.push(item);
    else m.set(k, [item]);
  }
  return m;
}

/**
 * The chart this whole product exists to draw: reported pain against training load
 * over the same window.
 *
 * Two panels sharing one x-axis rather than one chart with two y-axes — pain (0-10)
 * and volume load (kg) have no common scale, and overlaying them would invent
 * crossings that mean nothing.
 */
export function painLoadPanels(clientId: string, days = 28): { xLabels: string[]; panels: Panel[] } {
  const xLabels = dateWindow(days);
  const sessions = sessionsByClient.get(clientId) ?? [];
  const logs = setLogsByClient.get(clientId) ?? [];

  const sessionByDate = new Map(sessions.map((s) => [s.scheduledDate, s]));
  const logsBySession = byDate(logs, (l) => l.sessionId);

  const painPoints: Point[] = xLabels.map((d) => {
    const s = sessionByDate.get(d);
    return { x: d, y: s && s.status === 'completed' ? s.painAfter : null };
  });

  const loadPoints: Point[] = xLabels.map((d) => {
    const s = sessionByDate.get(d);
    if (!s || s.status !== 'completed') return { x: d, y: null };
    return { x: d, y: Math.round(volumeLoad(logsBySession.get(s.id) ?? [])) };
  });

  return {
    xLabels,
    panels: [
      {
        id: 'pain',
        label: 'Reported pain after session (0–10)',
        domain: [0, 10],
        height: 150,
        format: { style: 'fixed', decimals: 0 },
        series: [
          {
            id: 'pain',
            label: 'Pain',
            color: 'var(--series-2)',
            kind: 'line',
            points: painPoints,
            connectGaps: true,
          },
        ],
      },
      {
        id: 'load',
        label: 'Training volume load (kg)',
        height: 150,
        format: { style: 'compactK' },
        series: [
          { id: 'load', label: 'Volume load', color: 'var(--series-1)', kind: 'bar', points: loadPoints },
        ],
      },
    ],
  };
}

export function metricPanel(
  clientId: string,
  type: MetricType,
  opts: { label: string; color: string; days?: number; decimals?: number; kind?: 'line' | 'bar' },
): { xLabels: string[]; panels: Panel[] } {
  const days = opts.days ?? 28;
  const xLabels = dateWindow(days);
  const metrics = (metricsByClient.get(clientId) ?? []).filter((m) => m.type === type);
  const map = new Map(metrics.map((m) => [m.recordedAt.slice(0, 10), m.value]));

  return {
    xLabels,
    panels: [
      {
        id: type,
        label: opts.label,
        height: 170,
        format: { style: 'fixed', decimals: opts.decimals ?? 0 },
        series: [
          {
            id: type,
            label: opts.label,
            color: opts.color,
            kind: opts.kind ?? 'line',
            points: xLabels.map((d) => ({ x: d, y: map.get(d) ?? null })),
            // Vitals are sampled, not continuous — weight lands every other day, HRV
            // weekly. Without this every segment is orphaned and the line vanishes.
            connectGaps: true,
          },
        ],
      },
    ],
  };
}

/** Daily calories logged against the standing target — same unit, so one panel is honest. */
export function nutritionPanels(clientId: string, days = 28): { xLabels: string[]; panels: Panel[] } {
  const xLabels = dateWindow(days);
  const logs = nutritionByClient.get(clientId) ?? [];
  const target = nutritionTargetByClient.get(clientId)!;
  const grouped = byDate(logs, (l) => l.loggedOn);

  const kcal: Point[] = xLabels.map((d) => {
    const day = grouped.get(d);
    return { x: d, y: day ? Math.round(sumMacros(day.map((l) => l.macros)).kcal) : null };
  });
  const protein: Point[] = xLabels.map((d) => {
    const day = grouped.get(d);
    return { x: d, y: day ? Math.round(sumMacros(day.map((l) => l.macros)).proteinG) : null };
  });

  return {
    xLabels,
    panels: [
      {
        id: 'kcal',
        label: `Calories logged (target ${target.kcal} kcal)`,
        height: 160,
        format: { style: 'thousands' },
        series: [
          { id: 'kcal', label: 'Logged', color: 'var(--series-1)', kind: 'bar', points: kcal },
          {
            id: 'target',
            label: 'Target',
            color: 'var(--series-4)',
            kind: 'line',
            points: xLabels.map((d) => ({ x: d, y: target.kcal })),
          },
        ],
      },
      {
        id: 'protein',
        label: `Protein (target ${target.proteinG} g)`,
        height: 140,
        format: { style: 'fixed', decimals: 0 },
        series: [
          { id: 'protein', label: 'Protein', color: 'var(--series-3)', kind: 'bar', points: protein },
          {
            id: 'ptarget',
            label: 'Target',
            color: 'var(--series-4)',
            kind: 'line',
            points: xLabels.map((d) => ({ x: d, y: target.proteinG })),
          },
        ],
      },
    ],
  };
}

export function todayMacros(clientId: string) {
  const logs = (nutritionByClient.get(clientId) ?? []).filter((l) => l.loggedOn === TODAY);
  const target = nutritionTargetByClient.get(clientId)!;
  return { actual: sumMacros(logs.map((l) => l.macros)), target, entries: logs };
}
