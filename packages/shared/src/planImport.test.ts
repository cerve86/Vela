import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  detectImportFormat,
  extractMovements,
  isoWeekday,
  mondayOf,
  parseDateCell,
  parsePlanRows,
  prettyPhase,
  type SpreadsheetCell,
} from './programImport.ts';

/**
 * The plan-sheet parser: one row per dated session. The shape a planning assistant
 * exports for a physiotherapist, not the one a strength coach writes by hand.
 */

const HEADERS = [
  'athlete_email',
  'date',
  'phase',
  'week_number',
  'title',
  'type',
  'planned_min',
  'planned_km',
  'vert_m',
  'fuel_carbs_g_per_h',
  'notes',
];

const row = (
  date: SpreadsheetCell,
  week: SpreadsheetCell,
  title: SpreadsheetCell,
  type: SpreadsheetCell,
  min: SpreadsheetCell = null,
  km: SpreadsheetCell = null,
  notes: SpreadsheetCell = null,
  email: SpreadsheetCell = 'caroline@example.com',
): SpreadsheetCell[] => [email, date, 'base1', week, title, type, min, km, null, null, notes];

describe('detectImportFormat', () => {
  it('tells a plan sheet from a movement sheet by date and sets', () => {
    assert.equal(detectImportFormat(HEADERS), 'plan');
    assert.equal(detectImportFormat(['Week', 'Day', 'Exercise', 'Sets', 'Reps']), 'movements');
    assert.equal(detectImportFormat(['Date', 'Exercise', 'Sets', 'Reps']), 'movements');
  });
});

describe('dates', () => {
  it('reads ISO text, European text, serials and Date objects', () => {
    assert.equal(parseDateCell('2026-09-14'), '2026-09-14');
    assert.equal(parseDateCell('14/09/2026'), '2026-09-14');
    assert.equal(parseDateCell(46279), '2026-09-14');
    assert.equal(parseDateCell(new Date(Date.UTC(2026, 8, 14))), '2026-09-14');
    assert.equal(parseDateCell('2026-02-30'), null);
    assert.equal(parseDateCell('Monday'), null);
  });
  it('knows its weekdays', () => {
    assert.equal(isoWeekday('2026-09-14'), 1);
    assert.equal(isoWeekday('2026-09-20'), 7);
    assert.equal(mondayOf('2026-09-17'), '2026-09-14');
  });
});

describe('extractMovements', () => {
  it('lifts movements with a dose out of a sentence and leaves the coaching', () => {
    const items = extractMovements(
      '10 min easy jog, cadence focus. Pre-swim: Dead bug hip thrust 3 x 12 per side · Bear crawl twist, ball squeezed between knees 3 x 10 per side · Loaded hip airplanes 3 x 8 per side, 8-10 kg. Pool 400 m, supervised.',
    );
    assert.deepEqual(
      items.map((i) => [i.exercise, i.sets, i.reps, i.loadKg, i.notes]),
      [
        ['Dead bug hip thrust', 3, '12 per side', null, null],
        ['Bear crawl twist, ball squeezed between knees', 3, '10 per side', null, null],
        ['Loaded hip airplanes', 3, '8 per side', 8, null],
      ],
    );
  });

  it('handles the multiplication sign, slashes, ranges, units and a leading label', () => {
    const items = extractMovements(
      'Own programme: reps down, load +5%. Chest press and row live here. + Gait: single-leg RDL 3 × 8/side · step-down 3 × 8/side, 3 s lower · loaded SL heel raise 4 × 6–8.',
    );
    assert.deepEqual(
      items.map((i) => [i.exercise, i.sets, i.reps, i.notes]),
      [
        ['Single-leg RDL', 3, '8 per side', null],
        ['Step-down', 3, '8 per side', '3 s lower'],
        ['Loaded SL heel raise', 4, '6–8', null],
      ],
    );
  });

  it('turns a reps-first count round and keeps a timed hold as time', () => {
    const items = extractMovements(
      'Tennis-ball calf raises 15 x 2, twice daily. Knee-to-wall 2 x 10. Suitcase carry 4 x 45 s, 12.5-15 kg · Half-kneeling Pallof hold 4 × 30 s/side',
    );
    assert.deepEqual(
      items.map((i) => [i.exercise, i.sets, i.reps, i.loadKg, i.notes]),
      [
        ['Tennis-ball calf raises', 2, '15', null, 'twice daily'],
        ['Knee-to-wall', 2, '10', null, null],
        ['Suitcase carry', 4, '45 s', 12.5, null],
        ['Half-kneeling Pallof hold', 4, '30 s per side', null, null],
      ],
    );
  });

  it('finds nothing in a sentence with no dose', () => {
    assert.deepEqual(
      extractMovements('60 min · 4 blocks of ~15 min · run 5 / walk 1 · talk test.'),
      [],
    );
    assert.deepEqual(extractMovements(null), []);
  });
});

