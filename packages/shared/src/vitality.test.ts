import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MIN_BASELINE_NIGHTS,
  baseline,
  bucketLoad,
  cardioLoad,
  heartRateCeiling,
  heartRateReserve,
  maxHeartRate,
  peakOf,
  percentile,
  recovery,
  strain,
  type HeartRateScale,
  type RecoveryInput,
} from './vitality.ts';

/**
 * The load maths, which nothing else can check.
 *
 * Recovery and adherence can be eyeballed against the screen; a TRIMP cannot. It is an
 * exponential weighting of a ratio of two personal numbers, it feeds the figure a
 * physiotherapist uses to decide next week's volume, and it is wrong in ways that look
 * entirely plausible — a sign error or a swapped resting rate still produces a tidy
 * percentage. So the properties that matter are asserted rather than assumed.
 */

const SCALE: HeartRateScale = { restingHr: 50, maxHr: 190 };

describe('heartRateReserve', () => {
  it('is 0 at rest and 1 at the ceiling', () => {
    assert.equal(heartRateReserve(50, SCALE), 0);
    assert.equal(heartRateReserve(190, SCALE), 1);
  });

  it('clamps rather than going negative or above one', () => {
    assert.equal(heartRateReserve(40, SCALE), 0);
    assert.equal(heartRateReserve(210, SCALE), 1);
  });

  it('measures the distance travelled from rest, not the absolute rate', () => {
    const fromLowRest = heartRateReserve(120, { restingHr: 45, maxHr: 190 });
    const fromHighRest = heartRateReserve(120, { restingHr: 75, maxHr: 190 });

    // The same 120 bpm is a longer climb from a resting rate of 45 (75 beats of a
    // 145-beat range) than from 75 (45 beats of 115), so it scores higher. This is the
    // Karvonen reading and it is easy to get backwards — percent-of-maximum would call
    // both of these identical, which is the reason reserve is used at all.
    assert.ok(fromLowRest > fromHighRest, `expected ${fromLowRest} > ${fromHighRest}`);
  });

  it('follows her resting rate as it settles over the months', () => {
    // Postpartum resting rates fall substantially over the first months. The same easy jog
    // must not score harder in March than it did in January just because her floor moved.
    const early = heartRateReserve(130, { restingHr: 72, maxHr: 190 });
    const later = heartRateReserve(130, { restingHr: 58, maxHr: 190 });
    assert.ok(later > early);
  });

  it('survives a nonsense scale without dividing by zero', () => {
    assert.equal(heartRateReserve(120, { restingHr: 190, maxHr: 190 }), 0);
    assert.equal(heartRateReserve(120, { restingHr: 200, maxHr: 190 }), 0);
  });
});

describe('bucketLoad', () => {
  it('ignores sleeping and sitting', () => {
    // A few beats above resting for five minutes must contribute nothing, or a night's
    // sleep silently becomes a training session.
    assert.equal(bucketLoad({ minutes: 5, bpm: 53 }, SCALE), 0);
    assert.equal(bucketLoad({ minutes: 5, bpm: 50 }, SCALE), 0);
  });

  it('counts a gentle walk', () => {
    // The deadband must not swallow the thing that is actually her training early on.
    assert.ok(bucketLoad({ minutes: 5, bpm: 95 }, SCALE) > 0);
  });

  it('rises faster than linearly with intensity', () => {
    const easy = bucketLoad({ minutes: 10, bpm: 110 }, SCALE);
    const hard = bucketLoad({ minutes: 10, bpm: 170 }, SCALE);
    const easyReserve = heartRateReserve(110, SCALE);
    const hardReserve = heartRateReserve(170, SCALE);

    // Twice the reserve must buy more than twice the load, otherwise the exponential is
    // not doing its job and hill repeats score like a stroll of the same length.
    assert.ok(hard / easy > hardReserve / easyReserve, `${hard / easy} vs ${hardReserve / easyReserve}`);
  });

  it('scales linearly with time at a fixed intensity', () => {
    const ten = bucketLoad({ minutes: 10, bpm: 150 }, SCALE);
    const twenty = bucketLoad({ minutes: 20, bpm: 150 }, SCALE);
    assert.ok(Math.abs(twenty - ten * 2) < 1e-9);
  });

  it('is zero for a bucket covering no time', () => {
    assert.equal(bucketLoad({ minutes: 0, bpm: 170 }, SCALE), 0);
  });
});

