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
  /**
   * Restorative minutes last night — deep plus REM. Null when the watch reported only a
   * total, which older models and most third-party trackers do.
   */
  restorativeMinutes?: number | null;
  /** Her own median restorative minutes, for the same reason the others need one. */
  restorativeBaselineMinutes?: number | null;
  /**
   * Minutes awake in bed last night, and the night's asleep total, which together give
   * sleep efficiency. Broken sleep is the norm with a baby and the thing a duration alone
   * cannot see: eight hours in five pieces is not eight hours.
   */
  awakeMinutes?: number | null;
  /**
   * Resting heart rate last night against her own recent nights. Imported since Phase 4 and
   * never read here until now, which was the largest gap in this function — an elevated
   * resting rate is the classic overnight signal of illness, alcohol or accumulated
   * fatigue, and it moves before anything else does.
   */
  restingHr?: number | null;
  restingHrBaseline?: number | null;
  /**
   * Overnight respiratory rate against her own baseline. The other early signal: it rises
   * with a developing infection well before she feels unwell.
   */
  respiratoryRate?: number | null;
  respiratoryRateBaseline?: number | null;
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

/**
 * Weights before renormalising. Only the signals present are counted.
 *
 * These are the body's signals and nothing else — how she says she feels is no longer one
 * of them. It used to carry three tenths of the score and, when there was no watch, all of
 * it, which is how the screen could report 82% and "GOOD" off a single tap and no
 * measurement whatsoever. A number assembled that way looks exactly like a measured one.
 *
 * Sleep is split once the stages are known: how long she slept, how much of it was
 * restorative, and how broken it was are three different questions, and a long shallow night
 * in five pieces should not score as a good one. Where stages are unavailable the duration
 * carries sleep's whole share, so a watch that reports only a total is not penalised.
 *
 * Resting heart rate and respiratory rate are the overnight signals that move first — before
 * HRV in many cases, and well before she notices anything herself.
 */
const WEIGHTS = {
  sleep: 0.24,
  restorative: 0.2,
  efficiency: 0.1,
  hrv: 0.18,
  restingHr: 0.18,
  respiratoryRate: 0.1,
};

/** Sleep's full share, for when no stage breakdown arrived. */
const SLEEP_ONLY_WEIGHT = WEIGHTS.sleep + WEIGHTS.restorative;

/**
 * How far the readiness she logged may move the measured score, in points.
 *
 * It is a buffer, not an input. Her own read is real information — she knows things the
 * watch cannot, and a physiotherapist would always ask — but it is the one signal she
 * controls, the one most coloured by mood and by what she thinks the app wants to hear, and
 * it arrives on a five-point scale. Letting it swing the number thirty points made recovery
 * partly a self-assessment wearing the clothes of a measurement.
 *
 * Ten points at the extremes and five at the intermediate steps: enough that saying
 * "depleted" visibly changes what the screen tells her, never enough to turn a bad night
 * into a good score.
 */
const READINESS_NUDGE: Record<Readiness, number> = { 0: -10, 1: -5, 2: 0, 3: 5, 4: 10 };