describe('parsePlanRows', () => {
  it('puts each dated row on its weekday, folds a shared date, and skips a bare rest', () => {
    const r = parsePlanRows(HEADERS, [
      row(
        '2026-09-14',
        1,
        'Gym Day 1',
        'strength',
        50,
        null,
        'Cards as issued. Suitcase carry 3 × 45 s stays in.',
      ),
      row('2026-09-18', 1, 'Long run — 60 min', 'long', 60, 8.1, '60 min · run 5 / walk 1'),
      row('2026-09-20', 1, 'Rest', 'rest', 0),
      row('2026-09-20', 1, 'Daily — ankle', 'recovery', 5, null, 'Knee-to-wall 2 x 10.'),
      row('2026-09-20', 1, 'Fuelling — weekly', 'recovery', 0, null, 'Carbs: HIGH Tue + Fri.'),
      row('2026-09-27', 2, 'Rest', 'rest', 0),
      row('2026-09-24', 2, 'Spin — 30 min Z2', 'cross', 30),
    ]);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.equal(r.startDate, '2026-09-14');
    assert.equal(r.athleteEmail, 'caroline@example.com');
    assert.equal(r.phase, 'base1');
    assert.equal(r.restDays, 1);
    assert.deepEqual(
      r.days.map((d) => [d.weekNo, d.dayNo, d.title, d.discipline, d.items.length]),
      [
        [1, 1, 'Gym Day 1', 'strength', 1],
        [1, 5, 'Long run — 60 min', 'run', 0],
        [1, 7, 'Daily — ankle', 'rehab', 1],
        [2, 4, 'Spin — 30 min Z2', 'cross', 0],
      ],
    );
    assert.equal(r.days[0]!.notes, '50 min\nCards as issued. Suitcase carry 3 × 45 s stays in.');
    assert.equal(r.days[1]!.notes, '60 min · 8.1 km\n60 min · run 5 / walk 1');
    assert.equal(
      r.days[2]!.notes,
      '5 min\nKnee-to-wall 2 x 10.\n\nFuelling — weekly: Carbs: HIGH Tue + Fri.',
    );
    assert.equal(r.days[3]!.notes, '30 min');
  });

  it('numbers weeks from the first Monday, whatever the sheet calls them', () => {
    const later = parsePlanRows(HEADERS, [
      row('2026-10-07', 4, 'Gym', 'strength', 50, null, 'x'),
      row('2026-10-13', 4, 'Run', 'run', 40, null, 'x'),
      row('2026-10-14', 5, 'Swim', 'swim', 40, null, 'x'),
    ]);
    assert.ok(later.ok);
    if (later.ok) {
      assert.equal(later.startDate, '2026-10-05');
      assert.deepEqual(
        later.days.map((d) => [d.weekNo, d.dayNo]),
        [
          [1, 3],
          [2, 2],
          [2, 3],
        ],
      );
    }
  });

  it('names the row for a bad date or type, and refuses two athletes in one file', () => {
    const r = parsePlanRows(HEADERS, [
      row('next Monday', 1, 'Gym', 'strength', 50),
      row('2026-09-15', 1, 'Swim', 'aqua', 30),
      row('2026-09-16', 1, 'Run', 'run', 30, null, null, 'someone.else@example.com'),
    ]);
    assert.ok(!r.ok);
    if (!r.ok) {
      assert.deepEqual(
        r.errors.map((e) => e.row),
        [2, 3, 0],
      );
      assert.match(r.errors[1]!.message, /"aqua" is not one of/);
      assert.match(r.errors[2]!.message, /more than one athlete/);
    }
  });

  it('refuses a sheet of nothing but rest', () => {
    const r = parsePlanRows(HEADERS, [row('2026-09-20', 1, 'Rest', 'rest', 0)]);
    assert.ok(!r.ok);
  });

  it('prettifies a phase', () => {
    assert.equal(prettyPhase('base1'), 'Base 1');
    assert.equal(prettyPhase('build_2'), 'Build 2');
    assert.equal(prettyPhase('peak'), 'Peak');
    assert.equal(prettyPhase(null), null);
  });
});
