/**
 * Recorded workouts from outside the app — the arithmetic and the words.
 *
 * Pure, and written against a source-neutral shape: Strava is the first source, not the
 * last, and nothing here knows a Strava field name. The one Strava-specific fact worth
 * stating lives in `stepsPerMinute`, because it is the kind of thing a reader would
 * otherwise get wrong in silence.
 */

export type ActivityDiscipline = 'run' | 'strength' | 'mobility';

export interface ActivityLike {
  sportType: string;
  distanceM: number | null;
  movingSec: number;
  avgCadence: number | null;
}

const RUN_SPORTS = new Set([
  'Run',
  'TrailRun',
  'VirtualRun',
  'Walk',
  'Hike',
  'Ride',
  'VirtualRide',
  'Swim',
  'Elliptical',
  'StairStepper',
  'Rowing',
  'NordicSki',
  'Snowshoe',
]);
const STRENGTH_SPORTS = new Set([
  'WeightTraining',
  'Crossfit',
  'HighIntensityIntervalTraining',
  'Workout',
]);
const MOBILITY_SPORTS = new Set(['Yoga', 'Pilates']);

/**
 * Which of the programme's disciplines an activity counts towards.
 *
 * The programme only knows strength, run, mobility and rehab; a bike ride or a swim is
 * cardiovascular work and so files under "run", which is what the plan calls its
 * cardio day. Nothing external ever counts as rehab — that is prescribed, never
 * recorded.
 */
export function disciplineForSport(sportType: string): ActivityDiscipline {
  if (STRENGTH_SPORTS.has(sportType)) return 'strength';
  if (MOBILITY_SPORTS.has(sportType)) return 'mobility';
  if (RUN_SPORTS.has(sportType)) return 'run';
  return 'run';
}

/** Strava reports run cadence as one foot's revolutions per minute; a runner counts both. */
export function stepsPerMinute(sportType: string, avgCadence: number | null): number | null {
  if (avgCadence === null) return null;
  return ['Run', 'TrailRun', 'VirtualRun', 'Walk', 'Hike'].includes(sportType)
    ? Math.round(avgCadence * 2)
    : Math.round(avgCadence);
}

export function paceSecPerKm(distanceM: number | null, movingSec: number): number | null {
  if (distanceM === null || distanceM < 100 || movingSec <= 0) return null;
  return movingSec / (distanceM / 1000);
}

export function formatPace(secPerKm: number | null): string | null {
  if (secPerKm === null || !Number.isFinite(secPerKm)) return null;
  const total = Math.round(secPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')} /km`;
}

export function formatDistance(distanceM: number | null): string | null {
  if (distanceM === null) return null;
  if (distanceM < 1000) return `${Math.round(distanceM)} m`;
  const km = distanceM / 1000;
  return `${km >= 10 ? km.toFixed(1) : km.toFixed(2).replace(/0$/, '')} km`;
}

export function formatDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${String(rest).padStart(2, '0')}`;
}

/** The words for a sport type as Strava spells it: "TrailRun" → "Trail run". */
export function sportWords(sportType: string): string {
  const spaced = sportType.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export interface PlannedSessionLike {
  id: string;
  scheduledDate: string;
  discipline: string;
  status: string;
}

/**
 * The planned session an activity fulfils, if any.
 *
 * Same local date, same discipline, not yet completed. The date is the athlete's, not
 * UTC: a run at 23:30 in Rome completes that day's plan, not tomorrow's. If two sessions
 * qualify the earlier one in the list wins, which is the order they were scheduled in.
 */
export function matchPlannedSession(
  activity: { sportType: string; localDate: string },
  sessions: PlannedSessionLike[],
): string | null {
  const discipline = disciplineForSport(activity.sportType);
  const match = sessions.find(
    (s) =>
      s.scheduledDate === activity.localDate &&
      s.discipline === discipline &&
      (s.status === 'scheduled' || s.status === 'in_progress'),
  );
  return match?.id ?? null;
}