export function recovery(input: RecoveryInput): Recovery {
  const parts: { weight: number; score: number; label: string }[] = [];

  const hasStages =
    input.restorativeMinutes != null &&
    input.restorativeBaselineMinutes != null &&
    input.restorativeBaselineMinutes > 0;

  if (input.sleepMinutes !== null) {
    const base = input.sleepBaselineMinutes ?? SLEEP_YARDSTICK_MIN;
    parts.push({
      weight: hasStages ? WEIGHTS.sleep : SLEEP_ONLY_WEIGHT,
      score: ratioScore(input.sleepMinutes / base),
      label: 'sleep',
    });
  }

  if (hasStages) {
    parts.push({
      weight: WEIGHTS.restorative,
      score: ratioScore(input.restorativeMinutes! / input.restorativeBaselineMinutes!),
      label: 'deep and REM',
    });
  }

  // How broken the night was, not just how long it ran. Only computable when the watch
  // reported wake time, which is the same watches that report stages.
  if (
    input.awakeMinutes != null &&
    input.sleepMinutes !== null &&
    input.sleepMinutes + input.awakeMinutes > 0
  ) {
    const efficiency = input.sleepMinutes / (input.sleepMinutes + input.awakeMinutes);
    // Against a fixed 90%, not her own baseline: unlike HRV this one has a physiological
    // ceiling everybody shares, and scoring it relative to herself would quietly accept a
    // chronically broken night as normal — which, with a baby, it may well be, but that is
    // the fact worth surfacing rather than the one worth absorbing.
    parts.push({ weight: WEIGHTS.efficiency, score: ratioScore(efficiency / 0.9), label: 'how settled' });
  }

  // HRV only counts against a baseline. A single reading in isolation says nothing — HRV
  // varies several-fold between people, so an absolute number cannot be scored.
  if (input.hrvMs !== null && input.hrvBaselineMs !== null && input.hrvBaselineMs > 0) {
    parts.push({ weight: WEIGHTS.hrv, score: ratioScore(input.hrvMs / input.hrvBaselineMs), label: 'HRV' });
  }

  // Both of these run the other way — above baseline is worse — and both deviate in much
  // smaller percentages than sleep or HRV do, so they are amplified before scoring.
  if (input.restingHr != null && input.restingHrBaseline != null && input.restingHrBaseline > 0) {
    parts.push({
      weight: WEIGHTS.restingHr,
      score: elevationScore(input.restingHr, input.restingHrBaseline),
      label: 'resting heart rate',
    });
  }

  if (
    input.respiratoryRate != null &&
    input.respiratoryRateBaseline != null &&
    input.respiratoryRateBaseline > 0
  ) {
    parts.push({
      weight: WEIGHTS.respiratoryRate,
      score: elevationScore(input.respiratoryRate, input.respiratoryRateBaseline),
      label: 'breathing rate',
    });
  }

  /**
   * Nothing measured at all.
   *
   * Her own read carries it, and `estimated` says so — a woman without a watch is a large
   * share of this population and a blank dial helps her not at all. This is the one path
   * where readiness is more than a buffer, and it is marked as such on the screen rather
   * than dressed up as a measurement.
   */
  if (parts.length === 0) {
    if (input.readiness === null) {
      return {
        score: null,
        band: 'moderate',
        sources: [],
        estimated: true,
        note: 'Tell me how today feels and this fills in.',
      };
    }
    const feelScore = READINESS_ONLY_SCORE[input.readiness];
    return {
      score: feelScore,
      band: bandFor(feelScore),
      sources: ['how you feel'],
      estimated: true,
      note: noteFor(bandFor(feelScore), input),
    };
  }

  // Renormalise across what is present, so a missing signal shifts the weighting rather
  // than dragging the score toward zero.
  const weight = parts.reduce((n, p) => n + p.weight, 0);
  const measured = parts.reduce((n, p) => n + p.score * p.weight, 0) / weight;

  // The buffer. Bounded by construction — see READINESS_NUDGE.
  const nudge = input.readiness === null ? 0 : READINESS_NUDGE[input.readiness];
  const score = Math.max(0, Math.min(100, Math.round(measured + nudge)));
  const band = bandFor(score);

  return {
    score,
    band,
    sources: [...parts.map((p) => p.label), ...(input.readiness === null ? [] : ['how you feel'])],
    estimated: false,
    note: noteFor(band, input),
  };
}

/**
 * Readiness → points, for the no-watch path only.
 *
 * Deliberately not linear: "steady" is a pass, not a middling fail. Kept separate from the
 * nudge because they answer different questions — this one is "what is the whole score when
 * her word is all there is", the other is "how far may her word move a measurement".
 */
const READINESS_ONLY_SCORE: Record<Readiness, number> = { 0: 15, 1: 38, 2: 62, 3: 82, 4: 95 };

