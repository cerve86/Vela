import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  asPlainText,
  eventSignature,
  icuDescription,
  icuEventFor,
  icuSportType,
  planIntervalsSync,
  plannedSeconds,
  pushWindow,
  type PushSession,
  type TrackedEvent,
} from './intervalsPush.ts';

const URL = 'https://www.vela-coaching.com/companion';
const NOW = Date.parse('2026-11-09T08:00:00Z');

const session = (id: string, date: string, over: Partial<PushSession> = {}): PushSession => ({
  id,
  title: 'Easy run',
  discipline: 'run',
  scheduledDate: date,
  status: 'scheduled',
  dayNotes: null,
  watchSteps: null,
  items: [],
  ...over,
});

const row = (s: PushSession, icuId: string, over: Partial<TrackedEvent> = {}): TrackedEvent => ({
  sessionId: s.id,
  icuAthleteId: icuId,
  icuEventId: 100,
  eventDate: s.scheduledDate,
  signature: eventSignature(icuEventFor(s, URL), icuId),
  syncedAt: '2026-11-08T08:00:00Z',
  ...over,
});

const plan = (over: Partial<Parameters<typeof planIntervalsSync>[0]>) =>
  planIntervalsSync({
    sending: true,
    icuId: 'i123',
    sessions: [],
    tracked: [],
    windowStart: '2026-11-08',
    now: NOW,
    companionUrl: URL,
    ...over,
  });

describe('icuSportType', () => {
  it('maps disciplines, and reads a cross-training day by its title', () => {
    assert.equal(icuSportType('run', 'Long run'), 'Run');
    assert.equal(icuSportType('strength', 'Gym Day 1'), 'WeightTraining');
    assert.equal(icuSportType('mobility', 'Hips'), 'Workout');
    assert.equal(icuSportType('rehab', 'Pelvic floor'), 'Workout');
    assert.equal(icuSportType('cross', 'Pre-swim set + pool'), 'Swim');
    assert.equal(icuSportType('cross', 'Spin 45'), 'Ride');
    assert.equal(icuSportType('cross', 'Hike with poles'), 'Hike');
    assert.equal(icuSportType('cross', 'Brisk walk'), 'Walk');
    assert.equal(icuSportType('cross', 'Anything else'), 'Workout');
  });
});

describe('asPlainText', () => {
  it('turns bullets and repeat markers into text intervals.icu will not parse as steps', () => {
    assert.equal(
      asPlainText('- 10 min easy\n  * strides\n3x\nkeep it chatty'),
      '• 10 min easy\n  • strides\n3 times\nkeep it chatty',
    );
  });
});

describe('icuDescription', () => {
  it('puts notes, movements and the way back to Vela first, and the watch steps last', () => {
    const s = session('a', '2026-11-10', {
      dayNotes: '- Warm up well',
      watchSteps: '- 10m Z2 HR\n4x\n- 3m Z4 HR\n- 2m Z1 HR',
      items: [
        {
          block: 'A',
          exerciseName: 'Calf raise',
          sets: 3,
          reps: '15',
          targetLoadKg: 10,
          targetRpe: null,
          tempo: null,
          restSec: 60,
          notes: null,
        },
      ],
    });
    assert.equal(
      icuDescription(s, URL),
      '• Warm up well\n\nA. Calf raise — 3 × 15, 10 kg, rest 60s\n\n' +
        `From your Vela plan: ${URL}\n\n- 10m Z2 HR\n4x\n- 3m Z4 HR\n- 2m Z1 HR`,
    );
  });
});

describe('icuEventFor', () => {
  it('is a workout on her date, labelled with the session id', () => {
    const e = icuEventFor(
      session('abc', '2026-11-10', { title: 'Gym Day 1', discipline: 'strength' }),
      URL,
    );
    assert.equal(e.category, 'WORKOUT');
    assert.equal(e.start_date_local, '2026-11-10T00:00:00');
    assert.equal(e.type, 'WeightTraining');
    assert.equal(e.name, 'Gym Day 1');
    assert.equal(e.external_id, 'vela-abc');
    assert.equal(e.moving_time, undefined);
  });

  it('carries planned minutes from the notes, and clears them when steps say how long', () => {
    assert.equal(plannedSeconds('60 min · 8.1 km\nTalk test'), 3600);
    assert.equal(plannedSeconds('Easy, about 60 min'), undefined);
    assert.equal(
      icuEventFor(session('a', '2026-11-10', { dayNotes: '45 min' }), URL).moving_time,
      2700,
    );
    assert.equal(
      icuEventFor(
        session('a', '2026-11-10', { dayNotes: '45 min', watchSteps: '- 45m Z2 HR' }),
        URL,
      ).moving_time,
      null,
    );
  });
});

