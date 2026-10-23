import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchExerciseNames, stripBrackets } from './exerciseMatch.ts';

const library = [
  { id: 'split', name: 'Split Squat', isMine: false },
  { id: 'goblet', name: 'Goblet Squat (Kettlebell)', isMine: false },
  { id: 'rdl-db', name: 'Romanian Deadlift (Dumbbell)', isMine: false },
  { id: 'rdl-bb', name: 'Romanian Deadlift (Barbell)', isMine: false },
  { id: 'mine', name: 'Copenhagen, knee-supported', isMine: true },
];

describe('matchExerciseNames', () => {
  it('matches exact names, ignoring case, spacing and hyphens', () => {
    const r = matchExerciseNames(library, ['split squat', 'Copenhagen knee supported']);
    assert.deepEqual(r.unmatched, []);
    assert.equal(r.byName.get('split squat'), 'split');
  });

  it('drops an equipment bracket on the asked name', () => {
    const r = matchExerciseNames(library, ['Split Squat (Dumbbell)']);
    assert.deepEqual(r.unmatched, []);
    assert.equal(r.byName.get('split squat dumbbell'), 'split');
  });

  it('finds a library name that carries a bracket when it is the only one', () => {
    const r = matchExerciseNames(library, ['Goblet Squat']);
    assert.equal(r.byName.get('goblet squat'), 'goblet');
  });

  it('refuses a bare name that two bracketed entries share', () => {
    const r = matchExerciseNames(library, ['Romanian Deadlift']);
    assert.deepEqual(r.unmatched, ['Romanian Deadlift']);
    const exact = matchExerciseNames(library, ['Romanian Deadlift (Barbell)']);
    assert.equal(exact.byName.get('romanian deadlift barbell'), 'rdl-bb');
  });

  it('strips square and round brackets', () => {
    assert.equal(stripBrackets('Split Squat (Dumbbell)'), 'Split Squat');
    assert.equal(stripBrackets('Step-down [box] slow'), 'Step-down slow');
  });
});