/**
 * Score a signal where above baseline is worse — resting heart rate, breathing rate.
 *
 * Their deviations are compressed: five beats on a resting rate of 55 is nine per cent and
 * a genuinely bad night, where nine per cent less sleep is barely a rounding error. So the
 * deviation is doubled before it meets the same curve the other signals use, which keeps one
 * shape for the whole function instead of a second set of stops to keep in step.
 *
 * The doubling is a calibration, not a clinical constant. It is set so that roughly five per
 * cent over baseline reads as a mild miss and ten per cent as a clear one, which is the range
 * these two signals actually move in.
 */
function elevationScore(value: number, baseline: number): number {
  const deviation = (value - baseline) / baseline;
  return ratioScore(1 - deviation * 2);
}

/**
 * A ratio against her own baseline, scored.
 *
 * Flat at both ends on purpose. Twice the usual sleep is not twice as recovered, and half
 * of it is bad without being zero — a linear scale would make one short night read as a
 * medical event.
 *
 * Returns a float. Rounding happens once, at the end of `recovery`, because rounding each
 * component to an integer before weighting them added up to a point of noise for nothing.
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
      return loScore + ((ratio - lo) / (hi - lo)) * (hiScore - loScore);
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

  /**
   * A resting rate well above her own baseline, which is worth naming rather than folding
   * into a general "low reserves". It is the one finding here a physiotherapist would act on
   * and a client can recognise — and it is descriptive, not a diagnosis: the sentence
   * reports the reading and stops, because "you are coming down with something" is a
   * clinical call this function is in no position to make.
   */
  const raisedResting =
    input.restingHr != null &&
    input.restingHrBaseline != null &&
    input.restingHrBaseline > 0 &&
    input.restingHr > input.restingHrBaseline * 1.07;

  if (band === 'low') {
    if (raisedResting) return 'Your resting heart rate is up on your usual. Go gently today.';
    return shortSleep
      ? 'A short night, and it shows. Something small still counts.'
      : 'Low reserves today. Something small still counts.';
  }
  if (band === 'moderate') {
    if (raisedResting) return 'Resting heart rate a little above your usual. Train to plan, but stay honest.';
    return shortSleep
      ? 'A middling day, and you slept less than usual. Train to plan, but stay honest.'
      : 'A middling day. Train to plan, but stay honest with yourself.';
  }

  /**
   * The raised rate is named in the good bands too — and it matters most here. A resting
   * rate ten per cent up after an otherwise fine night is the early-infection shape: the one
   * signal that moved is the one a good night's sleep is masking in the average. Saying
   * "the session as written should sit fine" over the top of it is the average speaking
   * for the one reading that disagrees.
   */
  if (band === 'good') {
    return raisedResting
      ? 'Good reserves, though your resting heart rate is above your usual. Worth noticing.'
      : 'Good reserves. The session as written should sit fine.';
  }
  return raisedResting
    ? 'Well recovered on most counts. Your resting heart rate is above your usual — worth noticing.'
    : 'Well recovered. There is room in this if you want it.';
}

/* ─────────────────────────────────────────────────────────────
 * Strain
 * ───────────────────────────────────────────────────────────── */

export interface StrainInput {
  /** Working sets ticked today. */
  setsDone: number;
  /** Working sets today's plan asks for. Zero on a rest day. */
  setsPlanned: number;
  /** Her own busiest recent day, in sets. Zero when she has no history. */
  peakSets: number;
  /**
   * Active energy burned today, in kcal. The whole day's effort, whatever produced it.
   * Null when there is no watch or no permission.
   */
  activeEnergy?: number | null;
  /** Her own busiest recent day, in active kcal. */
  peakActiveEnergy?: number | null;
  /**
   * What a day she trained normally comes to, in active kcal — the median of her past
   * completed-session days. The target when energy is the currency.
   */
  typicalTrainingEnergy?: number | null;
  /**
   * Today's cardiovascular load — see `cardioLoad`. Minutes weighted by how hard the heart
   * was working through them, so twenty minutes of hills and an hour of pushing a pram do
   * not come to the same number.
   */
  cardioLoad?: number | null;
  /** Her own hardest recent day, on the same scale. */
  peakCardioLoad?: number | null;
  /** What a day she trained normally comes to. The target when load is the currency. */
  typicalTrainingLoad?: number | null;
}

