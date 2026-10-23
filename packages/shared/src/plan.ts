import { palette, tide } from './tokens';
import { planFor, type PlanCore, type PlanItemLike, type PlanTemper } from './planCore';

/**
 * How the day's readiness and symptoms change what is prescribed.
 *
 * This is the redesign's first non-negotiable: the session shown on Today is DERIVED from
 * the readiness read, never served flat from what the coach assigned. It lives in one
 * function on purpose — the moment two screens each decide for themselves what "trimmed"
 * means, a client sees three exercises on Today and five when she opens the session.
 *
 * The prototype models this as five fixed alternative sessions (PLANS[0..4]). That works in
 * a prototype with seeded data and cannot work here: a real coach prescribes one programme,
 * and swapping it for a hardcoded stand-in would silently discard her clinical decision. So
 * the shape is the same and the mechanism is different — we trim HER session rather than
 * substituting ours, and the trim is always subtractive.
 */

export type { Adjustment, PlanItemLike, PlanTemper, ReadinessGate } from './planCore';
export { readinessGate } from './planCore';

export interface ActivePlan<T extends PlanItemLike> extends PlanCore<T> {
  tone: string;
}

/** The decision from `planFor`, with the tone its tag is drawn in. */
export function activePlan<T extends PlanItemLike>(
  items: T[],
  input: Parameters<typeof planFor>[1],
): ActivePlan<T> {
  const core = planFor(items, input);
  return { ...core, tone: temperTone[core.temper] };
}

/**
 * Rough duration for a trimmed plan, in minutes.
 *
 * 45s of work per set plus the prescribed rest. Crude, and deliberately so — it only needs
 * to be right enough to answer "have I got time for this before the school run".
 */
export function planMinutes(items: { sets: number; restSec: number }[]): number {
  return Math.max(1, Math.round(items.reduce((n, i) => n + i.sets * (45 + i.restSec), 0) / 60));
}

/** Dot colour for the hero chip, by how the day was tempered. */
export const temperTone: Record<PlanTemper, string> = {
  held: tide[0].tone,
  gentle: tide[0].tone,
  reduced: tide[1].tone,
  prescribed: palette.brand[600],
  changed: tide[2].tone,
};
