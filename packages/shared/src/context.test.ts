import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cycleDay, inLutealPhase, readinessBaseline } from './context.ts';

describe('cycleDay', () => {
  it('counts from the last start, day 1 being that day', () => {
    assert.equal(cycleDay(['2026-10-12'], '2026-10-12')?.day, 1);
    assert.equal(cycleDay(['2026-10-12'], '2026-10-23')?.day, 12);
  });

  it('averages recorded cycles and ignores implausible gaps', () => {
    const c = cycleDay(['2026-07-20', '2026-08-18', '2026-09-15', '2026-10-14'], '2026-10-23');
    assert.equal(c?.averageLength, 29);
    assert.equal(c?.lastStart, '2026-10-14');
    // A missed entry makes a 60-day gap; it is not a cycle length.
    assert.equal(cycleDay(['2026-06-01', '2026-07-31'], '2026-08-02')?.averageLength, null);
  });

  it('is null with nothing recorded, and ignores a start in the future', () => {
    assert.equal(cycleDay([], '2026-10-23'), null);
    assert.equal(cycleDay(['2026-11-01'], '2026-10-23'), null);
  });
});

describe('readinessBaseline', () => {
  const s = (scheduledDate: string, readinessBefore: number | null) => ({
    scheduledDate,
    readinessBefore,
  });

  it('is the mean of the 28 days before, excluding the day itself', () => {
    const sessions = [
      s('2026-10-01', 8),
      s('2026-10-10', 6),
      s('2026-10-20', 7),
      s('2026-10-23', 2),
    ];
    assert.equal(readinessBaseline(sessions, '2026-10-23'), 7);
  });

  it('needs three taps, and forgets anything older than four weeks', () => {
    assert.equal(readinessBaseline([s('2026-10-20', 7), s('2026-10-21', 7)], '2026-10-23'), null);
    assert.equal(
      readinessBaseline(
        [s('2026-09-01', 2), s('2026-10-20', 7), s('2026-10-21', 7), s('2026-10-22', 7)],
        '2026-10-23',
      ),
      7,
    );
    assert.equal(
      readinessBaseline(
        [s('2026-10-20', null), s('2026-10-21', 7), s('2026-10-22', 7)],
        '2026-10-23',
      ),
      null,
    );
  });
});

describe('inLutealPhase', () => {
  const regular = { status: 'regular', periodStarts: ['2026-09-01', '2026-09-29', '2026-10-27'] };

  it('is the 14 days before the next period is due, on a regular cycle', () => {
    assert.equal(inLutealPhase(regular, '2026-11-05'), false); // day 10 of 28
    assert.equal(inLutealPhase(regular, '2026-11-12'), true); // day 17
    assert.equal(inLutealPhase(regular, '2026-11-23'), true); // day 28
  });

  it('says nothing for an irregular cycle, no record, or a period well overdue', () => {
    assert.equal(inLutealPhase({ ...regular, status: 'irregular' }, '2026-11-12'), false);
    assert.equal(inLutealPhase(null, '2026-11-12'), false);
    assert.equal(inLutealPhase(regular, '2026-12-05'), false); // day 40
  });
});
