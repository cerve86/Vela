import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planFor as activePlan, readinessGate } from './planCore.ts';

const items = [
  { exerciseName: 'Dead bug', sets: 3, reps: '10', targetLoadKg: null, category: 'pelvic_floor' },
  { exerciseName: 'Split squat', sets: 4, reps: '8', targetLoadKg: 12, category: 'strength' },
  { exerciseName: 'Pogo hops', sets: 3, reps: '20', targetLoadKg: null, category: 'plyometric' },
  { exerciseName: 'Easy run', sets: 1, reps: '30 min', targetLoadKg: null, category: 'running' },
];

describe('readinessGate', () => {
  it('splits 0–10 into the three tiers, and null until she taps', () => {
    assert.equal(readinessGate(null), null);
    assert.equal(readinessGate(10), 'planned');
    assert.equal(readinessGate(7), 'planned');
    assert.equal(readinessGate(6), 'reduced');
    assert.equal(readinessGate(3), 'reduced');
    assert.equal(readinessGate(2), 'hold');
    assert.equal(readinessGate(0), 'hold');
  });
});

describe('activePlan', () => {
  it('serves the session as prescribed before she has tapped, and at 7 or more', () => {
    assert.equal(activePlan(items, { readiness: null }).items.length, 4);
    const fresh = activePlan(items, { readiness: 8 });
    assert.equal(fresh.temper, 'prescribed');
    assert.equal(fresh.dropLoad, false);
  });

  it('halves the volume and drops load from 3 to 6', () => {
    const p = activePlan(items, { readiness: 5 });
    assert.equal(p.temper, 'reduced');
    assert.equal(p.items.length, 2);
    assert.equal(p.items[1]!.sets, 2);
    assert.equal(p.items[1]!.targetLoadKg, null);
  });

  it('under 3 serves the gentle version while the coach decides', () => {
    const p = activePlan(items, { readiness: 2 });
    assert.equal(p.temper, 'gentle');
    assert.equal(p.tag, 'Waiting for your physio');
    assert.deepEqual(
      p.items.map((i) => i.exerciseName),
      ['Dead bug'],
    );
  });

  it("the coach's answer wins over readiness", () => {
    assert.equal(activePlan(items, { readiness: 1, adjustedTo: 'low_impact' }).items.length, 0);
    assert.deepEqual(
      activePlan(items, { readiness: 1, adjustedTo: 'strength' }).items.map((i) => i.exerciseName),
      ['Dead bug', 'Split squat'],
    );
    assert.equal(activePlan(items, { readiness: 1, adjustedTo: 'as_planned' }).items.length, 4);
  });

  it('an acute symptom holds the day, whatever else', () => {
    const p = activePlan(items, { readiness: 9, acute: 'fever', adjustedTo: 'as_planned' });
    assert.equal(p.temper, 'held');
    assert.equal(p.items.length, 0);
  });

  it('a pelvic-floor yes takes impact work out of any tier', () => {
    const p = activePlan(items, { readiness: 9, pfFlag: true });
    assert.ok(!p.items.some((i) => i.category === 'plyometric'));
    assert.match(p.note, /Impact work is off today/);
  });
});