describe('cardioLoad', () => {
  it('does not average the day flat', () => {
    // Half an hour of running inside an otherwise quiet day. Averaging first would give a
    // heart rate she never held and score the run as nothing — this is the bug the
    // bucketing exists to prevent.
    const quiet = Array.from({ length: 90 }, () => ({ minutes: 5, bpm: 62 }));
    const run = Array.from({ length: 6 }, () => ({ minutes: 5, bpm: 165 }));

    const withRun = cardioLoad([...quiet, ...run], SCALE);
    const withoutRun = cardioLoad(quiet, SCALE);

    assert.ok(withRun > withoutRun * 2, `${withRun} vs ${withoutRun}`);
  });

  it('is zero for a day spent at rest', () => {
    assert.equal(cardioLoad(Array.from({ length: 288 }, () => ({ minutes: 5, bpm: 51 })), SCALE), 0);
  });

  it('is zero for a day with no readings at all', () => {
    assert.equal(cardioLoad([], SCALE), 0);
  });
});

describe('maxHeartRate', () => {
  it('uses Tanaka when a date of birth is known', () => {
    // 208 − 0.7 × 34 = 184.2
    assert.equal(
      maxHeartRate({ dateOfBirth: '1992-01-01', observedMaxHr: null, onDate: '2026-01-01' }),
      184,
    );
  });

  it('lets an observed maximum beat a low prediction', () => {
    // She actually hit 191. The prediction was a population mean and it was wrong for her.
    assert.equal(
      maxHeartRate({ dateOfBirth: '1992-01-01', observedMaxHr: 191, onDate: '2026-01-01' }),
      191,
    );
  });

  it('falls back to observation alone, which is the normal case', () => {
    assert.equal(maxHeartRate({ dateOfBirth: null, observedMaxHr: 178, onDate: '2026-01-01' }), 178);
  });

  it('returns null when there is nothing to go on', () => {
    assert.equal(maxHeartRate({ dateOfBirth: null, observedMaxHr: null, onDate: '2026-01-01' }), null);
    assert.equal(maxHeartRate({ dateOfBirth: 'not-a-date', observedMaxHr: null, onDate: '2026-01-01' }), null);
  });
});

describe('strain', () => {
  const noSession = { setsDone: 0, setsPlanned: 0, peakSets: 0 };

  it('prefers heart rate over energy when both are present', () => {
    const result = strain({
      ...noSession,
      activeEnergy: 100,
      peakActiveEnergy: 1000, // would give 10%
      cardioLoad: 60,
      peakCardioLoad: 100, // gives 60%
    });
    assert.equal(result.basis, 'effort');
    assert.equal(result.score, 60);
  });

  it('falls back to energy when there is no heart rate', () => {
    const result = strain({ ...noSession, activeEnergy: 400, peakActiveEnergy: 800 });
    assert.equal(result.basis, 'energy');
    assert.equal(result.score, 50);
  });

  it('falls back to sets when there is neither', () => {
    const result = strain({ setsDone: 3, setsPlanned: 9, peakSets: 12 });
    assert.equal(result.basis, 'sets');
    assert.equal(result.score, 25);
  });

  it('does not use load without a peak to scale it against', () => {
    // Her first day with a watch. One number and nothing to compare it to is not a score.
    const result = strain({ ...noSession, cardioLoad: 80, peakCardioLoad: 0, activeEnergy: 300, peakActiveEnergy: 600 });
    assert.equal(result.basis, 'energy');
  });

  it('reports a real day of effort even with no session scheduled', () => {
    // The bug that started this: a Saturday run read as a rest day because nothing had been
    // prescribed for it.
    const result = strain({ ...noSession, cardioLoad: 90, peakCardioLoad: 100 });
    assert.equal(result.score, 90);
  });

  it('never exceeds 100 when today is her hardest day yet', () => {
    const result = strain({ ...noSession, cardioLoad: 250, peakCardioLoad: 100 });
    assert.equal(result.score, 100);
  });
});

