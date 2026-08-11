/**
 * Return-to-running readiness screen.
 *
 * Implements the load/impact and strength battery from Goom, Donnelly & Brockwell,
 * *Returning to running postnatal — guidelines for medical, health and fitness
 * professionals managing this population* (2019).
 *
 * Two things from the guideline shape the logic here and are easy to get wrong:
 *
 *  1. The load and impact tests are gated on SYMPTOMS, not on effort. Each must be
 *     completed "without pain, heaviness, dragging or incontinence". Managing to do
 *     ten hops while leaking is a fail, not a pass.
 *
 *  2. Strength weakness is explicitly NOT a barrier to running. The guideline says
 *     weakness "should not be considered a barrier for return to running but instead
 *     identify where strength work can be directed". So strength results inform the
 *     programme; they never block it.
 *
 * The screen is a clinical aid for the physiotherapist. It does not diagnose, and it
 * never overrides the coach's judgement — hence `verdict` is advisory wording, not a
 * clearance.
 */

export type SymptomFlag = 'none' | 'pain' | 'heaviness' | 'dragging' | 'leaking';

export interface LoadTestSpec {
  id: string;
  name: string;
  /** Prescribed dose, shown verbatim to the client and coach. */
  dose: string;
  cue: string;
}

/** Load and impact management assessment — the impact-readiness gate. */
export const LOAD_TESTS: LoadTestSpec[] = [
  { id: 'walk_30', name: 'Walking', dose: '30 minutes', cue: 'Brisk, continuous, on the flat.' },
  { id: 'sl_balance', name: 'Single-leg balance', dose: '10 seconds each side', cue: 'Hands off support, pelvis level.' },
  { id: 'sl_squat', name: 'Single-leg squat', dose: '10 reps each side', cue: 'Knee tracks over the foot, no pelvic drop.' },
  { id: 'jog_spot', name: 'Jog on the spot', dose: '1 minute', cue: 'Light and springy, breathing easy.' },
  { id: 'bounds', name: 'Forward bounds', dose: '10 reps', cue: 'Land softly, absorb through the hip.' },
  { id: 'hop', name: 'Hop in place', dose: '10 reps each leg', cue: 'Quiet landings.' },
  { id: 'running_man', name: 'Single-leg “running man”', dose: '10 reps each side', cue: 'Opposite arm and hip drive, knee bent.' },
];

export interface StrengthTestSpec {
  id: string;
  name: string;
  /** The guideline counts reps to fatigue and aims for 20. */
  target: number;
  cue: string;
}

export const STRENGTH_TESTS: StrengthTestSpec[] = [
  { id: 'sl_calf', name: 'Single-leg calf raise', target: 20, cue: 'Full height, controlled lower.' },
  { id: 'sl_bridge', name: 'Single-leg bridge', target: 20, cue: 'Hips level throughout.' },
  { id: 'sl_sit_stand', name: 'Single-leg sit to stand', target: 20, cue: 'No hands, no momentum.' },
  { id: 'side_abduction', name: 'Side-lying hip abduction', target: 20, cue: 'Leg slightly behind the hip line.' },
];

export interface LoadTestResult {
  testId: string;
  completed: boolean;
  /** Any symptom other than 'none' fails the test regardless of completion. */
  symptom: SymptomFlag;
  note?: string;
}

export interface StrengthTestResult {
  testId: string;
  /** Reps achieved to fatigue, per side where relevant. */
  reps: number;
  symptom: SymptomFlag;
}

export interface ReadinessScreen {
  id: string;
  clientId: string;
  performedOn: string;
  weeksPostpartum: number;
  loadResults: LoadTestResult[];
  strengthResults: StrengthTestResult[];
  coachNotes: string | null;
}

export type ReadinessVerdict = 'not_yet' | 'address_first' | 'ready_to_progress';

export interface ReadinessOutcome {
  verdict: ReadinessVerdict;
  headline: string;
  detail: string;
  loadPassed: number;
  loadTotal: number;
  /** Tests failed on symptoms — the clinically important list. */
  symptomatic: { testId: string; symptom: SymptomFlag }[];
  /** Below the 20-rep target. Directs strength work; never blocks running. */
  strengthGaps: { testId: string; reps: number; target: number }[];
  /** The guideline's own timing caveat. */
  tooEarly: boolean;
}

/**
 * The guideline puts return to running at roughly 12 weeks postpartum at the earliest,
 * with 3–6 months being typical. Before 12 weeks we surface that regardless of how well
 * the battery went — passing the tests early does not undo tissue healing time.
 */
export const EARLIEST_RETURN_WEEKS = 12;

export function evaluateReadiness(screen: ReadinessScreen): ReadinessOutcome {
  const symptomatic = screen.loadResults
    .filter((r) => r.symptom !== 'none')
    .map((r) => ({ testId: r.testId, symptom: r.symptom }));

  const loadPassed = screen.loadResults.filter((r) => r.completed && r.symptom === 'none').length;
  const loadTotal = LOAD_TESTS.length;

  const strengthGaps = screen.strengthResults
    .map((r) => {
      const spec = STRENGTH_TESTS.find((s) => s.id === r.testId);
      return { testId: r.testId, reps: r.reps, target: spec?.target ?? 20 };
    })
    .filter((r) => r.reps < r.target);

  const tooEarly = screen.weeksPostpartum < EARLIEST_RETURN_WEEKS;
  const allLoadPassed = loadPassed === loadTotal && symptomatic.length === 0;

  if (symptomatic.length > 0) {
    return {
      verdict: 'address_first',
      headline: 'Symptoms to address before impact',
      detail:
        'One or more tests produced pain, heaviness, dragging or leaking. The guideline treats any of these as a fail regardless of whether the movement was completed. Worth a pelvic health review before adding impact.',
      loadPassed,
      loadTotal,
      symptomatic,
      strengthGaps,
      tooEarly,
    };
  }

  if (!allLoadPassed) {
    return {
      verdict: 'not_yet',
      headline: 'Not through the battery yet',
      detail: `${loadPassed} of ${loadTotal} load and impact tests completed symptom-free. Keep building; retest when the remaining tests feel comfortable.`,
      loadPassed,
      loadTotal,
      symptomatic,
      strengthGaps,
      tooEarly,
    };
  }

  if (tooEarly) {
    return {
      verdict: 'not_yet',
      headline: 'Battery clear, but early',
      detail: `Every test was symptom-free, which is a good sign. At ${screen.weeksPostpartum} weeks postpartum the guideline still suggests waiting closer to ${EARLIEST_RETURN_WEEKS} weeks before running, since tissue healing takes time the tests cannot shortcut.`,
      loadPassed,
      loadTotal,
      symptomatic,
      strengthGaps,
      tooEarly,
    };
  }

  return {
    verdict: 'ready_to_progress',
    headline: 'Clear to begin a graded return',
    detail:
      strengthGaps.length > 0
        ? `All load and impact tests were symptom-free. ${strengthGaps.length} strength test${strengthGaps.length === 1 ? ' is' : 's are'} below the 20-rep target — that directs where strength work goes, and is not a reason to hold running back.`
        : 'All load and impact tests were symptom-free and strength targets were met. Begin a graded walk-run progression.',
    loadPassed,
    loadTotal,
    symptomatic,
    strengthGaps,
    tooEarly,
  };
}

export const SYMPTOM_LABEL: Record<SymptomFlag, string> = {
  none: 'No symptoms',
  pain: 'Pain',
  heaviness: 'Heaviness',
  dragging: 'Dragging',
  leaking: 'Leaking',
};