export interface Strain {
  /** Today, as a percentage of her own hardest recent day. */
  score: number;
  /** What today should come to on the same scale. Null when there is nothing to aim at. */
  target: number | null;
  /** True while the scale is today's plan rather than her history. */
  provisional: boolean;
  /** Which currency the figure is in, so the screen can say so. */
  basis: 'effort' | 'energy' | 'sets';
}

/* ─────────────────────────────────────────────────────────────
 * Cardiovascular load
 * ───────────────────────────────────────────────────────────── */

/** One stretch of the day, at the average heart rate observed across it. */
export interface HeartRateBucket {
  minutes: number;
  bpm: number;
}

/** The two numbers that turn a heart rate into an intensity for this particular person. */
export interface HeartRateScale {
  restingHr: number;
  maxHr: number;
}

/**
 * Heart rate reserve: where a heart rate sits between her rest and her ceiling, 0–1.
 *
 * Reserve rather than "percent of max" because the bottom of the scale has to be her own
 * resting rate. At 120 bpm a woman who rests at 48 is working considerably harder than one
 * who rests at 75, and percent-of-max cannot see the difference. Postpartum resting rates
 * also move by ten beats or more over the first months, so a fixed floor would quietly
 * rescale her whole history.
 */
export function heartRateReserve(bpm: number, scale: HeartRateScale): number {
  const span = scale.maxHr - scale.restingHr;
  if (!(span > 0)) return 0;
  return clamp01((bpm - scale.restingHr) / span);
}

/**
 * Banister's TRIMP weighting, female coefficients.
 *
 * `minutes × HRr × 0.86 × e^(1.67 × HRr)`. The exponential is the whole point: an hour at
 * an easy heart rate and twenty minutes of hills are not the same training stimulus, and a
 * linear "minutes above a threshold" says they are. Published in Banister (1991) and used
 * since as the standard way to put a scalar on a session; the sex-specific coefficients
 * exist because the lactate response the curve was fitted to differs, and this app has one
 * population.
 *
 * The number has no units and is not comparable between people. It is only ever read here
 * as a ratio against the same person's own recent days, which is also the only reading it
 * can honestly support.
 */
export function bucketLoad(bucket: HeartRateBucket, scale: HeartRateScale): number {
  if (!(bucket.minutes > 0)) return 0;
  const reserve = heartRateReserve(bucket.bpm, scale);
  const gate = quietGate(reserve);
  if (gate <= 0) return 0;
  return gate * bucket.minutes * reserve * 0.86 * Math.exp(1.67 * reserve);
}

/**
 * The quiet end of her reserve, where a stretch of the day counts for little or nothing.
 *
 * Without this a night's sleep quietly accumulates: eight hours a few beats above resting is
 * small per five minutes and not small over ninety-six of them, and a genuine rest day would
 * never read as rest. The band is deliberately low — on a resting rate of 48 against a
 * ceiling of 185 it is fully closed under about 52 bpm and fully open above 59, which is the
 * gap between sleeping and standing up. A gentle walk with the pram runs well above it and
 * counts in full, which for a woman in her first weeks back is not a detail: that walk is
 * the training.
 *
 * A ramp rather than a cliff. A single threshold meant a bucket at 4.9% of reserve scored
 * zero and one at 5.1% scored its whole weight, and a resting rate that drifted one beat
 * could move a day's total by moving buckets across that line. Smoothstep over the band
 * makes the gate continuous, so nothing jumps.
 */
const QUIET_FROM = 0.03;
const QUIET_TO = 0.08;