describe('planIntervalsSync', () => {
  const tue = session('tue', '2026-11-10');
  const thu = session('thu', '2026-11-12', { title: 'Tempo' });

  it('creates every scheduled session the first time', () => {
    const p = plan({ sessions: [tue, thu] });
    assert.deepEqual(
      p.create.map((c) => c.sessionId),
      ['tue', 'thu'],
    );
    assert.equal(p.update.length + p.remove.length, 0);
  });

  it('sends nothing again when nothing changed', () => {
    const p = plan({ sessions: [tue, thu], tracked: [row(tue, 'i123'), row(thu, 'i123')] });
    assert.equal(p.unchanged, 2);
    assert.equal(p.create.length + p.update.length + p.remove.length, 0);
  });

  it('updates a session that moved or changed', () => {
    const moved = { ...thu, scheduledDate: '2026-11-13' };
    const p = plan({ sessions: [tue, moved], tracked: [row(tue, 'i123'), row(thu, 'i123')] });
    assert.deepEqual(
      p.update.map((u) => [u.sessionId, u.icuEventId, u.date]),
      [['thu', 100, '2026-11-13']],
    );
  });

  it('removes the event of a session that went, and of one she skipped', () => {
    const skipped = { ...tue, status: 'skipped' as const };
    const p = plan({ sessions: [skipped], tracked: [row(tue, 'i123'), row(thu, 'i123')] });
    assert.deepEqual(p.remove.map((r) => r.sessionId).sort(), ['thu', 'tue']);
  });

  it('keeps the event of a session she did, and forgets past ones without deleting them', () => {
    const done = { ...tue, status: 'completed' as const };
    const old = session('old', '2026-11-01');
    const p = plan({ sessions: [done], tracked: [row(tue, 'i123'), row(old, 'i123')] });
    assert.equal(p.remove.length, 0);
    assert.deepEqual(p.forget, ['old']);
  });

  it('takes every upcoming event off when sending stops, or when she is unlinked', () => {
    for (const over of [{ sending: false }, { icuId: null }]) {
      const done = { ...tue, status: 'completed' as const };
      const p = plan({
        ...over,
        sessions: [done, thu],
        tracked: [row(tue, 'i123'), row(thu, 'i123')],
      });
      assert.equal(p.create.length, 0);
      assert.deepEqual(p.remove.map((r) => r.sessionId).sort(), ['thu', 'tue']);
    }
  });

  it('moves the events when she is relinked to another intervals.icu athlete', () => {
    const p = plan({ icuId: 'i999', sessions: [tue], tracked: [row(tue, 'i123')] });
    assert.deepEqual(p.remove, [{ sessionId: 'tue', icuAthleteId: 'i123', icuEventId: 100 }]);
    assert.deepEqual(
      p.create.map((c) => [c.sessionId, c.retry]),
      [['tue', false]],
    );
  });

  it('leaves a fresh claim alone and retries a stale one', () => {
    const fresh = row(tue, 'i123', { icuEventId: null, syncedAt: '2026-11-09T07:59:30Z' });
    assert.equal(plan({ sessions: [tue], tracked: [fresh] }).create.length, 0);
    const stale = row(tue, 'i123', { icuEventId: null, syncedAt: '2026-11-09T07:50:00Z' });
    assert.deepEqual(
      plan({ sessions: [tue], tracked: [stale] }).create.map((c) => c.retry),
      [true],
    );
  });
});

describe('pushWindow', () => {
  it('runs from yesterday to nine weeks ahead', () => {
    assert.deepEqual(pushWindow(NOW), { from: '2026-11-08', to: '2027-01-11' });
  });
});
