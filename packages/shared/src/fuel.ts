/**
 * Fuel for today: which card a session gets, and what it says.
 *
 * The cards are the coach's to write. What ships here is her framework from the build
 * spec — fuel for the work required, carbohydrate periodised to the session, the plate
 * built protein and fat, then fibre, then starch — as defaults she replaces in the portal.
 * The face of a card has no numbers; amounts sit behind a tap, and a client flagged for
 * restrictive patterns never sees them. Supplement cards ship as drafts: the coach's own
 * reference is their source of truth, so none reaches a client until she publishes it.
 *
 * Pure and free of extensionless imports, so it is tested under `node --test` directly.
 */

export type FuelType = 'long' | 'quality' | 'easy' | 'strength';

export interface FuelLines {
  before?: string;
  during?: string;
  after?: string;
  cue?: string;
}

export interface FuelCard {
  key: string;
  kind: 'session' | 'cue' | 'supplement';
  title: string;
  face: FuelLines;
  detail: FuelLines;
  why: string | null;
  evidence: 'strong' | 'moderate' | null;
  tag: string | null;
  published: boolean;
  sort: number;
}

const QUALITY = /interval|tempo|quality|threshold|hill|bun|fartlek|race|speed|strides|track|vo2/i;
const LONG = /\blong\b|\blsd\b/i;

/** Minutes written in a title or notes ("90 min", "1h30"), the largest one. */
function minutesIn(text: string): number {
  let best = 0;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:min|mins|minutes|')/gi))
    best = Math.max(best, Number(m[1]));
  for (const m of text.matchAll(/(\d+)\s*h(?:r|rs|ours?)?\s*(\d{1,2})?/gi))
    best = Math.max(best, Number(m[1]) * 60 + Number(m[2] ?? 0));
  return best;
}

/**
 * The fuelling type of a session. The coach's choice on the day wins; otherwise strength
 * is strength, a run or cross day is long when it says so or runs past 75 minutes, easy
 * when it is a walk or walk-run, quality when its title reads like intervals or a
 * Run&Bun, and easy otherwise. Rehab and
 * mobility days are easy days.
 */
export function fuelTypeFor(s: {
  discipline: string;
  title: string;
  notes?: string | null;
  override?: FuelType | null;
}): FuelType {
  if (s.override) return s.override;
  if (s.discipline === 'strength') return 'strength';
  if (s.discipline !== 'run' && s.discipline !== 'cross') return 'easy';
  const text = `${s.title} ${s.notes ?? ''}`;
  if (LONG.test(s.title) || minutesIn(text) >= 75) return 'long';
  // Walk-run intervals are return-to-running, not a hard session.
  if (/\bwalk/i.test(s.title)) return 'easy';
  if (QUALITY.test(s.title)) return 'quality';
  return 'easy';
}

const card = (c: Omit<FuelCard, 'published' | 'sort'> & { sort?: number }, published = true) =>
  ({ published, sort: 0, ...c }) as FuelCard;

/** Session cards and cues from her framework; she rewrites them in the portal. */
export const FUEL_DEFAULTS: FuelCard[] = [
  card({
    key: 'long',
    kind: 'session',
    title: 'Long run',
    face: {
      before: 'A carb-based meal a few hours before.',
      during: 'Carbs and fluid with electrolytes as you go.',
      after: 'Protein and carbs within the hour.',
    },
    detail: {
      before: 'Carb meal 2–3 h before, about 1–2 g per kg of body weight.',
      during: '30–60 g carbohydrate per hour, with fluid and electrolytes.',
      after: 'Protein about 0.3 g per kg, with carbs, within about an hour.',
    },
    why: 'Fuel for the work required: a long run is a high-carbohydrate day.',
    evidence: null,
    tag: null,
    sort: 1,
  }),
  card({
    key: 'quality',
    kind: 'session',
    title: 'Quality or Run&Bun',
    face: {
      before: 'Easy-to-digest carbs, low in fat and fibre.',
      during: 'Water; carbs only if it runs past an hour.',
      after: 'Protein and carbs soon after.',
    },
    detail: {
      before: 'Easy-digest carbs 1–2 h before, low in fat and fibre.',
      during: 'Water. Past 60 minutes, 30–60 g carbohydrate per hour.',
      after: 'Protein and carbs soon after: a carb-higher day.',
    },
    why: 'Hard sessions run on carbohydrate; recovery starts with the next meal.',
    evidence: null,
    tag: null,
    sort: 2,
  }),
  card({
    key: 'strength',
    kind: 'session',
    title: 'Strength',
    face: {
      before: 'Protein and some carbs beforehand — not fasted.',
      during: 'Water.',
      after: 'A protein-rich meal within a couple of hours.',
    },
    detail: {
      before: 'Protein and some carbs 1–2 h before.',
      during: 'Water.',
      after: 'Protein 25–40 g within about 2 hours.',
    },
    why: 'Protein across the day builds what the session asks for.',
    evidence: null,
    tag: null,
    sort: 3,
  }),
  card({
    key: 'plate',
    kind: 'cue',
    title: 'Build the plate',
    face: { cue: 'Protein and fat first, then fibre, then starch — sized to the day.' },
    detail: {
      cue: 'Carbohydrate never eaten alone. Starch goes up around key sessions and down on easy and rest days.',
    },
    why: 'Easy days need less carbohydrate; the order keeps energy steady.',
    evidence: null,
    tag: null,
    sort: 4,
  }),
  card({
    key: 'heat',
    kind: 'cue',
    title: 'Heat and hydration',
    face: { cue: 'Start well hydrated, and add salt to your fluids.' },
    detail: {
      cue: 'About 500–1000 mg sodium per litre on long or hard sessions, more if you sweat salty. Judge it by weighing before and after.',
    },
    why: 'Singapore heat raises sweat and sodium losses year-round.',
    evidence: null,
    tag: null,
    sort: 5,
  }),
  card({
    key: 'predawn',
    kind: 'cue',
    title: 'Running before breakfast',
    face: { cue: 'A small carb snack before, and start fuelling early on the run.' },
    detail: {
      cue: 'Carb-load the night before. 15–30 g quick carbs 15–30 min before — half a banana, white toast and honey, or a few sips of sports drink — then carbs within 20–30 min of starting, 30–60 g per hour.',
    },
    why: 'No time for a full meal: shift the fuel into the run instead.',
    evidence: null,
    tag: null,
    sort: 6,
  }),
];

