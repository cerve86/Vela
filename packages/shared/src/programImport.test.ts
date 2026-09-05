import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  importProgramSchema,
  mapHeaders,
  parseCsv,
  parseProgramRows,
  summariseImport,
  type SpreadsheetCell,
} from './programImport.ts';

/**
 * The import parser. A spreadsheet is the one input to this product that a human writes
 * without the app watching, so the parser's job is less "accept the right file" than
 * "explain the wrong one" — and every message it gives has to name the row.
 */

const HEADERS = ['Week', 'Day', 'Day title', 'Discipline', 'Block', 'Exercise', 'Sets', 'Reps', 'Load (kg)', 'RPE', 'Tempo', 'Rest (s)', 'Notes'];

const row = (
  week: SpreadsheetCell,
  day: SpreadsheetCell,
  title: SpreadsheetCell,
  discipline: SpreadsheetCell,
  block: SpreadsheetCell,
  exercise: SpreadsheetCell,
  sets: SpreadsheetCell,
  reps: SpreadsheetCell,
  load: SpreadsheetCell = null,
  rpe: SpreadsheetCell = null,
  tempo: SpreadsheetCell = null,
  rest: SpreadsheetCell = null,
  notes: SpreadsheetCell = null,
): SpreadsheetCell[] => [week, day, title, discipline, block, exercise, sets, reps, load, rpe, tempo, rest, notes];

describe('parseCsv', () => {
  it('handles quotes, escaped quotes and CRLF', () => {
    const rows = parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n');
    assert.deepEqual(rows, [['a', 'b, c', 'say "hi"'], ['1', '2', '3']]);
  });

  it('detects the semicolon Excel writes in most of Europe', () => {
    const rows = parseCsv('Week;Day;Exercise\n1;1;Squat\n');
    assert.deepEqual(rows, [['Week', 'Day', 'Exercise'], ['1', '1', 'Squat']]);
  });

  it('strips a byte-order mark and drops blank lines', () => {
    const rows = parseCsv('﻿a,b\n\n1,2\n   \n');
    assert.deepEqual(rows, [['a', 'b'], ['1', '2']]);
  });
});

describe('mapHeaders', () => {
  it('accepts the human spellings', () => {
    const r = mapHeaders(['WEEK', 'Day no', 'Session name', 'Type', 'Superset', 'Movement', 'Sets', 'Reps', 'kg', 'Effort', 'Tempo', 'Rest (sec)', 'Cues']);
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.map.week, 0);
      assert.equal(r.map.title, 2);
      assert.equal(r.map.discipline, 3);
      assert.equal(r.map.block, 4);
      assert.equal(r.map.exercise, 5);
      assert.equal(r.map.loadKg, 8);
      assert.equal(r.map.rpe, 9);
      assert.equal(r.map.restSec, 11);
      assert.equal(r.map.notes, 12);
    }
  });

  it('names what is missing and what would have satisfied it', () => {
    const r = mapHeaders(['Week', 'Day', 'Exercise', 'Sets']);
    assert.ok(!r.ok);
    if (!r.ok) {
      assert.equal(r.errors.length, 1);
      assert.match(r.errors[0]!, /"reps" column/);
      assert.match(r.errors[0]!, /repetitions/);
    }
  });
});

