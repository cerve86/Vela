import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dateWindow, rosterRollups, shiftDate, standingOf } from './roster.ts';

const TODAY = '2026-09-05';
const s = (
  clientId: string,
  daysAgo: number,
  status: string,
  painAfter: number | null = null,
): {
  clientId: string;
  scheduledDate: string;
  status: string;
  painAfter: number | null;
  completedAt: string | null;
} => ({
  clientId,
  scheduledDate: shiftDate(TODAY, -daysAgo),
  status,
  painAfter,
  completedAt: status === 'completed' ? `${shiftDate(TODAY, -daysAgo)}T18:00:00Z` : null,
});

describe('dates', () => {
  it('shifts in UTC across a month boundary', () => {
    assert.equal(shiftDate('2026-09-01', -1), '2026-08-31');
    assert.equal(shiftDate('2026-08-31', 1), '2026-09-01');
  });
  it('builds an inclusive window ending today', () => {
    const w = dateWindow(TODAY, 7);
    assert.equal(w.length, 7);
    assert.equal(w[0], '2026-08-30');
    assert.equal(w[6], TODAY);
  });
});

describe('rosterRollups', () => {
  it('counts only sessions already due, and never a future one as missed', () => {
    const r = rosterRollups({
      clientIds: ['a'],
      today: TODAY,
      sessions: [
        s('a', 5, 'completed'),
        s('a', 2, 'skipped'),
        s('a', 0, 'scheduled'),
        s('a', -2, 'scheduled'),
      ],
      metrics: [],
      reads: [],
    }).get('a')!;
    assert.equal(r.due7d, 3);
    assert.equal(r.done7d, 1);
    assert.equal(r.missed7d, 2);
    assert.equal(r.adherence7d, 0.333);
  });

  it('reports null adherence for a quiet week rather than zero', () => {
    const r = rosterRollups({
      clientIds: ['a'],
      today: TODAY,
      sessions: [s('a', -1, 'scheduled')],
      metrics: [],
      reads: [],
    }).get('a')!;
    assert.equal(r.adherence7d, null);
    assert.equal(r.standing, 'on_track');
  });

  it('draws 28 days of pain with gaps and reads the trend across the window', () => {
    const sessions = [20, 17, 14, 11, 8, 5, 2].map((d, i) => s('a', d, 'completed', i < 3 ? 2 : 5));
    const r = rosterRollups({
      clientIds: ['a'],
      today: TODAY,
      sessions,
      metrics: [],
      reads: [],
    }).get('a')!;
    assert.equal(r.painSeries.length, 28);
    assert.equal(r.painSeries.at(-1)?.x, TODAY);
    assert.equal(r.painSeries.filter((p) => p.y !== null).length, 7);
    assert.equal(r.painTrend, 'worsening');
    assert.equal(r.avgPain7d, 5);
    assert.equal(r.maxPain7d, 5);
  });

  it('takes weight change across the window and the latest vitals', () => {
    const r = rosterRollups({
      clientIds: ['a'],
      today: TODAY,
      sessions: [],
      metrics: [
        { clientId: 'a', type: 'weight_kg', value: 64.2, recordedAt: '2026-08-12T07:00:00Z' },
        { clientId: 'a', type: 'weight_kg', value: 63.5, recordedAt: '2026-09-04T07:00:00Z' },
        { clientId: 'a', type: 'resting_hr', value: 58, recordedAt: '2026-09-04T07:00:00Z' },
        { clientId: 'b', type: 'resting_hr', value: 70, recordedAt: '2026-09-04T07:00:00Z' },
      ],
      reads: [],
    }).get('a')!;
    assert.equal(r.weightKg, 63.5);
    assert.equal(r.weightDelta28dKg, -0.7);
    assert.equal(r.restingHr, 58);
    assert.equal(r.hrvMs, null);
  });

  it('raises the missed-sessions and inactivity alerts and grades the standing', () => {
    const r = rosterRollups({
      clientIds: ['a'],
      today: TODAY,
      sessions: [
        s('a', 6, 'skipped'),
        s('a', 4, 'skipped'),
        s('a', 2, 'skipped'),
        s('a', 12, 'completed'),
      ],
      metrics: [],
      reads: [],
    }).get('a')!;
    assert.deepEqual(
      r.alerts.map((a) => a.kind),
      ['missed_sessions', 'inactive'],
    );
    assert.equal(r.daysSinceLastActivity, 12);
    assert.equal(r.standing, 'at_risk');
    assert.equal(standingOf([{ kind: 'high_pain', severity: 'warn', message: '' }]), 'watch');
  });

  it('counts a daily read as activity', () => {
    const r = rosterRollups({
      clientIds: ['a'],
      today: TODAY,
      sessions: [],
      metrics: [],
      reads: [
        { clientId: 'a', readOn: '2026-09-04', readiness: 3, createdAt: '2026-09-04T20:00:00Z' },
      ],
    }).get('a')!;
    assert.equal(r.daysSinceLastActivity, 1);
    assert.equal(r.readiness, 3);
  });
});
