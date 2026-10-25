/**
 * Fuel for today: which card a session gets, and what it says.
 *
 * The cards are the coach's to write. What ships here is her framework from the build
 * spec — fuel for the work required, carbohydrate periodised to the session, the plate
 * built protein and fat, then fibre, then starch — as defaults she replaces in the portal.
 * The face of a card has no numbers; amounts sit behind a tap — grams, millilitres and
 * milligrams with a food or product to picture, and per-kg amounts worked out from her
 * latest weight — and a client flagged for restrictive patterns never sees them. Supplement cards ship as drafts: the coach's own
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
      before:
        'Carb meal 2–3 h before: 1–2 g per kg of body weight — e.g. 2 slices of white toast with honey and a banana is about 70 g. Drink 5–7 mL per kg in the same window.',
      during:
        '30–60 g carbohydrate per hour, starting in the first 20–30 min: a gel is about 20–25 g, 500 mL of sports drink about 30 g, half a banana about 12 g. Fluid 400–800 mL per hour, with 500–1000 mg sodium per litre.',
      after:
        'Within about an hour: protein 0.3 g per kg (200 g Greek yogurt is about 20 g) with carbs 1–1.2 g per kg. Drink 1.25–1.5 L for every kg lost on the run.',
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
      before:
        'Easy-digest carbs 1–2 h before, low in fat and fibre: about 1 g per kg — a banana and a slice of white toast with jam is about 50 g. 300–500 mL water.',
      during:
        'Water, 400–800 mL per hour in the heat: sips of 150–200 mL every 15–20 min. Past 60 minutes, 30–60 g carbohydrate per hour — a gel is about 20–25 g.',
      after:
        'Soon after: protein 0.3 g per kg with carbs about 1 g per kg — 2 eggs on 2 slices of toast and a glass of milk is about 25 g protein and 40 g carbs. A carb-higher day.',
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
      before:
        'Protein and some carbs 1–2 h before — 150 g Greek yogurt with a banana is about 15 g protein and 30 g carbs.',
      during: 'Water, about 500 mL across the session.',
      after:
        'Protein 25–40 g within about 2 hours — 100–120 g cooked chicken is about 30–35 g; 2 eggs and 200 g Greek yogurt about 32 g.',
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
      cue: 'Protein about 1.6 g per kg a day, across 4 meals — roughly 25 g a meal: a palm-sized piece of meat or fish, or 250 g Greek yogurt. Carbohydrate never eaten alone. Starch goes up around key sessions — an extra 150 g cooked rice or pasta is about 40–45 g — and down on easy and rest days.',
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
      cue: 'Before: 5–7 mL per kg 2–4 h before. During: 400–800 mL per hour with 500–1000 mg sodium per litre — a 500 mL bottle needs 250–500 mg, so check your electrolyte tab’s label; more if you sweat salty. After: weigh before and after, and drink 1.25–1.5 L for every kg lost.',
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
      cue: 'Carb-load the night before. 15–30 g quick carbs 15–30 min before — a small banana (about 20 g), a slice of white toast with honey (about 30 g), or 250 mL sports drink (about 15 g) — with 200–300 mL water. Then carbs within 20–30 min of starting, 30–60 g per hour.',
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
 * restrictive-pattern client gets them with every amount taken off. With her weight, the
 * per-kg amounts also read in grams and millilitres for her.
 */
