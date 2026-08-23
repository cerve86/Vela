import { isBlocking, palette, tide } from './tokens';

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

export type PlanTemper = 'breath' | 'easy' | 'prescribed' | 'push';

export interface PlanItemLike {
  exerciseName: string;
  sets: number;
  reps: string;
  targetLoadKg: number | null;
}

export interface ActivePlan<T extends PlanItemLike> {
  temper: PlanTemper;
  /** The tag shown above the title, e.g. "Trimmed to fit". */
  tag: string;
  tone: string;
  /** Copy explaining the trim. Never apologetic, never "a lesser version". */
  note: string;
  items: T[];
  /** Sets after trimming, which is what the session screen will actually ask for. */
  setCount: number;
  /** True when load should be ignored today even though the coach set one. */
  dropLoad: boolean;
}

/** Movements that are restorative rather than loading — kept when everything else goes. */
const BREATH_HINTS = ['breath', 'connection', 'dead bug', 'pelvic', 'diaphragm'];

function isBreathWork(name: string): boolean {
  const n = name.toLowerCase();
  return BREATH_HINTS.some((h) => n.includes(h));
}

/**
 * The single decision point.
 *
 * `readiness` is 0-4, or null when the client has not been asked yet — those are different
 * situations and must not collapse. Not asked means show the session as prescribed and
 * prompt for a read; asked-and-depleted means trim it.
 */
export function activePlan<T extends PlanItemLike>(
  items: T[],
  readiness: number | null,
  symptom: string,
): ActivePlan<T> {
  const blocked = isBlocking(symptom);

  // A blocking symptom outranks a good readiness score. The second non-negotiable: it
  // downgrades the day regardless of what the coach assigned or how well she slept.
  const step = blocked ? 0 : (readiness ?? 2);

  if (step <= 0) {
    const breath = items.filter((i) => isBreathWork(i.exerciseName));
    const kept = (breath.length ? breath : items.slice(0, 2)).map((i) => ({
      ...i,
      sets: Math.max(1, Math.min(3, i.sets)),
      targetLoadKg: null,
    }));
    return {
      temper: 'breath',
      tag: 'Trimmed to fit',
      tone: tide[0].tone,
      note: blocked
        ? `You logged ${symptom.toLowerCase()}. This is the session today — not a lesser version of one.`
        : 'Rough night. This is the session today — not a lesser version of one.',
      items: kept,
      setCount: kept.reduce((n, i) => n + i.sets, 0),
      dropLoad: true,
    };
  }

  if (step === 1) {
    const kept = items.slice(0, Math.max(2, Math.ceil(items.length / 2))).map((i) => ({
      ...i,
      sets: Math.max(1, Math.floor(i.sets / 2) || 1),
      targetLoadKg: null,
    }));
    return {
      temper: 'easy',
      tag: 'Trimmed to fit',
      tone: tide[1].tone,
      note: 'Half the volume, none of the load. Show up, then stop.',
      items: kept,
      setCount: kept.reduce((n, i) => n + i.sets, 0),
      dropLoad: true,
    };
  }

  if (step >= 4) {
    return {
      temper: 'push',
      tag: 'Room to push',
      tone: tide[4].tone,
      note: 'Everything is where your physio left it. Add the optional set only if it stays quiet.',
      items,
      setCount: items.reduce((n, i) => n + i.sets, 0),
      dropLoad: false,
    };
  }

  return {
    temper: 'prescribed',
    tag: 'As prescribed',
    tone: step === 2 ? tide[2].tone : tide[3].tone,
    note:
      readiness === null
        ? 'Log a read and this adjusts to how today actually feels.'
        : 'Load is where your physio left it.',
    items,
    setCount: items.reduce((n, i) => n + i.sets, 0),
    dropLoad: false,
  };
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
  breath: tide[0].tone,
  easy: tide[1].tone,
  prescribed: palette.brand[600],
  push: tide[4].tone,
};
