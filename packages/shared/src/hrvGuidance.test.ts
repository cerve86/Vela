import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockKind, hrvGuidance, trainingPhase, type DayValue } from './hrvGuidance.ts';

const TODAY = '2026-09-07';

function day(offset: number): string {
  const t = Date.UTC(2026, 8, 7 + offset);
  return new Date(t).toISOString().slice(0, 10);
}

/** A daily series: `week` for the seven days ending today, `base` for the three before. */
function series(
  base: number | ((i: number) => number),
  week: number | ((i: number) => number),
): DayValue[] {
  const out: DayValue[] = [];
  for (let i = -27; i <= 0; i++) {
    const inWeek = i >= -6;
    const f = inWeek ? week : base;
    out.push({ day: day(i), value: typeof f === 'function' ? f(i) : f });
  }
  return out;
}

/**
 * A daily HRV that alternates around a level by a share of it, so its SD is not zero and
 * the swing stays the same in log space whatever the level — as real HRV's does.
 */
const alt = (level: number, share: number) => (i: number) =>
  level * (1 + (i % 2 === 0 ? share : -share));
/** A steady baseline of HRV with a little alternation. */
const baseHrv = alt(60, 0.033);
/** A week the same as the baseline, still alternating. */
const sameWeek = alt(60, 0.033);
const restingSteady = (i: number) => 56 + (i % 2 === 0 ? 1 : -1);

const noLoad: DayValue[] = [];
const steadyLoad = series(10, 10);
const overloadLoad = series(10, 15);
const taperLoad = series(10, 5);

test('nothing to read against: null', () => {
  assert.equal(
    hrvGuidance({
      today: TODAY,
      hrv: series(60, 60).slice(-5),
      restingHr: [],
      load: [],
      sessions: [],
      readiness: null,
    }),
    null,
  );
  // A week of two readings is not a week.
  const thin = series(baseHrv, sameWeek).filter((v) => v.day < day(-6) || v.day >= day(-1));
  assert.equal(
    hrvGuidance({
      today: TODAY,
      hrv: thin,
      restingHr: [],
      load: [],
      sessions: [],
      readiness: null,
    }),
    null,
  );
});

test('within range, low variability, no overload: OK', () => {
  const g = hrvGuidance({
    today: TODAY,
    hrv: series(baseHrv, sameWeek),
    restingHr: series(restingSteady, restingSteady),
    load: steadyLoad,
    sessions: [],
    readiness: 2,
  })!;
  assert.equal(g.hrv, 'within');
  assert.equal(g.variability, 'low');
  assert.equal(g.phase, 'steady');
  assert.equal(g.outcome, 'ok');
  assert.equal(g.stance, 'hold');
  assert.equal(g.summary, 'HRV in your range · variability steady · steady week');
  assert.match(g.note, /Train to plan/);
});

