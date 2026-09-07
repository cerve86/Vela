/**
 * The HRV training decision tree, and the sentence it becomes under the gauge.
 *
 * The tree is Flatt and Esco's (Figure 2 of the handoff): a week of HRV is read against the
 * person's own normal range — the mean of the previous weeks plus or minus the smallest
 * worthwhile change, half a standard deviation — together with how much it varied day to
 * day (the coefficient of variation, HRV-CV), whether resting heart rate is unusually low,
 * what phase the training is in (an overload, a taper, or neither), and whether the block
 * is high-intensity or high-volume. Each leaf is a coaching call in the framework's own
 * words, kept here for the physiotherapist; and a stance — push, hold, ease, rest, check —
 * which, crossed with how she said she feels, gives the one sentence the client reads.
 *
 * Everything is relative to her. There is no population range for HRV worth having: it
 * varies several-fold between people and an absolute number says nothing.
 *
 * Every function is pure and date-free; the caller passes today.
 */
import type { Readiness } from './vitality';

export type HrvLevel = 'below' | 'within' | 'above';
export type Variability = 'high' | 'low';
export type TrainingPhase = 'overload' | 'taper' | 'steady';
export type BlockKind = 'intensity' | 'volume';
/** What the body is asking for, as the client sentence needs it. */
export type Stance = 'push' | 'hold' | 'ease' | 'rest' | 'check';

export type HrvOutcome =
  | 'expected_high_cv'
  | 'reduce_for_recovery'
  | 'coping_well'
  | 'ok'
  | 'saturation'
  | 'expected_intensity'
  | 'high_fatigue'
  | 'overload_block_unknown'
  | 'taper_expected'
  | 'poor_coping'
  | 'full_rest'
  | 'intensity_insufficient'
  | 'expected_volume'
  | 'intensity_insufficient_caution'
  | 'above_overload_unknown'
  | 'stabilise';

export interface DayValue {
  /** ISO calendar day. */
  day: string;
  value: number;
}

export interface HrvGuidanceInput {
  /** ISO calendar day. The week is the seven days ending today. */
  today: string;
  /** Daily HRV in ms, one value per day. */
  hrv: DayValue[];
  /** Daily resting heart rate in bpm. */
  restingHr: DayValue[];
  /**
   * Daily training load in any one unit — cardio load where the watch gives it, sets done
   * otherwise. Only the week-to-week ratio is read.
   */
  load: DayValue[];
  /** Sessions completed in the window, for what kind of block this is. */
  sessions: { day: string; discipline: string; rpe: number | null }[];
  /** The readiness she logged today, 0 depleted → 4 strong. */
  readiness: Readiness | null;
}

export interface HrvGuidance {
  hrv: HrvLevel;
  variability: Variability;
  restingLow: boolean;
  phase: TrainingPhase;
  /** Null when no session in the week says what kind of block it is. */
  block: BlockKind | null;
  outcome: HrvOutcome;
  stance: Stance;
  /** The framework's call, for the physiotherapist. */
  advice: string;
  /** The sentence under the gauge, in the client's voice. */
  note: string;
  /** The reading in a few words — "HRV below your range · variability high · overload week". */
  summary: string;
  figures: {
    /** This week's mean of ln(HRV), and the normal range it is read against. */
    weekMean: number;
    rangeLow: number;
    rangeHigh: number;
    /** This week's HRV-CV in per cent, and the level above which it counts as high. */
    cv: number;
    cvHigh: number;
    weekDays: number;
    baselineDays: number;
  };
}

/** A baseline needs this many days before a range is a range. */
export const MIN_BASELINE_DAYS = 10;
/** A week needs this many days before its mean and CV mean anything. */
export const MIN_WEEK_DAYS = 4;
const WEEK = 7;
/** The baseline is the three weeks before this one. */
const BASELINE_WEEKS = 3;

/**
 * Read the week. Null while there is not enough HRV to read it against — a range needs
 * MIN_BASELINE_DAYS of history and the week MIN_WEEK_DAYS of readings — in which case
 * the caller shows what it showed before.
 */
