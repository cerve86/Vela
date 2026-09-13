import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { programmeWeeks, weekColumnCounts, weekRangeLabel } from './programWeeks.ts';

const s = (date: string, status: string, day: string | null = 'd', title = 'Run') => ({
  scheduledDate: date,
  status,
  programDayId: day,
  title,
  discipline: 'run',
});

describe('programmeWeeks', () => {
  const sessions = [
    s('2026-09-07', 'completed'),
    s('2026-09-09', 'completed'),
    s('2026-09-11', 'scheduled'),
    s('2026-09-13', 'in_progress'),
    s('2026-09-15', 'scheduled'),
    s('2026-09-17', 'scheduled'),
    s('2026-09-10', 'completed', null, 'Morning ride'), // recorded, not prescribed
  ];

  it('lays the weeks out from the start date and counts only prescribed sessions', () => {
    const weeks = programmeWeeks({
      startDate: '2026-09-07',
      durationWeeks: 3,
      sessions,
      today: '2026-09-13',
    });
    assert.equal(weeks.length, 3);
    assert.deepEqual(
      weeks.map((w) => [
        w.weekNo,
        w.from,
        w.to,
        w.planned,
        w.done,
        w.missed,
        w.isCurrent,
        w.isPast,
      ]),
      [
        [1, '2026-09-07', '2026-09-13', 4, 2, 1, true, false],
        [2, '2026-09-14', '2026-09-20', 2, 0, 0, false, false],
        [3, '2026-09-21', '2026-09-27', 0, 0, 0, false, false],
      ],
    );
  });

  it('marks a finished week as past', () => {
    const weeks = programmeWeeks({
      startDate: '2026-09-07',
      durationWeeks: 2,
      sessions,
      today: '2026-09-16',
    });
    assert.equal(weeks[0]!.isPast, true);
    // The scheduled one is missed; the one she started and never sent is not counted as missed.
    assert.equal(weeks[0]!.missed, 1);
    assert.equal(weeks[1]!.isCurrent, true);
  });

  it('counts per calendar column, and leaves a column with no plan blank', () => {
    const counts = weekColumnCounts(['2026-08-30', '2026-09-06', '2026-09-13'], sessions);
    assert.deepEqual(counts, [null, { planned: 3, done: 2 }, { planned: 3, done: 0 }]);
  });

  it('writes a week range', () => {
    assert.equal(weekRangeLabel('2026-09-14', '2026-09-20'), '14–20 Sep');
    assert.equal(weekRangeLabel('2026-09-28', '2026-10-04'), '28 Sep – 4 Oct');
  });
});
