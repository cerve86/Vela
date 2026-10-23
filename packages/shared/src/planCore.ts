/**
 * What today's session becomes — the decision itself, pure and import-free so it is
 * tested on its own. `plan.ts` adds the colours.
 */

export type PlanTemper = 'held' | 'gentle' | 'reduced' | 'prescribed' | 'changed';

export interface PlanItemLike {
  exerciseName: string;
  sets: number;
  reps: string;
  targetLoadKg: number | null;
  /** The library category; 'plyometric' is impact work, held when the pelvic-floor gate says so. */
  category?: string | null;
}

export interface PlanCore<T extends PlanItemLike> {
  temper: PlanTemper;
  /** The tag shown above the title, e.g. "Trimmed to fit". */
  tag: string;
  /** Copy explaining the day. Never apologetic, never "a lesser version", never clinical. */
  note: string;
  items: T[];
  /** Sets after trimming, which is what the session screen will actually show. */
  setCount: number;
  /** True when load should be ignored today even though the coach set one. */
  dropLoad: boolean;
}

/** What the coach answered to a hold, or the automatic tier, as stored on the session. */
export type Adjustment = 'reduced' | 'gentle' | 'low_impact' | 'strength' | 'as_planned';

/** Readiness 0–10 (10 = fresh) to the spec's three tiers; null until she has tapped. */
export type ReadinessGate = 'planned' | 'reduced' | 'hold';

export function readinessGate(readiness: number | null | undefined): ReadinessGate | null {
  if (readiness === null || readiness === undefined) return null;
  if (readiness >= 7) return 'planned';
  if (readiness >= 3) return 'reduced';
  return 'hold';
}

/** Movements that are restorative rather than loading — kept when everything else goes. */
const BREATH_HINTS = ['breath', 'connection', 'dead bug', 'pelvic', 'diaphragm'];

function isBreathWork(name: string): boolean {
  const n = name.toLowerCase();
  return BREATH_HINTS.some((h) => n.includes(h));
}

const isImpact = (i: PlanItemLike) => i.category === 'plyometric';

function done<T extends PlanItemLike>(base: Omit<PlanCore<T>, 'setCount'>): PlanCore<T> {
  return { ...base, setCount: base.items.reduce((n, i) => n + i.sets, 0) };
}

/**
 * The single decision point for what today's session is.
 *
 * In order: an acute symptom holds the day; the coach's answer to a hold is what the day
 * became; otherwise readiness before the run picks the tier — 7 or more as planned, 3 to
 * 6 the reduced version, under 3 the gentle version while the coach decides. A pelvic-
 * floor yes takes impact work out of whatever is left. The trim is always subtractive:
 * her physio's session, cut down, never a stand-in of ours.
 */
export function planFor<T extends PlanItemLike>(
  items: T[],
  input: {
    readiness: number | null | undefined;
    pfFlag?: boolean | null;
    acute?: string | null;
    adjustedTo?: Adjustment | null;
    adjustedNote?: string | null;
  },
): PlanCore<T> {
  const pf = input.pfFlag === true;
  const pool = pf ? items.filter((i) => !isImpact(i)) : items;
  const pfNote = pf ? ' Impact work is off today.' : '';

  if (input.acute) {
    return done<T>({
      temper: 'held',
      tag: 'Rest today',
      note: 'Rest today. Your physio has been told and will be in touch.',
      items: [],
      dropLoad: true,
    });
  }

  const gentle = () => {
    const breath = pool.filter((i) => isBreathWork(i.exerciseName));
    return (breath.length ? breath : pool.slice(0, 2)).map((i) => ({
      ...i,
      sets: Math.max(1, Math.min(3, i.sets)),
      targetLoadKg: null,
    }));
  };
  const reduced = () =>
    pool.slice(0, Math.max(2, Math.ceil(pool.length / 2))).map((i) => ({
      ...i,
      sets: Math.max(1, Math.floor(i.sets / 2) || 1),
      targetLoadKg: null,
    }));

  switch (input.adjustedTo) {
    case 'low_impact':
      return done<T>({
        temper: 'changed',
        tag: 'Changed by your physio',
        note: input.adjustedNote?.trim() || 'Low impact today: an easy walk or spin instead.',
        items: [],
        dropLoad: true,
      });
    case 'strength':
      return done<T>({
        temper: 'changed',
        tag: 'Changed by your physio',
        note: (input.adjustedNote?.trim() || 'A strength day instead of the run.') + pfNote,
        items: pool.filter((i) => i.category === 'strength' || i.category === 'pelvic_floor'),
        dropLoad: false,
      });
    case 'gentle':
      return done<T>({
        temper: 'changed',
        tag: 'Changed by your physio',
        note: (input.adjustedNote?.trim() || 'The gentle version today.') + pfNote,
        items: gentle(),
        dropLoad: true,
      });
    case 'as_planned':
      return done<T>({
        temper: 'changed',
        tag: 'Confirmed by your physio',
        note: (input.adjustedNote?.trim() || 'As planned.') + pfNote,
        items: pool,
        dropLoad: false,
      });
    default:
      break;
  }

  const gate = readinessGate(input.readiness);
  if (gate === 'hold') {
    return done<T>({
      temper: 'gentle',
      tag: 'Waiting for your physio',
      note:
        'Your physio has been asked how to adjust today. Until then, this is the gentle version.' +
        pfNote,
      items: gentle(),
      dropLoad: true,
    });
  }
  if (gate === 'reduced') {
    return done<T>({
      temper: 'reduced',
      tag: 'Trimmed to fit',
      note: 'Half the volume, none of the load. Show up, then stop.' + pfNote,
      items: reduced(),
      dropLoad: true,
    });
  }
  return done<T>({
    temper: 'prescribed',
    tag: 'As prescribed',
    note:
      (gate === null
        ? 'You rate how fresh you feel when you start, and the session fits to it.'
        : 'Everything is where your physio left it.') + pfNote,
    items: pool,
    dropLoad: false,
  });
}