/**
 * A good night, measured. The starting point for the buffer tests: everything at or near
 * her own baseline, so the score is driven by the body and readiness has somewhere to move
 * it from.
 */
const GOOD_NIGHT: RecoveryInput = {
  sleepMinutes: 450,
  sleepBaselineMinutes: 450,
  restorativeMinutes: 140,
  restorativeBaselineMinutes: 140,
  awakeMinutes: 25,
  hrvMs: 48,
  hrvBaselineMs: 48,
  restingHr: 55,
  restingHrBaseline: 55,
  respiratoryRate: 14,
  respiratoryRateBaseline: 14,
  readiness: null,
};

describe('recovery — how you feel is a buffer, not an input', () => {
  it('moves the score by at most ten points across the whole scale', () => {
    const base = recovery({ ...GOOD_NIGHT, readiness: null }).score!;
    const depleted = recovery({ ...GOOD_NIGHT, readiness: 0 }).score!;
    const strong = recovery({ ...GOOD_NIGHT, readiness: 4 }).score!;

    assert.ok(Math.abs(depleted - base) <= 10, `depleted moved ${Math.abs(depleted - base)}`);
    assert.ok(Math.abs(strong - base) <= 10, `strong moved ${Math.abs(strong - base)}`);
    // And it does move — a buffer of zero would be no buffer at all.
    assert.ok(strong > depleted);
  });

  it('cannot turn a bad night into a good score', () => {
    // This is the guarantee that matters. Two hours of sleep, HRV on the floor, resting
    // rate ten per cent up — saying "strong" must not rescue it.
    const badNight: RecoveryInput = {
      ...GOOD_NIGHT,
      sleepMinutes: 150,
      restorativeMinutes: 30,
      awakeMinutes: 90,
      hrvMs: 26,
      restingHr: 62,
      respiratoryRate: 16,
    };

    const claimingStrong = recovery({ ...badNight, readiness: 4 });
    assert.ok(claimingStrong.score! < 60, `scored ${claimingStrong.score}`);
    assert.notEqual(claimingStrong.band, 'strong');
  });

  it('cannot turn a good night into a bad score either', () => {
    // The buffer is symmetric. A rough morning after a measurably good night should shade
    // the number, not collapse it.
    const claimingDepleted = recovery({ ...GOOD_NIGHT, readiness: 0 });
    assert.ok(claimingDepleted.score! > 60, `scored ${claimingDepleted.score}`);
  });

  it('stays inside 0–100 when the nudge runs off the end', () => {
    const floor = recovery({
      ...GOOD_NIGHT,
      sleepMinutes: 60,
      restorativeMinutes: 5,
      awakeMinutes: 200,
      hrvMs: 12,
      restingHr: 80,
      respiratoryRate: 20,
      readiness: 0,
    });
    assert.ok(floor.score! >= 0 && floor.score! <= 100, `scored ${floor.score}`);

    const ceiling = recovery({
      ...GOOD_NIGHT,
      sleepMinutes: 620,
      restorativeMinutes: 240,
      awakeMinutes: 0,
      hrvMs: 80,
      restingHr: 46,
      respiratoryRate: 12,
      readiness: 4,
    });
    assert.ok(ceiling.score! <= 100, `scored ${ceiling.score}`);
  });
});