export function hrvGuidance(input: HrvGuidanceInput): HrvGuidance | null {
  const { today } = input;
  const weekStart = shiftDay(today, -(WEEK - 1));
  const baselineStart = shiftDay(today, -(WEEK * (BASELINE_WEEKS + 1) - 1));
  const inWeek = (d: string) => d >= weekStart && d <= today;
  const inBaseline = (d: string) => d >= baselineStart && d < weekStart;

  // HRV is read as ln(HRV): it is log-normally distributed, and the log stabilises the
  // variance so one high morning does not own the week.
  const lnHrv = input.hrv
    .filter((v) => v.value > 0)
    .map((v) => ({ day: v.day, value: Math.log(v.value) }));
  const week = lnHrv.filter((v) => inWeek(v.day)).map((v) => v.value);
  const base = lnHrv.filter((v) => inBaseline(v.day)).map((v) => v.value);
  if (week.length < MIN_WEEK_DAYS || base.length < MIN_BASELINE_DAYS) return null;

  const weekMean = mean(week);
  const baseMean = mean(base);
  const swc = 0.5 * sd(base);
  const rangeLow = baseMean - swc;
  const rangeHigh = baseMean + swc;
  const hrv: HrvLevel = weekMean < rangeLow ? 'below' : weekMean > rangeHigh ? 'above' : 'within';

  // Day-to-day variability: this week's CV against the CVs of the baseline weeks. With
  // only three of those, half their standard deviation can be next to nothing, so the
  // margin is never less than a fifth of their mean — a week has to be clearly more
  // scattered than usual to count as high.
  const cv = coefficientOfVariation(week);
  const baseWeekCvs: number[] = [];
  for (let w = 1; w <= BASELINE_WEEKS; w++) {
    const start = shiftDay(weekStart, -WEEK * w);
    const end = shiftDay(weekStart, -WEEK * (w - 1) - 1);
    const days = lnHrv.filter((v) => v.day >= start && v.day <= end).map((v) => v.value);
    if (days.length >= MIN_WEEK_DAYS) baseWeekCvs.push(coefficientOfVariation(days));
  }
  const cvHigh =
    baseWeekCvs.length >= 2
      ? mean(baseWeekCvs) + Math.max(0.5 * sd(baseWeekCvs), 0.2 * mean(baseWeekCvs))
      : coefficientOfVariation(base) * 1.2;
  const variability: Variability = cv > cvHigh ? 'high' : 'low';

  // Resting heart rate lower than her normal range: the saturation check. Read the same
  // way, with the margin never under one beat.
  const restWeek = input.restingHr.filter((v) => inWeek(v.day)).map((v) => v.value);
  const restBase = input.restingHr.filter((v) => inBaseline(v.day)).map((v) => v.value);
  const restingLow =
    restWeek.length >= MIN_WEEK_DAYS &&
    restBase.length >= MIN_BASELINE_DAYS &&
    mean(restWeek) < mean(restBase) - Math.max(1, 0.5 * sd(restBase));

  const phase = trainingPhase(input.load, weekStart, baselineStart, today);
  const block = blockKind(input.sessions.filter((s) => inWeek(s.day)));

  const outcome = leaf(hrv, variability, restingLow, phase, block);
  const stance = STANCE[outcome];
  return {
    hrv,
    variability,
    restingLow,
    phase,
    block,
    outcome,
    stance,
    advice: ADVICE[outcome],
    note: noteFor(stance, input.readiness),
    summary: summaryFor(hrv, variability, phase, restingLow),
    figures: {
      weekMean,
      rangeLow,
      rangeHigh,
      cv,
      cvHigh,
      weekDays: week.length,
      baselineDays: base.length,
    },
  };
}

/**
 * The tree itself, one leaf per path. The six questions on the left of the figure are the
 * six combinations of level and variability; the rest of the path is phase, block and
 * resting heart rate.
 */
