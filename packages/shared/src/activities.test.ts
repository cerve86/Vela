import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  disciplineForSport,
  formatDistance,
  formatDuration,
  formatPace,
  matchPlannedSession,
  paceSecPerKm,
  sportWords,
  stepsPerMinute,
} from './activities.ts';

describe('disciplineForSport', () => {
  it('files cardio under run, lifting under strength, yoga under mobility, and never rehab', () => {
    assert.equal(disciplineForSport('Run'), 'run');
    assert.equal(disciplineForSport('Ride'), 'run');
    assert.equal(disciplineForSport('Swim'), 'run');
    assert.equal(disciplineForSport('WeightTraining'), 'strength');
    assert.equal(disciplineForSport('Yoga'), 'mobility');
    assert.equal(disciplineForSport('SomethingNew'), 'run');
  });
});

describe('numbers', () => {
  it('doubles Strava run cadence into steps per minute, and leaves cycling alone', () => {
    assert.equal(stepsPerMinute('Run', 86), 172);
    assert.equal(stepsPerMinute('Ride', 86), 86);
    assert.equal(stepsPerMinute('Run', null), null);
  });
  it('computes and formats pace, refusing distances too short to mean anything', () => {
    assert.equal(formatPace(paceSecPerKm(8000, 2400)), '5:00 /km');
    assert.equal(formatPace(paceSecPerKm(10000, 3125)), '5:13 /km');
    assert.equal(paceSecPerKm(50, 600), null);
    assert.equal(paceSecPerKm(null, 600), null);
  });
  it('formats distance and duration the way a runner says them', () => {
    assert.equal(formatDistance(8420), '8.42 km');
    assert.equal(formatDistance(12345), '12.3 km');
    assert.equal(formatDistance(800), '800 m');
    assert.equal(formatDuration(1750), '29 min');
    assert.equal(formatDuration(3600), '1 h');
    assert.equal(formatDuration(4380), '1 h 13');
  });
  it('spells a sport type', () => {
    assert.equal(sportWords('TrailRun'), 'Trail run');
    assert.equal(sportWords('Run'), 'Run');
    assert.equal(sportWords('WeightTraining'), 'Weight training');
  });
});

describe('matchPlannedSession', () => {
  const sessions = [
    { id: 'a', scheduledDate: '2026-09-05', discipline: 'strength', status: 'scheduled' },
    { id: 'b', scheduledDate: '2026-09-05', discipline: 'run', status: 'completed' },
    { id: 'c', scheduledDate: '2026-09-05', discipline: 'run', status: 'scheduled' },
    { id: 'd', scheduledDate: '2026-09-06', discipline: 'run', status: 'scheduled' },
  ];
  it('finds the open run on the same local day, skipping the completed one', () => {
    assert.equal(matchPlannedSession({ sportType: 'Run', localDate: '2026-09-05' }, sessions), 'c');
  });
  it('does not fulfil a strength day with a ride, or another day with today', () => {
    assert.equal(
      matchPlannedSession({ sportType: 'Ride', localDate: '2026-09-07' }, sessions),
      null,
    );
    assert.equal(
      matchPlannedSession({ sportType: 'WeightTraining', localDate: '2026-09-05' }, sessions),
      'a',
    );
  });
});
