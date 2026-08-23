/**
 * Recovery and strain — the two numbers on the Today band.
 *
 * Both are scored against the person rather than a population. There is no normative table
 * behind them and no borrowed algorithm: recovery is her sleep and her HRV against her own
 * recent nights, plus what she said about how she feels; strain is today's work against her
 * own recent hardest day. That choice is not modesty, it is the only honest option — a
 * postpartum cohort has no meaningful population baseline, and a number implying one would
 * be read as clinical when it is not.
 *
 * Every function is pure and date-free. Nothing here reads a clock.
 */

/** Readiness as logged: 0 depleted → 4 strong. */
export type Readiness = 0 | 1 | 2 | 3 | 4;

export type RecoveryBand = 'low' | 'moderate' | 'good' | 'strong';

export interface RecoveryInput {
  /** Minutes asleep last night. Null when there was no watch, or no permission. */
  sleepMinutes: number | null;
  /** Her own median over recent nights. Null until there are enough of them. */
  sleepBaselineMinutes: number | null;
  /** The readiness she logged. Null when she has not said yet. */
  readiness: Readiness | null;
  hrvMs: number | null;
  hrvBaselineMs: number | null;
}

export interface Recovery {
  /** 0–100, or null when there is nothing at all to go on. */
  score: number | null;
  band: RecoveryBand;
  /** What actually fed the number, in plain words, for the label under it. */
  sources: string[];
  /** True when the body signals are missing and this rests on her answer alone. */
  estimated: boolean;
  /** The sentence under the ring. */
  note: string;
}

/** No baseline yet? Judge sleep against this. Not a recommendation, just a yardstick. */
const SLEEP_YARDSTICK_MIN = 450;

/** Weights before renormalising. Only the signals present are counted. */
const WEIGHTS = { sleep: 0.4, readiness: 0.4, hrv: 0.2 };

export function recovery(input: RecoveryInput): Recovery {
  const parts: { weight: number; score: number; label: string }[] = [];

  if (input.sleepMinutes !== null) {
    const base = input.sleepBaselineMinutes ?? SLEEP_YARDSTICK_MIN;
    parts.push({ weight: WEIGHTS.sleep, score: ratioScore(input.sleepMinutes / base), label: 'sleep' });
  }

  if (input.readiness !== null) {
    parts.push({
      weight: WEIGHTS.readiness,
      score: READINESS_SCORE[input.readiness],
      label: 'how you feel',
    });
  }

  // HRV only counts against a baseline. A single reading in isolation says nothing — HRV
  // varies several-fold between people, so an absolute number cannot be scored.
  if (input.hrvMs !== null && input.hrvBaselineMs !== null && input.hrvBaselineMs > 0) {
    parts.push({ weight: WEIGHTS.hrv, score: ratioScore(input.hrvMs / input.hrvBaselineMs), label: 'HRV' });
  }

  if (parts.length === 0) {
    return {
      score: null,
      band: 'moderate',
      sources: [],
      estimated: true,
      note: 'Tell me how today feels and this fills in.',
    };
  }

  // Renormalise across what is present, so a missing signal shifts the weighting rather
  // than dragging the score toward zero.
  const weight = parts.reduce((n, p) => n + p.weight, 0);
  const score = Math.round(parts.reduce((n, p) => n + p.score * p.weight, 0) / weight);
  const band = bandFor(score);
  const estimated = input.sleepMinutes === null;

  return {
    score,
    band,
    sources: parts.map((p) => p.label),
    estimated,
    note: noteFor(band, input),
  };
}

/** Readiness → points. Deliberately not linear: "steady" is a pass, not a middling fail. */
const READINESS_SCORE: Record<Readiness, number> = { 0: 15, 1: 38, 2: 62, 3: 82, 4: 95 };

/**
 * A ratio against her own baseline, scored.
 *
 * Flat at both ends on purpose. Twice the usual sleep is not twice as recovered, and half
 * of it is bad without being zero — a linear scale would make one short night read as a
 * medical event.
 */
function ratioScore(ratio: number): number {
  const stops: [number, number][] = [
    [0.5, 15],
    [0.7, 40],
    [0.85, 62],
    [1.0, 82],
    [1.15, 95],
    [1.3, 100],
  ];
  if (ratio <= stops[0]![0]) return stops[0]![1];
  for (let i = 1; i < stops.length; i++) {
    const [hi, hiScore] = stops[i]!;
    const [lo, loScore] = stops[i - 1]!;
    if (ratio <= hi) {
      return Math.round(loScore + ((ratio - lo) / (hi - lo)) * (hiScore - loScore));
    }
  }
  return 100;
}

function bandFor(score: number): RecoveryBand {
  if (score < 34) return 'low';
  if (score < 67) return 'moderate';
  if (score < 85) return 'good';
  return 'strong';
}

/**
 * One sentence, and it must not prescribe.
 *
 * The plan card below already says what to do; this says what the number means. Warm and
 * flat, no exclamation marks — and never "you should skip today", which is a clinical call
 * belonging to her physiotherapist rather than to an average of three numbers.
 */
function noteFor(band: RecoveryBand, input: RecoveryInput): string {
  const shortSleep =
    input.sleepMinutes !== null &&
    input.sleepBaselineMinutes !== null &&
    input.sleepMinutes < input.sleepBaselineMinutes * 0.8;

  if (band === 'low') {
    return shortSleep
      ? 'A short night, and it shows. Something small still counts.'
      : 'Low reserves today. Something small still counts.';
  }
  if (band === 'moderate') {
    return shortSleep
      ? 'A middling day, and you slept less than usual. Train to plan, but stay honest.'
      : 'A middling day. Train to plan, but stay honest with yourself.';
  }
  if (band === 'good') return 'Good reserves. The session as written should sit fine.';
  return 'Well recovered. There is room in this if you want it.';
}

/* ─────────────────────────────────────────────────────────────
 * Strain
 * ───────────────────────────────────────────────────────────── */

export interface StrainInput {
  /** Working sets ticked today. */
  setsDone: number;
  /** Working sets today's plan asks for. Zero on a rest day. */
  setsPlanned: number;
  /** Her own busiest day in the recent window. Zero when she has no history. */
  peakSets: number;
}

export interface Strain {
  /** Today, as a percentage of her own hardest recent day. */
  score: number;
  /** What today's plan comes to on the same scale. Null on a rest day. */
  target: number | null;
  /** True while the scale is today's plan rather than her history. */
  provisional: boolean;
}

/**
 * Today's load, against her own recent ceiling.
 *
 * With no history the ceiling is today's plan, so a full session reads 100% and the target
 * sits at 100% — honest, and it stops a first session reading as either trivial or heroic.
 * Once there is a real busiest day, that becomes the scale and the plan is measured against
 * it, which is what makes a light day look light.
 */
export function strain(input: StrainInput): Strain {
  const provisional = input.peakSets <= 0;
  const scale = provisional ? Math.max(1, input.setsPlanned) : input.peakSets;

  return {
    score: Math.min(100, Math.round((input.setsDone / scale) * 100)),
    target: input.setsPlanned > 0 ? Math.min(100, Math.round((input.setsPlanned / scale) * 100)) : null,
    provisional,
  };
}

/** The median, for a sleep or HRV baseline. Null on an empty set. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}
