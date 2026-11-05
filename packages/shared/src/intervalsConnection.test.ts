import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  icuHasReading,
  icuSourceName,
  icuWithheld,
  parseIcuId,
  readIcuConnection,
} from './intervalsConnection.ts';

const stub = (date: string) => ({
  source: 'STRAVA',
  start_date_local: `${date}T07:00:00`,
  _note: 'STRAVA activities are not available via the API',
});
const garmin = (date: string) => ({ source: 'GARMIN_CONNECT', start_date_local: `${date}T06:30:00` });

describe('icuWithheld', () => {
  it('reads a Strava stub, and any activity carrying the note, as withheld', () => {
    assert.equal(icuWithheld(stub('2026-11-01')), true);
    assert.equal(icuWithheld({ source: 'GARMIN_CONNECT', _note: 'Garmin data is not available' }), true);
    assert.equal(icuWithheld(garmin('2026-11-01')), false);
    assert.equal(icuWithheld({ source: 'COROS', _note: '' }), false);
  });
});

describe('icuHasReading', () => {
  it('needs a reading, not just the fitness row intervals.icu writes on training days', () => {
    assert.equal(icuHasReading({ id: '2026-11-01' }), false);
    assert.equal(icuHasReading({ id: '2026-11-01', hrv: null, restingHR: 0 }), false);
    assert.equal(icuHasReading({ id: '2026-11-01', hrv: 62 }), true);
    assert.equal(icuHasReading({ id: '2026-11-01', sleepSecs: 25200 }), true);
  });
});

describe('readIcuConnection', () => {
  const wellness = [
    { id: '2026-10-30', hrv: 60, restingHR: 50 },
    { id: '2026-10-31', hrv: 58 },
    { id: '2026-11-01', restingHR: 51 },
    { id: '2026-11-02' },
  ];

  it('is clear when the watch sends both readings and activities', () => {
    const c = readIcuConnection({
      wellness,
      activities: [garmin('2026-10-29'), garmin('2026-11-01')],
      days: 14,
    });
    assert.equal(c.issue, null);
    assert.equal(c.hrvDays, 2);
    assert.equal(c.restingDays, 2);
    assert.deepEqual(c.shared, [{ name: 'Garmin', count: 2 }]);
    assert.equal(c.lastActivity, '2026-11-01');
    assert.equal(c.lastReading, '2026-11-01');
  });

  it('says so when every run came in through Strava, even with readings flowing', () => {
    const c = readIcuConnection({
      wellness,
      activities: [stub('2026-10-28'), stub('2026-11-01')],
      days: 14,
    });
    assert.equal(c.issue, 'withheld-only');
    assert.deepEqual(c.withheld, [{ name: 'Strava', count: 2 }]);
    assert.equal(c.sharedCount, 0);
    assert.equal(c.lastActivity, '2026-11-01');
  });

  it('flags missing wellness before a stray Strava activity', () => {
    const c = readIcuConnection({
      wellness: [{ id: '2026-11-01' }],
      activities: [garmin('2026-11-01'), stub('2026-11-02')],
      days: 14,
    });
    assert.equal(c.issue, 'no-wellness');
    assert.equal(c.withheldCount, 1);
  });

  it('mentions a few withheld activities beside ones that come through', () => {
    const c = readIcuConnection({
      wellness,
      activities: [garmin('2026-11-01'), stub('2026-11-02')],
      days: 14,
    });
    assert.equal(c.issue, 'some-withheld');
  });

  it('notes a quiet month', () => {
    assert.equal(readIcuConnection({ wellness, activities: [], days: 14 }).issue, 'no-activities');
  });
});

describe('icuSourceName', () => {
  it('names devices the way athletes do', () => {
    assert.equal(icuSourceName('ZEPP'), 'Amazfit');
    assert.equal(icuSourceName('GARMIN_CONNECT'), 'Garmin');
    assert.equal(icuSourceName('SOMETHING_NEW'), 'another app');
  });
});

describe('parseIcuId', () => {
  it('takes the id, an older all-digit id, or an intervals.icu link', () => {
    assert.equal(parseIcuId('i12345'), 'i12345');
    assert.equal(parseIcuId('  I12345 '), 'i12345');
    assert.equal(parseIcuId('2049151'), '2049151');
    assert.equal(parseIcuId('https://intervals.icu/athlete/i98765/calendar'), 'i98765');
    assert.equal(parseIcuId('intervals.icu/athlete/i98765'), 'i98765');
  });
  it('refuses anything else', () => {
    assert.equal(parseIcuId(''), null);
    assert.equal(parseIcuId('jane@example.com'), null);
    assert.equal(parseIcuId('i12/../x'), null);
    assert.equal(parseIcuId('https://example.com/athlete/i123'), null);
  });
});