function quietGate(reserve: number): number {
  if (reserve <= QUIET_FROM) return 0;
  if (reserve >= QUIET_TO) return 1;
  const t = (reserve - QUIET_FROM) / (QUIET_TO - QUIET_FROM);
  return t * t * (3 - 2 * t);
}

/**
 * A day's load, summed over however finely the heart rate was sampled.
 *
 * Buckets rather than one daily average, because averaging first destroys exactly what the
 * exponential is there to capture: a half-hour run inside a quiet day averages down to a
 * heart rate that never happened and scores as nothing.
 */
export function cardioLoad(buckets: HeartRateBucket[], scale: HeartRateScale): number {
  return buckets.reduce((sum, b) => sum + bucketLoad(b, scale), 0);
}

/**
 * The ceiling the reserve is measured against.
 *
 * Two sources, and the higher wins. Tanaka's `208 − 0.7 × age` is the better-validated age
 * prediction (the familiar `220 − age` overestimates the young and underestimates the old),
 * but any prediction is a population mean with a standard deviation around ten beats. So an
 * observed heart rate above the predicted maximum is not an outlier to be discarded — it is
 * proof the prediction was low for her, and it replaces it.
 *
 * With no date of birth recorded, which is the normal case today, the observed maximum
 * carries it alone. That is the more honest number anyway; it is just slower to settle, and
 * it can only ever read low, never high. Reading low compresses the reserve span and
 * inflates today's load — but the score divides today by her own recent peak computed on the
 * same scale, so most of that cancels rather than reaching the screen.
 */
export function maxHeartRate(input: {
  dateOfBirth: string | null;
  observedMaxHr: number | null;
  onDate: string;
}): number | null {
  const predicted = (() => {
    if (!input.dateOfBirth) return null;
    const age = yearsBetween(input.dateOfBirth, input.onDate);
    if (age === null || age < 10 || age > 100) return null;
    return 208 - 0.7 * age;
  })();

  const observed = input.observedMaxHr && input.observedMaxHr > 0 ? input.observedMaxHr : null;

  if (predicted === null && observed === null) return null;
  return Math.round(Math.max(predicted ?? 0, observed ?? 0));
}