function leaf(
  hrv: HrvLevel,
  variability: Variability,
  restingLow: boolean,
  phase: TrainingPhase,
  block: BlockKind | null,
): HrvOutcome {
  if (hrv === 'within') {
    if (variability === 'high')
      return phase === 'overload' ? 'expected_high_cv' : 'reduce_for_recovery';
    return phase === 'overload' ? 'coping_well' : 'ok';
  }
  if (hrv === 'below') {
    if (restingLow) return 'saturation';
    if (variability === 'high') return 'full_rest';
    if (phase === 'overload') {
      if (block === 'intensity') return 'expected_intensity';
      if (block === 'volume') return 'high_fatigue';
      return 'overload_block_unknown';
    }
    return phase === 'taper' ? 'taper_expected' : 'poor_coping';
  }
  // above
  if (phase === 'overload') {
    if (block === 'volume') return 'expected_volume';
    if (block === 'intensity') {
      return variability === 'high' ? 'intensity_insufficient_caution' : 'intensity_insufficient';
    }
    return 'above_overload_unknown';
  }
  return variability === 'high' ? 'stabilise' : 'ok';
}

/** The framework's own words, for the physiotherapist. */
const ADVICE: Record<HrvOutcome, string> = {
  expected_high_cv:
    'Expected response in an overload period. Continue to assess over the next few weeks; HRV-CV should decrease.',
  reduce_for_recovery:
    'High day-to-day variability outside an overload period. Consider reducing training to enhance recovery.',
  coping_well:
    'Coping well with training. Consider increasing training load to enhance adaptation.',
  ok: 'OK. No changes required.',
  saturation:
    'Possible HRV saturation: HRV below range with a low resting heart rate. Check performance and wellness metrics.',
  expected_intensity:
    'Expected response to a high-intensity block. Continue to assess over the next few weeks.',
  high_fatigue:
    'High fatigue and negative adaptation to a high-volume block. Consider a rest period.',
  overload_block_unknown:
    'HRV below range in an overload period: expected for a high-intensity block, a sign of fatigue in a high-volume one. Check which this is.',
  taper_expected: 'No changes. HRV reductions are expected during a taper or reduced training.',
  poor_coping: 'Poor coping and negative adaptation. Decrease training intensity or load.',
  full_rest: 'Full rest or a severe reduction in training intensity and load (recovery period).',
  intensity_insufficient:
    'Unexpected for a high-intensity block. The high-intensity load may not be sufficient.',
  expected_volume:
    'Expected response to a high-volume block. Continue to assess over the next few weeks; HRV-CV should decrease.',
  intensity_insufficient_caution:
    'Unexpected for a high-intensity block: the load may not be sufficient. Be cautious because of the high HRV-CV.',
  above_overload_unknown:
    'HRV above range in an overload period: expected for a high-volume block, possibly insufficient load in a high-intensity one. Check which this is.',
  stabilise:
    'Add recovery and behavioural changes (sleep, slow-paced breathing, ice bath) to stabilise day-to-day variability.',
};

const STANCE: Record<HrvOutcome, Stance> = {
  expected_high_cv: 'hold',
  reduce_for_recovery: 'ease',
  coping_well: 'push',
  ok: 'hold',
  saturation: 'check',
  expected_intensity: 'hold',
  high_fatigue: 'rest',
  overload_block_unknown: 'ease',
  taper_expected: 'hold',
  poor_coping: 'ease',
  full_rest: 'rest',
  intensity_insufficient: 'push',
  expected_volume: 'hold',
  intensity_insufficient_caution: 'hold',
  above_overload_unknown: 'hold',
  stabilise: 'ease',
};

/**
 * The sentence under the gauge: what the body is asking for, crossed with what she said.
 *
 * Her read can only pull a push back to steady, or make an ease firmer; it never turns a
 * rest into a push. Warm and flat, no exclamation marks, and it never tells her to skip
 * the plan — "very light, and let your physio know" is as far as it goes, because the
 * call is the physiotherapist's. With no read yet, the middle sentence.
 */