describe('parseProgramRows', () => {
  it('groups rows into days and carries week and day forward', () => {
    const r = parseProgramRows(HEADERS, [
      row(1, 1, 'Lower', 'strength', 'A', 'Romanian Deadlift', 3, '8-10', 32.5, 7, '3010', 90, 'Hinge'),
      row(null, null, null, null, 'A', 'Calf Raise', 3, 15, 10, null, null, '60s'),
      row(null, null, null, null, 'B', 'Bridge', 3, 12),
      row(1, 2, 'Core', 'rehab', null, 'Connection Breath', 3, 10, null, null, null, '1:30'),
      row(2, 1, 'Lower', null, 'A', 'Romanian Deadlift', 3, '8-10', 35),
    ]);
    assert.ok(r.ok, JSON.stringify(r));
    if (!r.ok) return;

    assert.equal(r.days.length, 3);
    const [d1, d2, d3] = r.days;
    assert.equal(d1!.title, 'Lower');
    assert.equal(d1!.discipline, 'strength');
    assert.equal(d1!.items.length, 3);
    assert.deepEqual(d1!.items.map((i) => i.block), ['A', 'A', 'B']);
    assert.equal(d1!.items[0]!.loadKg, 32.5);
    assert.equal(d1!.items[0]!.rpe, 7);
    assert.equal(d1!.items[0]!.tempo, '3010');
    assert.equal(d1!.items[0]!.restSec, 90);
    assert.equal(d1!.items[1]!.restSec, 60, '"60s" is sixty seconds');
    assert.equal(d1!.items[2]!.restSec, 60, 'blank rest is the default');
    assert.equal(d2!.discipline, 'rehab');
    assert.equal(d2!.items[0]!.restSec, 90, '"1:30" is ninety seconds');
    assert.equal(d3!.weekNo, 2);
    assert.equal(d3!.discipline, 'strength', 'blank discipline defaults');
    assert.equal(r.rowsRead, 5);
  });

  it('reads load out of "32,5 kg" and treats "bw" as none', () => {
    const r = parseProgramRows(HEADERS, [
      row(1, 1, 'A', null, null, 'Squat', 3, 5, '32,5 kg'),
      row(null, null, null, null, null, 'Lunge', 3, 8, 'bw'),
    ]);
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.days[0]!.items[0]!.loadKg, 32.5);
      assert.equal(r.days[0]!.items[1]!.loadKg, null);
    }
  });

  it('collects every error with the row Excel shows', () => {
    const r = parseProgramRows(HEADERS, [
      row(1, 1, 'A', null, null, 'Squat', 0, 5), // row 2: sets 0
      row(null, null, null, null, null, '', 3, 5), // row 3: no exercise
      row(null, null, null, 'pilates', null, 'Bridge', 3, 12, null, 11), // row 4: rpe 11, discipline
      row(null, 9, null, null, null, 'Bridge', 3, 12), // row 5: day 9
    ]);
    assert.ok(!r.ok);
    if (r.ok) return;
    const rows = r.errors.map((e) => e.row);
    assert.deepEqual([...new Set(rows)], [2, 3, 4, 5]);
    assert.ok(r.errors.some((e) => e.row === 2 && /Sets/.test(e.message)));
    assert.ok(r.errors.some((e) => e.row === 3 && /Exercise is blank/.test(e.message)));
    assert.ok(r.errors.some((e) => e.row === 4 && /RPE 11/.test(e.message)));
    assert.ok(r.errors.some((e) => e.row === 4 && /pilates/.test(e.message)));
    assert.ok(r.errors.some((e) => e.row === 5 && /Day must be/.test(e.message)));
  });

  it('refuses the rep range Excel turned into a date, and says why', () => {
    const r = parseProgramRows(HEADERS, [row(1, 1, 'A', null, null, 'Squat', 3, new Date('2026-08-10'))]);
    assert.ok(!r.ok);
    if (!r.ok) {
      assert.equal(r.errors[0]!.row, 2);
      assert.match(r.errors[0]!.message, /8-10/);
      assert.match(r.errors[0]!.message, /Text/);
    }
  });

  it('will not take a day from the row above when the week changed', () => {
    const r = parseProgramRows(HEADERS, [
      row(1, 1, 'A', null, null, 'Squat', 3, 5),
      row(2, null, null, null, null, 'Squat', 3, 5),
    ]);
    assert.ok(!r.ok);
    if (!r.ok) assert.match(r.errors[0]!.message, /new week needs its day/);
  });

  it('has nothing to say about a first row with no week', () => {
    const r = parseProgramRows(HEADERS, [row(null, null, 'A', null, null, 'Squat', 3, 5)]);
    assert.ok(!r.ok);
    if (!r.ok) assert.match(r.errors[0]!.message, /no row above/);
  });

  it('ignores blank rows and reports an empty sheet', () => {
    const r = parseProgramRows(HEADERS, [[], [null, null, null], []]);
    assert.ok(!r.ok);
    if (!r.ok) assert.match(r.errors[0]!.message, /No rows with data/);
  });

  it('defaults a missing title to the day number', () => {
    const r = parseProgramRows(['Week', 'Day', 'Exercise', 'Sets', 'Reps'], [[1, 3, 'Squat', 3, 5]]);
    assert.ok(r.ok);
    if (r.ok) assert.equal(r.days[0]!.title, 'Day 3');
  });
});

describe('importProgramSchema', () => {
  const day = (weekNo: number, dayNo: number) => ({
    weekNo,
    dayNo,
    title: 'x',
    items: [{ exercise: 'Squat', sets: 3, reps: '5' }],
  });

  it('applies the defaults a JSON caller may leave out', () => {
    const p = importProgramSchema.parse({ name: 'Block', days: [day(1, 1)] });
    assert.equal(p.isTemplate, false);
    assert.equal(p.days[0]!.discipline, 'strength');
    assert.equal(p.days[0]!.items[0]!.block, 'A');
    assert.equal(p.days[0]!.items[0]!.restSec, 60);
    assert.equal(p.days[0]!.items[0]!.loadKg, null);
  });

  it('rejects the same week and day twice', () => {
    const r = importProgramSchema.safeParse({ name: 'Block', days: [day(1, 1), day(1, 1)] });
    assert.ok(!r.success);
    if (!r.success) assert.match(r.error.issues[0]!.message, /appears twice/);
  });

  it('holds the database limits', () => {
    const bad = importProgramSchema.safeParse({
      name: 'B',
      days: [{ ...day(1, 1), items: [{ exercise: 'Squat', sets: 21, reps: '5', restSec: 901 }] }],
    });
    assert.ok(!bad.success);
  });
});

describe('summariseImport', () => {
  it('counts weeks, days, movements and distinct exercises', () => {
    const r = parseProgramRows(HEADERS, [
      row(1, 1, 'A', null, null, 'Squat', 3, 5),
      row(null, null, null, null, null, 'squat', 3, 5),
      row(3, 1, 'A', null, null, 'Bridge', 3, 5),
    ]);
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(summariseImport(r.days), { weeks: 3, days: 2, items: 3, exercises: 2 });
  });
});