/** Whole years between two ISO dates. Null if either will not parse. */
function yearsBetween(fromIso: string, toIso: string): number | null {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return (to.getTime() - from.getTime()) / (365.2425 * 86400000);
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Today's load, against her own recent ceiling.
 *
 * Active energy is used whenever it exists, and that is the whole point of the change: sets
 * only counted work Vela had prescribed, so an 8k run read as a rest day and a session
 * swapped for a long walk read as nothing at all. Active energy already contains the
 * session, the run and the walk, so it answers "what did she actually do today" rather than
 * "how closely did she follow instructions".
 *
 * The target moves currency with the score, because a percentage of one thing measured
 * against a percentage of another is not a comparison. In energy it is her own typical
 * training day; in sets it is what the plan asks for.
 *
 * Sets remain the fallback, not a legacy path: without a watch they are the only record of
 * effort there is, and they are better than nothing.
 */
export function strain(input: StrainInput): Strain {
  /**
   * Heart rate first, when there is any.
   *
   * Active energy answers "how much did she move", and Apple derives it largely from
   * movement and body mass — which is why it reads a brisk push of the pram and a set of
   * hill repeats as closer together than they are, and why it barely registers strength
   * work at all. Load answers "how hard was the heart working, and for how long", which is
   * the question a physiotherapist deciding next week's volume is actually asking.
   *
   * Energy stays as the second choice rather than being deleted: a phone without a watch
   * records energy from steps alone and no heart rate whatsoever, and that is a large share
   * of this population.
   */
  const load = input.cardioLoad ?? null;
  const peakLoad = input.peakCardioLoad ?? 0;

  if (load !== null && peakLoad > 0) {
    const typical = input.typicalTrainingLoad ?? null;
    return {
      score: Math.min(100, Math.round((load / peakLoad) * 100)),
      target: typical && typical > 0 ? Math.min(100, Math.round((typical / peakLoad) * 100)) : null,
      provisional: false,
      basis: 'effort',
    };
  }

  const energy = input.activeEnergy ?? null;
  const peakEnergy = input.peakActiveEnergy ?? 0;

  if (energy !== null && peakEnergy > 0) {
    const typical = input.typicalTrainingEnergy ?? null;
    return {
      score: Math.min(100, Math.round((energy / peakEnergy) * 100)),
      target: typical && typical > 0 ? Math.min(100, Math.round((typical / peakEnergy) * 100)) : null,
      provisional: false,
      basis: 'energy',
    };
  }

  // No energy history yet — or no watch. Fall back to the prescription.
  const provisional = input.peakSets <= 0;
  const scale = provisional ? Math.max(1, input.setsPlanned) : input.peakSets;

  return {
    score: Math.min(100, Math.round((input.setsDone / scale) * 100)),
    target: input.setsPlanned > 0 ? Math.min(100, Math.round((input.setsPlanned / scale) * 100)) : null,
    provisional,
    basis: 'sets',
  };
}

/** The median, for a sleep or HRV baseline. Null on an empty set. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/* ─────────────────────────────────────────────────────────────
 * Scales and baselines — the numbers everything else is relative to
 * ───────────────────────────────────────────────────────────── */

/** The value below which `p` of the sorted set falls. Null on an empty set. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[i] ?? null;
}

/**
 * Her own hardest day, as the scale strain is read against.
 *
 * Not the maximum. A raw maximum hands the whole month to one day: a single race, or a
 * hike, sets a ceiling that every ordinary day then reads as a fraction of — a typical
 * training day of 80 against a freak day of 300 is 27%, and the dial never fills. The
 * ninetieth percentile of her recent days is still "a hard day for her", and it is a day
 * she has more than one of.
 *
 * Below five days there is no distribution to take a percentile of, and the maximum is
 * the honest answer until there is.
 */
export function peakOf(values: number[]): number {
  if (values.length === 0) return 0;
  if (values.length < 5) return Math.max(...values);
  return percentile(values, 0.9) ?? 0;
}

/**
 * The ceiling heart rate, from five-minute averages.
 *
 * The second-highest, not the highest. A watch strap produces occasional single-sample
 * artifacts of 200 bpm and more, and at rest the watch samples every few minutes, so one
 * such reading can be an entire five-minute bucket's average on its own. Taking the maximum
 * hands the ceiling to that artifact for as long as it stays in the window, and every
 * reserve computed against it is compressed — a run at 150 bpm scored about forty per cent
 * lower in the worked example that found this.
 *
 * A genuine maximal effort is never a single bucket: there is a climb to it and a descent
 * from it, so it leaves at least two buckets near the top. Requiring the ceiling to be
 * reproduced once is the smallest rule that excludes the artifact and keeps the effort.
 */
export function heartRateCeiling(bucketAverages: number[]): number | null {
  const usable = bucketAverages.filter((v) => Number.isFinite(v) && v > 0);
  if (usable.length < 2) return null;
  const sorted = [...usable].sort((a, b) => b - a);
  return sorted[1] ?? null;
}

/**
 * Nights of history before "her own normal" means anything.
 *
 * A median of two nights is a baseline in name only. It made a bad first week set a floor
 * against which every ordinary night afterwards read as excellent — the wrong direction
 * for the first month back, which is exactly when a client is most likely to over-read a
 * good number.
 */
export const MIN_BASELINE_NIGHTS = 5;

/**
 * A baseline from a daily series, or null while there is not enough of one.
 *
 * Callers decide what null means: for sleep it falls back to a fixed yardstick; for the
 * cardiac signals, which have no defensible population value, it drops the signal.
 */
export function baseline(values: number[], minCount = MIN_BASELINE_NIGHTS): number | null {
  if (values.length < minCount) return null;
  return median(values);
}
