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

export type FuelType =
  | 'long'
  | 'long_gut'
  | 'long_absorb'
  | 'long_rehearsal'
  | 'quality'
  | 'double'
  | 'easy'
  | 'strength';

/**
 * The long-run cards of a race block, which the coach picks per day: gut training in the
 * first weeks, the absorption week, then race rehearsal. Untagged, a long run gets the
 * general long-run card.
 */
export const LONG_RUN_TYPES: FuelType[] = ['long', 'long_gut', 'long_absorb', 'long_rehearsal'];
export const isLongRun = (t: FuelType) => LONG_RUN_TYPES.includes(t);

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
// Two sessions in a day: "DOUBLE – AM 5 km easy · PM progression", "easy 5 km · PM boxing".
const DOUBLE = /\bdouble\b|\bPM\b/;

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
 * The fuelling type of a session. The coach's choice on the day wins — including which
 * long-run card of a race block it gets; otherwise a day with two sessions (a "DOUBLE", or
 * a "PM" part) is a double day, strength is strength, a run or cross day is long when it
 * says so or runs past 75 minutes, easy when it is a walk or walk-run, quality when its
 * title reads like intervals or a Run&Bun, and easy otherwise. Rehab and mobility days
 * are easy days.
 */
export function fuelTypeFor(s: {
  discipline: string;
  title: string;
  notes?: string | null;
  override?: FuelType | null;
}): FuelType {
  if (s.override) return s.override;
  if (DOUBLE.test(s.title)) return 'double';
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

const LONG_BEFORE =
  'Carb meal 2–3 h before: 1–2 g per kg of body weight — e.g. 2 slices of white toast with honey and a banana is about 70 g. Drink 5–7 mL per kg in the same window.';
const LONG_AFTER =
  'Within about an hour: protein 0.3 g per kg (200 g Greek yogurt is about 20 g) with carbs 1–1.2 g per kg. Drink 1.25–1.5 L for every kg lost on the run.';

/**
 * Her race-block notes: the long run by block week (picked per day in the builder), easy
 * runs, double days, the second half of the cycle, and the golden rule. What must reach a
 * client flagged for restrictive patterns — fuel up, never down — sits on the face.
 */
const BLOCK_CARDS: FuelCard[] = [
  card({
    key: 'long_gut',
    kind: 'session',
    title: 'Long run · gut training',
    face: {
      before: 'A carb-based meal a few hours before.',
      during: 'Practise fuelling: a small dose of carbs regularly, from early in the run.',
      after: 'Protein and carbs within the hour.',
    },
    detail: {
      before: LONG_BEFORE,
      during:
        '20–30 g carbohydrate per hour — a gel, chews or sports drink, any form works: one dose every 20–25 min, starting at 40 minutes.',
      after: LONG_AFTER,
    },
    why: 'Training your gut is part of training.',
    evidence: null,
    tag: null,
    sort: 2,
  }),
  card({
    key: 'long_absorb',
    kind: 'session',
    title: 'Long run · absorption week',
    face: {
      before: 'Your usual carb meal — don’t eat lighter because the week feels easier.',
      during: 'Keep fuelling as on your other long runs.',
      after: 'Protein and carbs within the hour.',
    },
    detail: {
      before: LONG_BEFORE,
      during:
        '20–30 g carbohydrate per hour, one dose every 20–25 min from 40 minutes: intensity drops, distance stays — so fuelling stays.',
      after: LONG_AFTER,
    },
    why: 'Intensity drops, distance stays — so fuelling stays. Carbs during the long run protect your bones too.',
    evidence: null,
    tag: null,
    sort: 3,
  }),
  card({
    key: 'long_rehearsal',
    kind: 'session',
    title: 'Long run · race rehearsal',
    face: {
      before: 'Extra carbs the day before, then your usual carb meal.',
      during: 'Race-day fuelling: the same products, regular doses, and drink with them.',
      after: 'Protein and carbs within the hour.',
    },
    detail: {
      before: `Extra carbs the day before. ${LONG_BEFORE}`,
      during:
        '30–45 g carbohydrate per hour with the same products you will use on race day, a dose every 20–25 min. Fluid and a pinch of sodium with each: heat cuts carb absorption by about 20%, so don’t megadose — drink with it.',
      after: LONG_AFTER,
    },
    why: 'Rehearse race day, so nothing on the day is new.',
    evidence: null,
    tag: null,
    sort: 4,
  }),
  card({
    key: 'double',
    kind: 'session',
    title: 'Double day',
    face: {
      before: 'Something carb-based before each session.',
      during: 'Water; carbs only if a session runs past an hour.',
      after: 'Carbs after both sessions — not just the second.',
    },
    detail: {
      before:
        'Easy-digest carbs 1–2 h before each session, low in fat and fibre: about 1 g per kg — a banana and a slice of white toast with jam is about 50 g.',
      during: 'Water. Past 60 minutes, 30–60 g carbohydrate per hour.',
      after:
        'Carbs after both sessions. If the next session is less than 24 h away: roughly 1 g per kg each hour of fast carbs in the first 2 h after finishing.',
    },
    why: 'The second session runs on how well you refuelled after the first.',
    evidence: null,
    tag: null,
    sort: 6,
  }),
  card({
    key: 'easy',
    kind: 'session',
    title: 'Easy run',
    face: {
      before: 'Eat normally earlier in the day.',
      during: 'Water only — nothing else.',
      after: 'Your next normal meal.',
    },
    detail: {
      before:
        'No special load before an easy run under 60 minutes: eat normally earlier in the day.',
      during: 'Water only. Carbs during would blunt what this run is building.',
      after: 'No recovery fuel needed: your next meal, built on the plate.',
    },
    why: 'Easy runs under an hour are where your fat-burning engine improves; carbs during would blunt it.',
    evidence: null,
    tag: null,
    sort: 7,
  }),
  card({
    key: 'luteal',
    kind: 'cue',
    title: 'Second half of your cycle',
    face: {
      cue: 'A little more carbohydrate and protein than usual — and in the heat, add sodium to your water rather than plain water only.',
    },
    detail: {
      cue: 'Slightly more carbs and protein than usual. On long or hard sessions in the heat, 500–1000 mg sodium per litre.',
    },
    why: 'In the second half of the cycle plasma volume is lower and sodium loss higher.',
    evidence: null,
    tag: null,
    sort: 12,
  }),
  card({
    key: 'golden',
    kind: 'cue',
    title: 'The golden rule',
    face: {
      cue: 'We scale fuel up to the session, never down: no fasted key sessions, and no low-carb evenings after training.',
    },
    detail: {},
    why: null,
    evidence: null,
    tag: null,
    sort: 13,
  }),
];

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
    sort: 5,
  }),
  card({
    key: 'strength',
    kind: 'session',
    title: 'Strength',
    face: {
      before: 'Protein and some carbs beforehand — not fasted.',
      during: 'Water.',
      after: 'A protein-rich meal, and dairy protein before bed after an evening session.',
    },
    detail: {
      before:
        'Protein and some carbs 1–2 h before — 150 g Greek yogurt with a banana is about 15 g protein and 30 g carbs.',
      during: 'Water, about 500 mL across the session.',
      after:
        'Protein 25–40 g within about 2 hours — 100–120 g cooked chicken is about 30–35 g; 2 eggs and 200 g Greek yogurt about 32 g. On a strength evening, before bed: 30–40 g dairy protein — 300–400 g Greek yogurt or a casein shake; a big glass of milk (about 10 g) counts toward it.',
    },
    why: 'Your muscles and tendons rebuild overnight — feed them.',
    evidence: null,
    tag: null,
    sort: 8,
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
    sort: 9,
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
    sort: 10,
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
    sort: 11,
  }),
  ...BLOCK_CARDS,
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
      sort: 20 + i,
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
 * What the session screen shows. An easy run gets the easy-run card and the plate reminder,
 * other easy days the plate alone; long runs add the heat cue and the pre-dawn variant;
 * every other session the golden rule; and the second half of her cycle its own cue. Only published cards count, and a
 * restrictive-pattern client gets them with every amount taken off. With her weight, the
 * per-kg amounts also read in grams and millilitres for her.
 */