describe('recovery — what it reads', () => {
  it('marks a score built from feeling alone as estimated', () => {
    const feelOnly = recovery({
      sleepMinutes: null,
      sleepBaselineMinutes: null,
      hrvMs: null,
      hrvBaselineMs: null,
      readiness: 3,
    });
    assert.equal(feelOnly.estimated, true);
    assert.deepEqual(feelOnly.sources, ['how you feel']);
    // The no-watch path is still worth a number — a blank dial helps nobody.
    assert.ok(feelOnly.score! > 0);
  });

  it('is not estimated once anything at all was measured', () => {
    const measured = recovery({ ...GOOD_NIGHT, readiness: 2 });
    assert.equal(measured.estimated, false);
  });

  it('has nothing to say when there is neither a reading nor an answer', () => {
    const nothing = recovery({
      sleepMinutes: null,
      sleepBaselineMinutes: null,
      hrvMs: null,
      hrvBaselineMs: null,
      readiness: null,
    });
    assert.equal(nothing.score, null);
  });

  it('penalises a resting heart rate above her own baseline', () => {
    const normal = recovery({ ...GOOD_NIGHT, readiness: 2 }).score!;
    const raised = recovery({ ...GOOD_NIGHT, restingHr: 62, readiness: 2 }).score!;
    assert.ok(raised < normal, `${raised} should be below ${normal}`);
  });

  it('names a raised resting rate rather than burying it in a general verdict', () => {
    const ill = recovery({
      ...GOOD_NIGHT,
      restingHr: 66,
      hrvMs: 30,
      sleepMinutes: 330,
      readiness: 1,
    });
    assert.match(ill.note, /resting heart rate/i);
  });

  it('penalises a broken night that ran the full length', () => {
    // Same hours asleep, two hours of it awake in pieces. Duration alone cannot see this.
    const settled = recovery({ ...GOOD_NIGHT, awakeMinutes: 15, readiness: 2 }).score!;
    const broken = recovery({ ...GOOD_NIGHT, awakeMinutes: 120, readiness: 2 }).score!;
    assert.ok(broken < settled, `${broken} should be below ${settled}`);
  });

  it('penalises a raised breathing rate', () => {
    const normal = recovery({ ...GOOD_NIGHT, readiness: 2 }).score!;
    const raised = recovery({ ...GOOD_NIGHT, respiratoryRate: 16.5, readiness: 2 }).score!;
    assert.ok(raised < normal, `${raised} should be below ${normal}`);
  });

  it('does not punish a watch that reports less', () => {
    // Only sleep duration, no stages, no HRV, no vitals. Renormalising over what is present
    // is what stops a missing signal reading as a bad one.
    const sparse = recovery({
      sleepMinutes: 450,
      sleepBaselineMinutes: 450,
      hrvMs: null,
      hrvBaselineMs: null,
      readiness: 2,
    });
    assert.ok(sparse.score! > 70, `scored ${sparse.score}`);
    assert.equal(sparse.estimated, false);
  });

  it('ignores a signal that has no baseline to be read against', () => {
    // Her first week. A resting rate with nothing to compare it to must drop out rather
    // than be scored against a guess.
    const noBaseline = recovery({ ...GOOD_NIGHT, restingHrBaseline: null, readiness: 2 });
    assert.ok(!noBaseline.sources.includes('resting heart rate'));
  });
});

describe('heartRateCeiling — one bad sample must not own the month', () => {
  it('ignores an isolated spike', () => {
    // A month of ordinary buckets, one hard run that left three buckets near the top, and
    // one strap artifact at 212 in a bucket of its own.
    const ordinary = Array.from({ length: 500 }, (_, i) => 60 + (i % 40));
    const run = [168, 174, 171];
    const artifact = [212];
    assert.equal(heartRateCeiling([...ordinary, ...run, ...artifact]), 174);
  });

  it('keeps a genuine maximal effort, which always leaves more than one bucket', () => {
    const ceiling = heartRateCeiling([70, 80, 150, 178, 181, 176]);
    assert.equal(ceiling, 178);
  });

  it('will not name a ceiling from a single reading', () => {
    assert.equal(heartRateCeiling([180]), null);
    assert.equal(heartRateCeiling([]), null);
  });

  it('drops readings that cannot be heart rates', () => {
    assert.equal(heartRateCeiling([0, -5, Number.NaN, 150, 160]), 150);
  });
});

