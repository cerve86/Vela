import type { Activity, StravaLink } from '@vela/api';
import {
  formatDistance,
  formatDuration,
  formatPace,
  paceSecPerKm,
  sportWords,
  stepsPerMinute,
} from '@vela/shared';
import { Card } from '@/components/ui';

const STRAVA_ORANGE = '#FC4C02';

/**
 * What her watch recorded, next to what the plan asked for.
 *
 * The columns are the ones a physiotherapist reads off a run: how far, how long, at what
 * pace, at what heart rate, and the two mechanical numbers that say something about
 * form — cadence, in steps per minute rather than Strava's one-foot count, and running
 * power where the device reports it. A dash is an absence, never a zero.
 */
export function ActivitiesCard({
  activities,
  link,
}: {
  activities: Activity[];
  link: StravaLink | null;
}) {
  const action = link ? (
    <span className="flex items-center gap-1.5 text-xs ink-3">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: STRAVA_ORANGE }}
        aria-hidden
      />
      Strava · {link.athleteName ?? `athlete ${link.athleteId}`}
      {link.lastSyncedAt ? ` · synced ${sinceWords(link.lastSyncedAt)}` : ''}
    </span>
  ) : (
    <span className="text-xs ink-3">Not connected to Strava</span>
  );

  return (
    <Card title="Recorded activities" action={action}>
      {activities.length === 0 ? (
        <p className="text-sm ink-2">
          {link
            ? 'Nothing imported yet. New activities arrive as she records them.'
            : 'She can connect Strava from Profile in the app; runs and rides then land here, with cadence, power and heart rate.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs ink-3">
                <th className="pb-2 font-medium">Date</th>
                <th className="pb-2 font-medium">Activity</th>
                <th className="pb-2 font-medium">Distance</th>
                <th className="pb-2 font-medium">Time</th>
                <th className="pb-2 font-medium">Pace</th>
                <th className="pb-2 font-medium">Avg HR</th>
                <th className="pb-2 font-medium">Cadence</th>
                <th className="pb-2 font-medium">Power</th>
                <th className="pb-2 font-medium">Climb</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => {
                const spm = stepsPerMinute(a.sportType, a.avgCadence);
                const pace = formatPace(paceSecPerKm(a.distanceM, a.movingSec));
                return (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="tnum py-2.5 whitespace-nowrap">
                      {new Date(`${a.localDate}T00:00:00Z`).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'UTC',
                      })}
                    </td>
                    <td className="py-2.5">
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs ink-3">
                        {sportWords(a.sportType)}
                        {a.sessionId ? ' · counted as a session' : ''}
                      </div>
                    </td>
                    <td className="tnum py-2.5">{formatDistance(a.distanceM) ?? '—'}</td>
                    <td className="tnum py-2.5">{formatDuration(a.movingSec)}</td>
                    <td className="tnum py-2.5">{pace ?? '—'}</td>
                    <td className="tnum py-2.5">
                      {a.avgHr !== null ? `${Math.round(a.avgHr)}` : '—'}
                      {a.maxHr !== null && (
                        <span className="text-xs ink-3"> / {Math.round(a.maxHr)}</span>
                      )}
                    </td>
                    <td className="tnum py-2.5">{spm !== null ? `${spm} spm` : '—'}</td>
                    <td className="tnum py-2.5">
                      {a.avgWatts !== null ? `${Math.round(a.avgWatts)} W` : '—'}
                      {a.weightedWatts !== null && (
                        <span className="text-xs ink-3"> · NP {Math.round(a.weightedWatts)}</span>
                      )}
                    </td>
                    <td className="tnum py-2.5">
                      {a.elevationGainM !== null ? `${Math.round(a.elevationGainM)} m` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function sinceWords(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