export function fuelForSession(
  cards: FuelCard[],
  type: FuelType,
  opts: { restrictive: boolean; weightKg?: number | null },
): TodayFuel {
  const live = new Map(cards.filter((c) => c.published).map((c) => [c.key, c]));
  const strip = (c: FuelCard | undefined) =>
    c ? (opts.restrictive ? { ...c, detail: {} } : forWeight(c, opts.weightKg)) : null;
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

/** The order a card's lines read in, whatever order they were stored in. */
export const FUEL_LINES: (keyof FuelLines)[] = ['before', 'during', 'after', 'cue'];

// A per-kg amount: "1–2 g per kg", "1 to 2 g/kg", "0.3 g per kg of body weight", "5–7 ml
// per kg". Not a figure inside another number (".3", "0,3"), not "per kg lost" (that is
// fluid against weight lost, not body weight) and not per kg of fat-free mass. The first
// group keeps the character before the number, so no lookbehind is needed on Hermes.
const PER_KG =
  /(^|[^\d.,])(\d+(?:\.\d+)?)(?:\s*(?:[–—-]|to)\s*(\d+(?:\.\d+)?))?\s*(g|ml)\s*(?:per\s+kg|\/\s*kg)(?!\s+(?:of\s+)?(?:weight\s+|body\s*weight\s+)?lost|\s*(?:of\s+)?(?:ffm|fat-free|lean))(?:\s+of\s+body\s*weight)?(?:\s+a\s+day)?/gi;

/**
 * Per-kg amounts in a line, worked out for her weight: "1–2 g per kg" reads "1–2 g per kg
 * (about 60–120 g for you)" at 60 kg. Grams round to 5 and millilitres to 50; the line is
 * left as written without a plausible weight.
 */
export function amountsFor(text: string, weightKg: number | null | undefined): string {
  if (!weightKg || weightKg < 30 || weightKg > 200) return text;
  return text.replace(
    PER_KG,
    (match, _before: string, lo: string, hi: string | undefined, unit: string) => {
      const ml = unit.toLowerCase() === 'ml';
      const step = ml ? 50 : 5;
      const at = (perKg: string) =>
        Math.max(step, Math.round((Number(perKg) * weightKg) / step) * step);
      const a = at(lo);
      const b = hi ? at(hi) : a;
      return `${match} (about ${a === b ? a : `${a}–${b}`} ${ml ? 'mL' : 'g'} for you)`;
    },
  );
}

function forWeight(c: FuelCard, weightKg: number | null | undefined): FuelCard {
  if (!weightKg) return c;
  const detail: FuelLines = {};
  for (const k of FUEL_LINES) if (c.detail[k]) detail[k] = amountsFor(c.detail[k]!, weightKg);
  return { ...c, detail };
}

// ---------------------------------------------------------------------------
// The fuelling check after a session
// ---------------------------------------------------------------------------

export type FuelFollowed = 'yes' | 'partly' | 'no';
export type FuelEnough = 'ran_out' | 'short' | 'right' | 'heavy';
export type FuelBarrier = 'forgot' | 'not_with_me' | 'stomach' | 'not_hungry' | 'changed';

/** Did she fuel as planned. */
export const FUEL_FOLLOWED_LABEL: Record<FuelFollowed, string> = {
  yes: 'Yes',
  partly: 'Partly',
  no: 'No',
};

/**
 * Was it enough for the session, as she felt it. "Sat heavy" is about her stomach, not
 * the amount, so the scale never reads as eating too much.
 */
export const FUEL_ENOUGH_LABEL: Record<FuelEnough, string> = {
  ran_out: 'Ran out of energy',
  short: 'A bit short',
  right: 'About right',
  heavy: 'Sat heavy',
};

/**
 * Her stomach during the session, 0 to 3: the exercise gut-symptom scale (0 none, 10 bad
 * enough to stop) in four taps.
 */
export const FUEL_GUT_LABEL = ['None', 'Mild', 'Slowed me down', 'Had to stop'] as const;

/** What got in the way, asked only when she did not fuel as planned. */
export const FUEL_BARRIER_LABEL: Record<FuelBarrier, string> = {
  forgot: 'Forgot',
  not_with_me: "Didn't have it with me",
  stomach: 'My stomach',
  not_hungry: "Didn't feel like it",
  changed: 'The session changed',
};

export interface FuelCheck {
  followed: FuelFollowed | null;
  enough: FuelEnough | null;
  gut: number | null;
  barrier: FuelBarrier | null;
}

export interface FuelCheckSummary {
  /** Sessions she answered the check for. */
  answered: number;
  followed: number;
  partly: number;
  missed: number;
  right: number;
  /** Ran out of energy or a bit short. */
  short: number;
  ranOut: number;
  heavy: number;
  /** Any stomach trouble, and the times it slowed her down or stopped her. */
  gut: number;
  gutHard: number;
}

/**
 * Her answers over a window, counted as they were given: followed and enough stay separate,
 * because together they say what to change — followed and short means the plan is too
 * light; not followed and short means the plan is not happening.
 */
export function summariseFuelChecks(checks: FuelCheck[]): FuelCheckSummary {
  const s: FuelCheckSummary = {
    answered: 0,
    followed: 0,
    partly: 0,
    missed: 0,
    right: 0,
    short: 0,
    ranOut: 0,
    heavy: 0,
    gut: 0,
    gutHard: 0,
  };
  for (const c of checks) {
    if (!c.followed && !c.enough) continue;
    s.answered++;
    if (c.followed === 'yes') s.followed++;
    if (c.followed === 'partly') s.partly++;
    if (c.followed === 'no') s.missed++;
    if (c.enough === 'right') s.right++;
    if (c.enough === 'short' || c.enough === 'ran_out') s.short++;
    if (c.enough === 'ran_out') s.ranOut++;
    if (c.enough === 'heavy') s.heavy++;
    if ((c.gut ?? 0) >= 1) s.gut++;
    if ((c.gut ?? 0) >= 2) s.gutHard++;
  }
  return s;
}