describe('peakOf — her hardest day, not her one freak day', () => {
  it('uses the maximum while there are too few days for a distribution', () => {
    assert.equal(peakOf([40, 300, 55, 60]), 300);
  });

  it('takes a high percentile once there are enough days', () => {
    // Twenty-seven ordinary days and one race. The race must not become the scale.
    const days = [...Array.from({ length: 27 }, (_, i) => 50 + i), 300];
    const peak = peakOf(days);
    assert.ok(peak < 100, `peak ${peak} still dominated by the outlier`);
    assert.ok(peak >= 70, `peak ${peak} is no longer a hard day`);
  });

  it('is zero with no history', () => {
    assert.equal(peakOf([]), 0);
  });
});

describe('percentile', () => {
  it('is null on nothing and the only value on one', () => {
    assert.equal(percentile([], 0.5), null);
    assert.equal(percentile([7], 0.05), 7);
  });

  it('is monotone in p', () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    assert.ok(percentile(v, 0.05)! <= percentile(v, 0.5)!);
    assert.ok(percentile(v, 0.5)! <= percentile(v, 0.9)!);
  });
});

describe('baseline — her normal needs enough nights to exist', () => {
  it('refuses to call a couple of nights a baseline', () => {
    assert.equal(baseline([300, 310]), null);
    assert.equal(baseline(Array.from({ length: MIN_BASELINE_NIGHTS - 1 }, () => 450)), null);
  });

  it('is the median once there are enough', () => {
    assert.equal(baseline([400, 500, 450, 430, 470]), 450);
  });

  it('accepts a caller-chosen threshold', () => {
    assert.equal(baseline([80, 90, 100], 3), 90);
  });
});

describe('bucketLoad — the quiet gate is a ramp, not a cliff', () => {
  const scale: HeartRateScale = { restingHr: 50, maxHr: 150 }; // span 100 → reserve = (bpm-50)/100

  it('is closed below the band and fully open above it', () => {
    assert.equal(bucketLoad({ minutes: 5, bpm: 52 }, scale), 0); // reserve 0.02
    const open = bucketLoad({ minutes: 5, bpm: 59 }, scale); // reserve 0.09
    const raw = 5 * 0.09 * 0.86 * Math.exp(1.67 * 0.09);
    assert.ok(Math.abs(open - raw) < 1e-9);
  });

  it('is continuous and increasing across the band', () => {
    let prev = 0;
    for (let bpm = 52; bpm <= 59; bpm += 0.25) {
      const v = bucketLoad({ minutes: 5, bpm }, scale);
      assert.ok(v >= prev, `dropped at ${bpm} bpm`);
      // No jump anywhere near the size the old single threshold produced (≈0.23 in one step).
      assert.ok(v - prev < 0.08, `jump of ${v - prev} at ${bpm} bpm`);
      prev = v;
    }
  });
});

describe('recovery — after the review', () => {
  it('names a raised resting rate even when the night was otherwise good', () => {
    // The early-infection shape: everything fine except the one signal that moves first.
    // Averaging it away and saying "the session as written should sit fine" was the wrong
    // sentence for exactly this morning.
    const r = recovery({ ...GOOD_NIGHT, restingHr: 61, readiness: 3 });
    assert.ok(r.score! >= 67, `expected a good band, got ${r.score}`);
    assert.match(r.note, /resting heart rate/i);
  });

  it('returns an integer score even though the components are no longer rounded', () => {
    const r = recovery({ ...GOOD_NIGHT, sleepMinutes: 437, hrvMs: 51.3, restingHr: 56.4, readiness: 2 });
    assert.ok(Number.isInteger(r.score));
  });

  it('gives a perfectly settled night full credit on efficiency', () => {
    // Zero minutes awake is a fact the hook now passes as 0 rather than null. It must score
    // at least as well as a slightly broken night, not drop out of the average.
    const settled = recovery({ ...GOOD_NIGHT, awakeMinutes: 0, readiness: 2 }).score!;
    const slightlyBroken = recovery({ ...GOOD_NIGHT, awakeMinutes: 5, readiness: 2 }).score!;
    assert.ok(settled >= slightlyBroken, `${settled} < ${slightlyBroken}`);
  });
});
