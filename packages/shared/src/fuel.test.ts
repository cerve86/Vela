import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FUEL_DEFAULTS,
  fuelForSession,
  fuelTypeFor,
  mergeFuelCards,
  SUPPLEMENT_DEFAULTS,
} from './fuel.ts';

describe('fuelTypeFor', () => {
  it('reads strength, long, quality and easy from the day', () => {
    assert.equal(fuelTypeFor({ discipline: 'strength', title: 'Lower body A' }), 'strength');
    assert.equal(fuelTypeFor({ discipline: 'run', title: 'Long run' }), 'long');
    assert.equal(
      fuelTypeFor({ discipline: 'run', title: 'Easy run', notes: '90 min conversational' }),
      'long',
    );
    assert.equal(fuelTypeFor({ discipline: 'run', title: 'Tempo intervals' }), 'quality');
    assert.equal(fuelTypeFor({ discipline: 'run', title: 'Bun Burner 20' }), 'quality');
    assert.equal(fuelTypeFor({ discipline: 'run', title: 'Easy run', notes: '40 min' }), 'easy');
    assert.equal(fuelTypeFor({ discipline: 'rehab', title: 'Pelvic floor' }), 'easy');
    assert.equal(fuelTypeFor({ discipline: 'run', title: 'Walk-run intervals' }), 'easy');
  });

  it('lets the coach decide the day', () => {
    assert.equal(fuelTypeFor({ discipline: 'run', title: 'Easy run', override: 'long' }), 'long');
  });
});

describe('fuelForSession', () => {
  const cards = mergeFuelCards([]);

  it('gives an easy day the plate reminder, not a fuelling card', () => {
    const f = fuelForSession(cards, 'easy', { restrictive: false });
    assert.equal(f.main?.key, 'plate');
    assert.deepEqual(f.extras, []);
  });

  it('adds the heat cue and the pre-dawn variant to a long run only', () => {
    assert.deepEqual(
      fuelForSession(cards, 'long', { restrictive: false }).extras.map((c) => c.key),
      ['heat', 'predawn'],
    );
    assert.deepEqual(fuelForSession(cards, 'quality', { restrictive: false }).extras, []);
  });

  it('takes every amount off for a restrictive-pattern client', () => {
    const f = fuelForSession(cards, 'long', { restrictive: true });
    assert.deepEqual(f.main?.detail, {});
    assert.ok(f.extras.every((c) => Object.keys(c.detail).length === 0));
  });

  it('keeps numbers off the face of every shipped card', () => {
    for (const c of [...FUEL_DEFAULTS, ...SUPPLEMENT_DEFAULTS])
      for (const line of Object.values(c.face))
        assert.doesNotMatch(line!, /\d/, `${c.key}: ${line}`);
  });

  it('shows no supplement until the coach publishes it, and hers replace the defaults', () => {
    assert.ok(SUPPLEMENT_DEFAULTS.every((c) => !c.published));
    const mine = mergeFuelCards([{ ...FUEL_DEFAULTS[0]!, face: { before: 'Her words.' } }]);
    assert.equal(mine.find((c) => c.key === 'long')?.face.before, 'Her words.');
  });
});
