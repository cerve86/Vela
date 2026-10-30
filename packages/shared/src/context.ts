/**
 * Context a coach reads beside the numbers, never a gate: where she is in her cycle, and
 * what her readiness usually is.
 *
 * Perceived effort varies far more between women than between cycle phases, so a
 * readiness tap reads best against her own rolling baseline, and cycle position reads as
 * context on the trend. Pure, so it is tested without the app or the portal.
 */

const DAY = 86_400_000;
const days = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);

export interface CycleDay {
  /** Day 1 is the day her last period started. */
  day: number;
  lastStart: string;
  /** The mean of her recorded cycles (21–45 days only), or null with fewer than two. */
  averageLength: number | null;
}

/** Null before any period start, or when the last one is in the future. */
export function cycleDay(periodStarts: string[], today: string): CycleDay | null {
  const starts = [...new Set(periodStarts)].filter((d) => d <= today).sort();
  const lastStart = starts.at(-1);
  if (!lastStart) return null;
  const lengths = starts
    .slice(1)
    .map((d, i) => days(starts[i]!, d))
    .filter((n) => n >= 21 && n <= 45);
  return {
    day: days(lastStart, today) + 1,
    lastStart,
    averageLength: lengths.length
      ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length)
      : null,
  };
}

/**
 * Whether today falls in the second half of her cycle — the luteal phase, the 14 days
 * before her next period is due. Only for a regular cycle with a recorded start, and not
 * once a period is more than a week late, when the estimate no longer means anything.
 */
export function inLutealPhase(
  ctx: { status: string; periodStarts: string[] } | null,
  today: string,
): boolean {
  if (!ctx || ctx.status !== 'regular') return false;
  const c = cycleDay(ctx.periodStarts, today);
  if (!c) return false;
  const length = c.averageLength ?? 28;
  return c.day > length - 14 && c.day <= length + 7;
}

/**
 * Her mean readiness over the 28 days before a day, from the sessions she tapped it on.
 * Null with fewer than three taps: two is not a baseline.
 */
export function readinessBaseline(
  sessions: { scheduledDate: string; readinessBefore: number | null }[],
  before: string,
): number | null {
  const taps = sessions
    .filter(
      (s) =>
        s.readinessBefore !== null &&
        s.scheduledDate < before &&
        days(s.scheduledDate, before) <= 28,
    )
    .map((s) => s.readinessBefore!);
  if (taps.length < 3) return null;
  return Math.round((taps.reduce((a, b) => a + b, 0) / taps.length) * 10) / 10;
}
