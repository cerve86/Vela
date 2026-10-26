import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  amountsFor,
  asksFuelCheck,
  FUEL_DEFAULTS,
  fuelForSession,
  fuelTypeFor,
  mergeFuelCards,
  summariseFuelChecks,
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
    assert.equal(
      fuelTypeFor({ discipline: 'run', title: 'DOUBLE – AM 5 km easy · PM progression' }),
      'double',
    );
    assert.equal(fuelTypeFor({ discipline: 'run', title: 'Easy 5 km · PM boxing' }), 'double');
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

  it('adds the heat cue and the pre-dawn variant to a long run, the golden rule to every session', () => {
    assert.deepEqual(
      fuelForSession(cards, 'long', { restrictive: false }).extras.map((c) => c.key),
      ['heat', 'predawn', 'golden'],
    );
    assert.deepEqual(
      fuelForSession(cards, 'quality', { restrictive: false }).extras.map((c) => c.key),
      ['golden'],
    );
  });

  it('gives an easy run the water-only card and the plate, other easy days the plate', () => {
    const run = fuelForSession(cards, 'easy', { restrictive: false, discipline: 'run' });
    assert.equal(run.main?.key, 'easy');
    assert.deepEqual(
      run.extras.map((c) => c.key),
      ['plate'],
    );
    assert.equal(
      fuelForSession(cards, 'easy', { restrictive: false, discipline: 'rehab' }).main?.key,
      'plate',
    );
  });

  it('picks the block long-run card, falling back to the general one when unpublished', () => {
    assert.equal(fuelForSession(cards, 'long_gut', { restrictive: false }).main?.key, 'long_gut');
    const hidden = cards.map((c) => (c.key === 'long_rehearsal' ? { ...c, published: false } : c));
    const f = fuelForSession(hidden, 'long_rehearsal', { restrictive: false });
    assert.equal(f.main?.key, 'long');
    assert.ok(f.extras.some((c) => c.key === 'heat'));
  });

  it('adds the second-half-of-cycle cue only when she is in it', () => {
    assert.ok(
      fuelForSession(cards, 'easy', { restrictive: false, luteal: true }).extras.some(
        (c) => c.key === 'luteal',
      ),
    );
    assert.ok(
      !fuelForSession(cards, 'long', { restrictive: false }).extras.some((c) => c.key === 'luteal'),
    );
  });

  it('keeps the golden rule whole for a restrictive-pattern client, and asks no check on easy days', () => {
    const golden = fuelForSession(cards, 'double', { restrictive: true }).extras.find(
      (c) => c.key === 'golden',
    );
    assert.match(golden!.face.cue!, /never down/);
    assert.equal(asksFuelCheck('easy'), false);
    assert.equal(asksFuelCheck('long_gut'), true);
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

describe('amountsFor', () => {
  it('works per-kg amounts out for her weight, rounded', () => {
    assert.equal(
      amountsFor('Carb meal: 1–2 g per kg of body weight.', 60),
      'Carb meal: 1–2 g per kg of body weight (about 60–120 g for you).',
    );
    assert.equal(
      amountsFor('protein 0.3 g per kg', 58),
      'protein 0.3 g per kg (about 15 g for you)',
    );
    assert.equal(
      amountsFor('Drink 5–7 mL per kg', 60),
      'Drink 5–7 mL per kg (about 300–400 mL for you)',
    );
    assert.equal(
      amountsFor('Protein 1.6 g/kg a day', 62.4),
      'Protein 1.6 g/kg a day (about 100 g for you)',
    );
  });

  it('reads ranges written with "to" or a dash, and millilitres in any case', () => {
    assert.match(amountsFor('Carbs 1 to 2 g per kg', 60), /about 60–120 g for you/);
    assert.match(amountsFor('Carbs 1—2 g per kg', 60), /about 60–120 g for you/);
    assert.match(amountsFor('Drink 5-7 ml/kg', 60), /about 300–400 mL for you/);
  });

  it('never gives a wrong figure: no part of a number, no fluid per kg lost, no fat-free mass', () => {
    for (const line of [
      'protein .3 g per kg',
      'protein 0,3 g per kg',
      'Drink 1250–1500 mL per kg lost',
      'Drink 1250–1500 mL per kg of weight lost',
      'Protein 2.2 g per kg FFM',
      'caffeine 3 mg per kg',
    ])
      assert.equal(amountsFor(line, 60), line);
  });

  it('leaves the line as written without a plausible weight, and per-hour amounts alone', () => {
    const line = '30–60 g carbohydrate per hour; 1.25–1.5 L for every kg lost.';
    assert.equal(amountsFor(line, 60), line);
    assert.equal(amountsFor('1–2 g per kg', null), '1–2 g per kg');
    assert.equal(amountsFor('1–2 g per kg', 3), '1–2 g per kg');
  });

  it('reaches the session cards through fuelForSession, never for a restrictive client', () => {
    const cards = mergeFuelCards([]);
    const f = fuelForSession(cards, 'long', { restrictive: false, weightKg: 60 });
    assert.match(f.main!.detail.before!, /about 60–120 g for you/);
    assert.match(f.main!.detail.after!, /about 20 g for you/);
    assert.match(f.extras.find((c) => c.key === 'heat')!.detail.cue!, /about 300–400 mL for you/);
    const r = fuelForSession(cards, 'long', { restrictive: true, weightKg: 60 });
    assert.deepEqual(r.main?.detail, {});
  });

  it('gives every session card amounts in grams or millilitres', () => {
    for (const c of FUEL_DEFAULTS.filter((c) => c.key !== 'easy'))
      for (const line of Object.values(c.detail))
        assert.match(line!, /\d+(–\d+)?\s*(g|mL|L|mg)\b/, `${c.key}: ${line}`);
  });
});

describe('summariseFuelChecks', () => {
  it('counts followed and enough separately, and skips unanswered sessions', () => {
    const s = summariseFuelChecks([
      { followed: 'yes', enough: 'right', gut: 0, barrier: null },
      { followed: 'yes', enough: 'ran_out', gut: 1, barrier: null },
      { followed: 'partly', enough: 'short', gut: 2, barrier: 'stomach' },
      { followed: 'no', enough: 'heavy', gut: null, barrier: 'forgot' },
      { followed: null, enough: null, gut: null, barrier: null },
    ]);
    assert.deepEqual(s, {
      answered: 4,
      followed: 2,
      partly: 1,
      missed: 1,
      right: 1,
      short: 2,
      ranOut: 1,
      heavy: 1,
      gut: 2,
      gutHard: 1,
    });
  });
});