export function fuelForSession(
  cards: FuelCard[],
  type: FuelType,
  opts: {
    restrictive: boolean;
    weightKg?: number | null;
    /** The session's discipline: an easy run gets the easy-run card, other easy days the plate. */
    discipline?: string | null;
    /** In the second half of her cycle, from cycle context she chose to share. */
    luteal?: boolean;
  },
): TodayFuel {
  const live = new Map(cards.filter((c) => c.published).map((c) => [c.key, c]));
  const strip = (c: FuelCard | undefined) =>
    c ? (opts.restrictive ? { ...c, detail: {} } : forWeight(c, opts.weightKg)) : null;
  const easyRun = type === 'easy' && (opts.discipline === 'run' || opts.discipline === 'cross');
  const pick = (): FuelCard | undefined => {
    if (type === 'easy') return (easyRun && live.get('easy')) || live.get('plate');
    // A block long-run card she has not published falls back to the general one.
    if (isLongRun(type)) return live.get(type) ?? live.get('long');
    return live.get(type);
  };
  const main = strip(pick());
  const extraKeys = [
    ...(isLongRun(type) ? ['heat', 'predawn'] : []),
    ...(easyRun && main?.key === 'easy' ? ['plate'] : []),
    ...(opts.luteal ? ['luteal'] : []),
    ...(type !== 'easy' ? ['golden'] : []),
  ];
  const extras = extraKeys.map((k) => strip(live.get(k))).filter(Boolean) as FuelCard[];
  return { type, main, extras };
}

/** The fuelling check follows a session that had something to fuel: not an easy day. */
export const asksFuelCheck = (type: FuelType) => type !== 'easy';

export const FUEL_TYPE_LABEL: Record<FuelType, string> = {
  long: 'Long run',
  long_gut: 'Long run · gut training',
  long_absorb: 'Long run · absorption week',
  long_rehearsal: 'Long run · race rehearsal',
  quality: 'Quality session',
  double: 'Double day',
  easy: 'Easy day',
  strength: 'Strength',
};

/** The type in a word or two, where space is short: every long run is a long run. */
export const fuelTypeShort = (t: FuelType) => (isLongRun(t) ? 'Long run' : FUEL_TYPE_LABEL[t]);

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