/**
 * The starter set of eight, as drafts. Names and context tags are the spec's; the cue is
 * a placeholder that sends her to her coach. No doses, ever: those stay in the coach's
 * reference.
 */
export const SUPPLEMENT_DEFAULTS: FuelCard[] = (
  [
    ['iron', 'Iron', 'Test first', 'Have your levels checked before taking any — ask your coach.'],
    ['creatine', 'Creatine', 'Daily', 'Ask your coach whether it suits your training.'],
    [
      'collagen',
      'Collagen + vitamin C',
      'Timing matters',
      'Ask your coach about timing around your sessions.',
    ],
    ['caffeine', 'Caffeine', 'Timing matters', 'Ask your coach before using it around sessions.'],
    [
      'electrolytes',
      'Electrolytes',
      'Hot & long runs',
      'For long or hot runs — ask your coach how much.',
    ],
    ['vitamin-d', 'Vitamin D', 'Test first', 'Have your levels checked first — ask your coach.'],
    ['omega-3', 'Omega-3', 'Daily', 'Ask your coach whether it is worth adding.'],
    ['protein', 'Protein', 'Daily', 'Most days need more than you think — ask your coach.'],
  ] as const
).map(([key, title, tag, cue], i) =>
  card(
    {
      key: `supplement:${key}`,
      kind: 'supplement',
      title,
      face: { cue },
      detail: {},
      why: null,
      evidence: null,
      tag,
      sort: 10 + i,
    },
    false,
  ),
);

/** Her cards over the defaults: one of hers with the same key replaces the default. */
export function mergeFuelCards(mine: FuelCard[]): FuelCard[] {
  const byKey = new Map([...FUEL_DEFAULTS, ...SUPPLEMENT_DEFAULTS].map((c) => [c.key, c]));
  for (const c of mine) byKey.set(c.key, c);
  return [...byKey.values()].sort((a, b) => a.sort - b.sort);
}

export interface TodayFuel {
  type: FuelType;
  /** The card for the session, or the plate card on an easy day. */
  main: FuelCard | null;
  /** The heat cue and the pre-dawn variant, on long runs only. */
  extras: FuelCard[];
}

/**
 * What the session screen shows. Easy days get the plate reminder, not a fuelling card;
 * long runs add the heat cue and the pre-dawn variant. Only published cards count, and a
 * restrictive-pattern client gets them with every amount taken off.
 */
export function fuelForSession(
  cards: FuelCard[],
  type: FuelType,
  opts: { restrictive: boolean },
): TodayFuel {
  const live = new Map(cards.filter((c) => c.published).map((c) => [c.key, c]));
  const strip = (c: FuelCard | undefined) =>
    c ? (opts.restrictive ? { ...c, detail: {} } : c) : null;
  const main = strip(live.get(type === 'easy' ? 'plate' : type));
  const extras =
    type === 'long'
      ? ([strip(live.get('heat')), strip(live.get('predawn'))].filter(Boolean) as FuelCard[])
      : [];
  return { type, main, extras };
}

export const FUEL_TYPE_LABEL: Record<FuelType, string> = {
  long: 'Long run',
  quality: 'Quality session',
  easy: 'Easy day',
  strength: 'Strength',
};