function noteFor(stance: Stance, readiness: Readiness | null): string {
  const feel =
    readiness === null ? 'mid' : readiness <= 1 ? 'low' : readiness >= 3 ? 'high' : 'mid';
  switch (stance) {
    case 'push':
      if (feel === 'high') return "Recovered, and you feel it. There's room to add a little today.";
      if (feel === 'low')
        return "Your body says it's coping well; you don't feel it. Go by the feeling and keep today steady.";
      return "Your body is coping well with training. Steady is fine, and there's room if you want it.";
    case 'hold':
      if (feel === 'high')
        return 'Tracking as expected for this stretch of training. Train to plan.';
      if (feel === 'low')
        return "The numbers are holding, the feeling isn't. Train to plan, but trim it if it stays heavy.";
      return 'Tracking as expected. Train to plan, and stay honest with yourself.';
    case 'ease':
      if (feel === 'high')
        return "You feel good, but your body is still catching up. Keep today lighter than you'd like.";
      if (feel === 'low')
        return 'Body and feeling agree: back off today. Lighter, shorter, or a walk.';
      return 'Your body is asking for a little less this week. Lighter today, and see how tomorrow reads.';
    case 'rest':
      if (feel === 'high')
        return 'Real fatigue underneath, even if you feel fine. Keep today very light and let your physio know.';
      if (feel === 'low')
        return 'Your body is asking for a proper rest, and you feel it. Very light today, and let your physio know.';
      return 'Your body is asking for a proper rest. Keep today very light and let your physio know.';
    case 'check':
      if (feel === 'low')
        return "HRV and resting heart rate are both unusually low, and you're not feeling it. Worth telling your physio.";
      return "HRV and resting heart rate are both unusually low. If you're performing and feeling fine, it's fine; if not, say so.";
  }
}

function summaryFor(
  hrv: HrvLevel,
  variability: Variability,
  phase: TrainingPhase,
  restingLow: boolean,
): string {
  const level =
    hrv === 'within'
      ? 'HRV in your range'
      : hrv === 'below'
        ? 'HRV below your range'
        : 'HRV above your range';
  const cv = variability === 'high' ? 'variability high' : 'variability steady';
  const week =
    phase === 'overload' ? 'overload week' : phase === 'taper' ? 'lighter week' : 'steady week';
  return [level, cv, week, ...(restingLow ? ['resting HR low'] : [])].join(' · ');
}

/**
 * Overload, taper or neither, from load alone: this week's total against the mean of the
 * baseline weeks. A tenth more is an overload, a quarter less a taper — the smallest
 * changes a programme would call by those names. A first week with nothing before it is
 * an overload, which is what a new stimulus is.
 */
export function trainingPhase(
  load: DayValue[],
  weekStart: string,
  baselineStart: string,
  today: string,
): TrainingPhase {
  const week = load
    .filter((v) => v.day >= weekStart && v.day <= today)
    .reduce((n, v) => n + v.value, 0);
  const weeks: number[] = [];
  for (let w = 1; w <= BASELINE_WEEKS; w++) {
    const start = shiftDay(weekStart, -WEEK * w);
    const end = shiftDay(weekStart, -WEEK * (w - 1) - 1);
    if (start < baselineStart) break;
    weeks.push(load.filter((v) => v.day >= start && v.day <= end).reduce((n, v) => n + v.value, 0));
  }
  const usual = weeks.length ? mean(weeks) : 0;
  if (usual <= 0) return week > 0 ? 'overload' : 'steady';
  const ratio = week / usual;
  if (ratio >= 1.1) return 'overload';
  if (ratio <= 0.75) return 'taper';
  return 'steady';
}

/**
 * High-intensity or high-volume, from the week's sessions: by RPE where she gave one
 * (seven and up is intense, five and a half or under is not), otherwise by what the
 * sessions were — a strength week is an intensity block, a running or mobility week a
 * volume one. Null with nothing to go on.
 */
export function blockKind(
  sessions: { discipline: string; rpe: number | null }[],
): BlockKind | null {
  if (sessions.length === 0) return null;
  const rpes = sessions.map((s) => s.rpe).filter((r): r is number => r !== null && r > 0);
  if (rpes.length >= 2) {
    const m = mean(rpes);
    if (m >= 7) return 'intensity';
    if (m <= 5.5) return 'volume';
  }
  const strength = sessions.filter((s) => s.discipline === 'strength').length;
  return strength * 2 >= sessions.length ? 'intensity' : 'volume';
}

function mean(xs: number[]): number {
  return xs.reduce((n, x) => n + x, 0) / xs.length;
}

function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((n, x) => n + (x - m) ** 2, 0) / (xs.length - 1));
}

/** In per cent. */
function coefficientOfVariation(xs: number[]): number {
  const m = mean(xs);
  return m === 0 ? 0 : (sd(xs) / m) * 100;
}

/** An ISO day moved by a number of days, in UTC so no clock is read. */
function shiftDay(day: string, by: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + by);
  return new Date(t).toISOString().slice(0, 10);
}