test('within range, low variability, overload: coping well, and her read tempers it', () => {
  const input = {
    today: TODAY,
    hrv: series(baseHrv, sameWeek),
    restingHr: series(restingSteady, restingSteady),
    load: overloadLoad,
    sessions: [],
  };
  assert.equal(hrvGuidance({ ...input, readiness: 4 })!.outcome, 'coping_well');
  assert.match(hrvGuidance({ ...input, readiness: 4 })!.note, /room to add/);
  assert.match(hrvGuidance({ ...input, readiness: 1 })!.note, /don't feel it/);
  assert.match(hrvGuidance({ ...input, readiness: null })!.note, /coping well/);
});

test('within range, high variability: expected in an overload, otherwise ease off', () => {
  // A scattered week: the same mean, four times the swing.
  const scattered = alt(60, 0.2);
  const base = {
    today: TODAY,
    hrv: series(baseHrv, scattered),
    restingHr: [],
    sessions: [],
    readiness: 2 as const,
  };
  const over = hrvGuidance({ ...base, load: overloadLoad })!;
  assert.equal(over.variability, 'high');
  assert.equal(over.outcome, 'expected_high_cv');
  const steady = hrvGuidance({ ...base, load: steadyLoad })!;
  assert.equal(steady.outcome, 'reduce_for_recovery');
  assert.equal(steady.stance, 'ease');
});

test('below range, low variability: the phase and the block decide', () => {
  const lowWeek = alt(50, 0.033);
  const base = {
    today: TODAY,
    hrv: series(baseHrv, lowWeek),
    restingHr: series(restingSteady, restingSteady),
    readiness: 2 as const,
  };
  const intense = [
    { day: day(-1), discipline: 'strength', rpe: 8 },
    { day: day(-3), discipline: 'strength', rpe: 8 },
  ];
  const long = [
    { day: day(-1), discipline: 'run', rpe: 4 },
    { day: day(-3), discipline: 'run', rpe: 5 },
  ];

  assert.equal(
    hrvGuidance({ ...base, load: overloadLoad, sessions: intense })!.outcome,
    'expected_intensity',
  );
  const fatigue = hrvGuidance({ ...base, load: overloadLoad, sessions: long })!;
  assert.equal(fatigue.outcome, 'high_fatigue');
  assert.equal(fatigue.stance, 'rest');
  assert.match(fatigue.note, /let your physio know/);
  assert.equal(
    hrvGuidance({ ...base, load: overloadLoad, sessions: [] })!.outcome,
    'overload_block_unknown',
  );
  assert.equal(hrvGuidance({ ...base, load: taperLoad, sessions: [] })!.outcome, 'taper_expected');
  assert.equal(hrvGuidance({ ...base, load: steadyLoad, sessions: [] })!.outcome, 'poor_coping');
});

test('below range with a low resting heart rate: possible saturation, whatever else', () => {
  const lowWeek = alt(50, 0.033);
  const restingLow = (i: number) => 50 + (i % 2 === 0 ? 1 : -1);
  const g = hrvGuidance({
    today: TODAY,
    hrv: series(baseHrv, lowWeek),
    restingHr: series(restingSteady, restingLow),
    load: overloadLoad,
    sessions: [],
    readiness: 3,
  })!;
  assert.equal(g.restingLow, true);
  assert.equal(g.outcome, 'saturation');
  assert.equal(g.stance, 'check');
  assert.match(g.summary, /resting HR low/);
});

test('below range, high variability: full rest', () => {
  const lowScattered = alt(50, 0.2);
  const g = hrvGuidance({
    today: TODAY,
    hrv: series(baseHrv, lowScattered),
    restingHr: series(restingSteady, restingSteady),
    load: steadyLoad,
    sessions: [],
    readiness: 0,
  })!;
  assert.equal(g.outcome, 'full_rest');
  assert.match(g.note, /proper rest, and you feel it/);
});

test('above range: expected for volume, insufficient load for intensity, otherwise fine', () => {
  const highWeek = alt(72, 0.033);
  const base = { today: TODAY, hrv: series(baseHrv, highWeek), restingHr: [], readiness: 2 as const };
  const long = [
    { day: day(-2), discipline: 'run', rpe: null },
    { day: day(-4), discipline: 'mobility', rpe: null },
  ];
  const intense = [{ day: day(-2), discipline: 'strength', rpe: null }];
  assert.equal(
    hrvGuidance({ ...base, load: overloadLoad, sessions: long })!.outcome,
    'expected_volume',
  );
  const push = hrvGuidance({ ...base, load: overloadLoad, sessions: intense })!;
  assert.equal(push.outcome, 'intensity_insufficient');
  assert.equal(push.stance, 'push');
  assert.equal(hrvGuidance({ ...base, load: steadyLoad, sessions: [] })!.outcome, 'ok');

  const highScattered = alt(72, 0.2);
  const cv = { ...base, hrv: series(baseHrv, highScattered) };
  assert.equal(
    hrvGuidance({ ...cv, load: overloadLoad, sessions: intense })!.outcome,
    'intensity_insufficient_caution',
  );
  assert.equal(hrvGuidance({ ...cv, load: steadyLoad, sessions: [] })!.outcome, 'stabilise');
});

test('training phase from load, and the block from the sessions', () => {
  assert.equal(trainingPhase(steadyLoad, day(-6), day(-27), TODAY), 'steady');
  assert.equal(trainingPhase(overloadLoad, day(-6), day(-27), TODAY), 'overload');
  assert.equal(trainingPhase(taperLoad, day(-6), day(-27), TODAY), 'taper');
  assert.equal(trainingPhase(noLoad, day(-6), day(-27), TODAY), 'steady');
  // A first week, with nothing before it, is a new stimulus.
  assert.equal(trainingPhase(series(0, 10), day(-6), day(-27), TODAY), 'overload');

  assert.equal(blockKind([]), null);
  assert.equal(
    blockKind([
      { discipline: 'run', rpe: 8 },
      { discipline: 'run', rpe: 9 },
    ]),
    'intensity',
  );
  assert.equal(
    blockKind([
      { discipline: 'strength', rpe: 4 },
      { discipline: 'strength', rpe: 5 },
    ]),
    'volume',
  );
  assert.equal(
    blockKind([
      { discipline: 'strength', rpe: null },
      { discipline: 'run', rpe: null },
    ]),
    'intensity',
  );
  assert.equal(
    blockKind([
      { discipline: 'run', rpe: null },
      { discipline: 'mobility', rpe: 6 },
    ]),
    'volume',
  );
});
