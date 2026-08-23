/**
 * How a bundle of movements becomes weeks of prescription.
 *
 * The point of a model rather than a form is that a coach picks movements once and gets six
 * weeks, instead of typing the same five exercises into six days by hand. What she is
 * choosing is the shape of the build, and the shapes below are deliberately few — a
 * progression nobody can describe in a sentence is one nobody can review either.
 */

export type ProgressionModel = 'hold' | 'add' | 'wave';

export const PROGRESSION_MODELS: {
  value: ProgressionModel;
  label: string;
  blurb: string;
}[] = [
  {
    value: 'hold',
    label: 'Hold',
    blurb: 'The same dose every week. Right when the aim is consolidation, or early postnatal.',
  },
  {
    value: 'add',
    label: 'Add a set',
    blurb: 'One extra set from week 2, capped at three. A steady, unremarkable build.',
  },
  {
    value: 'wave',
    label: 'Wave',
    blurb: 'Builds for three weeks, then drops back to the starting dose. The deload is the point.',
  },
];

/**
 * Sets for one movement in a given week.
 *
 * `wave` deloads on every fourth week — week 4, 8, 12 — returning to the starting dose
 * rather than to one set. A deload is a lighter week, not a stop, and dropping to a token
 * amount is how people lose the thread of a programme.
 *
 * `add` caps at three above the start. Without a ceiling a twelve-week block ends at
 * fourteen sets of everything, which nobody prescribed and nobody would do.
 */
export function setsForWeek(baseSets: number, week: number, model: ProgressionModel): number {
  if (week < 1) return baseSets;

  if (model === 'hold') return baseSets;

  if (model === 'add') {
    return Math.min(baseSets + Math.max(0, week - 1), baseSets + 3);
  }

  // wave: 1, 2, 3 build; 4 deloads; then the cycle repeats from the same base.
  const inCycle = ((week - 1) % 4) + 1;
  return inCycle === 4 ? baseSets : baseSets + (inCycle - 1);
}

export interface BundleMovement {
  exerciseId: string;
  name: string;
  sets: number;
  reps: string;
  restSec?: number;
  targetLoadKg?: number | null;
}

export interface PlannedItem {
  exerciseId: string;
  sets: number;
  reps: string;
  restSec: number;
  targetLoadKg: number | null;
  orderIndex: number;
}

export interface PlannedDay {
  weekNo: number;
  dayNo: number;
  title: string;
  items: PlannedItem[];
}

/**
 * Expands a bundle into the days and items to write.
 *
 * Every training day in a week gets the same movements. That is a simplification and a
 * deliberate one: a coach who wants different work on different days is building two
 * bundles, and pretending one form can express a split would produce a form nobody can
 * fill in correctly.
 */
export function planBundle(input: {
  movements: BundleMovement[];
  /** Which days of the week train. 1-7, where 1 is the first training day. */
  days: number[];
  weeks: number;
  model: ProgressionModel;
  title: string;
}): PlannedDay[] {
  const days = [...new Set(input.days)].sort((a, b) => a - b).slice(0, 7);
  const weeks = Math.max(1, Math.min(24, Math.floor(input.weeks)));
  if (days.length === 0 || input.movements.length === 0) return [];

  const out: PlannedDay[] = [];

  for (let week = 1; week <= weeks; week++) {
    const deload = input.model === 'wave' && week % 4 === 0;

    for (const dayNo of days) {
      out.push({
        weekNo: week,
        dayNo,
        // The week is named on the day so a client opening it sees where she is, and a
        // deload is labelled rather than left to look like a mistake.
        title: `${input.title} — week ${week}${deload ? ' (deload)' : ''}`,
        items: input.movements.map((m, i) => ({
          exerciseId: m.exerciseId,
          sets: setsForWeek(m.sets, week, input.model),
          reps: m.reps,
          restSec: m.restSec ?? 60,
          targetLoadKg: m.targetLoadKg ?? null,
          orderIndex: i,
        })),
      });
    }
  }

  return out;
}

/** Total sets a plan asks for, which is the number that tells a coach if she overreached. */
export function totalSets(plan: PlannedDay[]): number {
  return plan.reduce((n, d) => n + d.items.reduce((m, i) => m + i.sets, 0), 0);
}

/** Sets per week, for the preview table. */
export function weeklySets(plan: PlannedDay[]): { week: number; sets: number; deload: boolean }[] {
  const byWeek = new Map<number, { sets: number; deload: boolean }>();
  for (const d of plan) {
    const entry = byWeek.get(d.weekNo) ?? { sets: 0, deload: d.title.includes('(deload)') };
    entry.sets += d.items.reduce((m, i) => m + i.sets, 0);
    byWeek.set(d.weekNo, entry);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, v]) => ({ week, ...v }));
}
