import type { FuelCheckRow } from '@vela/api';
import {
  FUEL_BARRIER_LABEL,
  FUEL_ENOUGH_LABEL,
  FUEL_FOLLOWED_LABEL,
  FUEL_GUT_LABEL,
  summariseFuelChecks,
  type FuelBarrier,
  type FuelEnough,
} from '@vela/shared';
import { Card, StatTile, StatusPill } from '@/components/ui';

function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

const ENOUGH_TONE: Record<FuelEnough, 'good' | 'warning' | 'serious' | 'neutral'> = {
  right: 'good',
  short: 'warning',
  ran_out: 'serious',
  heavy: 'warning',
};

const short = (c: FuelCheckRow) => c.enough === 'short' || c.enough === 'ran_out';

/**
 * Her fuelling checks over the window: did she fuel as planned, was it enough, her stomach,
 * and what got in the way. Followed and enough are read together, because together they
 * say what to change — followed and short means the plan is too light, not followed and
 * short means the plan is not happening.
 */
export function FuelCheckins({
  checks,
  days,
  restrictive = false,
}: {
  checks: FuelCheckRow[];
  days: number;
  restrictive?: boolean;
}) {
  const s = summariseFuelChecks(checks);
  const title = `Fuelling check-ins · ${days} days`;

  if (s.answered === 0)
    return (
      <Card title={title}>
        <p className="text-sm ink-2">
          No check-ins yet. After a long run, a quality session or a strength day she is asked three
          taps: did she fuel as planned, was it enough for the session, and how was her stomach. Her
          answers land here and in her session history.
        </p>
      </Card>
    );

  const followedShort = checks.filter((c) => c.followed === 'yes' && short(c)).length;
  const missedShort = checks.filter((c) => c.followed && c.followed !== 'yes' && short(c)).length;
  const barriers = new Map<FuelBarrier, number>();
  for (const c of checks)
    if (c.barrier) barriers.set(c.barrier, (barriers.get(c.barrier) ?? 0) + 1);
  const pct = (n: number) => `${Math.round((n / s.answered) * 100)}%`;

  const reads: string[] = [];
  if (followedShort > 0)
    reads.push(
      `Fuelled as planned and still short on ${followedShort} session${followedShort === 1 ? '' : 's'}: ${
        restrictive
          ? 'she is flagged for restrictive patterns, so talk it through before changing the plan.'
          : 'the plan may be too light for those sessions.'
      }`,
    );
  if (missedShort > 0)
    reads.push(
      `Short when the plan did not happen on ${missedShort}: worth asking what got in the way.`,
    );
  if (s.gutHard > 0)
    reads.push(
      `Her stomach slowed her down or stopped her ${s.gutHard === 1 ? 'once' : `${s.gutHard} times`}: look at what she took, and when, before raising the carbs.`,
    );

  return (
    <Card title={title}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Fuelled as planned"
          value={`${s.followed}/${s.answered}`}
          hint={`${pct(s.followed)} · partly ${s.partly}, not ${s.missed}`}
        />
        <StatTile
          label="Felt about right"
          value={`${s.right}/${s.answered}`}
          hint={s.heavy ? `${s.heavy} sat heavy` : pct(s.right)}
        />
        <StatTile
          label="Ran short"
          value={String(s.short)}
          hint={s.ranOut ? `${s.ranOut} ran out of energy` : 'None ran out of energy'}
        />
        <StatTile
          label="Stomach trouble"
          value={String(s.gut)}
          hint={s.gutHard ? `${s.gutHard} slowed her or stopped her` : 'None that slowed her'}
        />
      </div>

      {reads.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
          {reads.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {barriers.size > 0 && (
        <p className="mt-2 text-sm ink-2">
          What got in the way:{' '}
          {[...barriers.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([b, n]) => `${FUEL_BARRIER_LABEL[b]}${n > 1 ? ` ×${n}` : ''}`)
            .join(' · ')}
        </p>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs ink-3">
              <th className="pb-2 font-medium">Date</th>
              <th className="pb-2 font-medium">Session</th>
              <th className="pb-2 font-medium">As planned</th>
              <th className="pb-2 font-medium">Enough</th>
              <th className="pb-2 font-medium">Stomach</th>
            </tr>
          </thead>
          <tbody>
            {checks.slice(0, 12).map((c) => (
              <tr key={c.sessionId} className="border-b last:border-0">
                <td className="tnum py-2.5 pr-3 whitespace-nowrap ink-2">{fmtDay(c.date)}</td>
                <td className="py-2.5 pr-3 font-medium">{c.title}</td>
                <td className="py-2.5 pr-3 whitespace-nowrap">
                  {c.followed ? FUEL_FOLLOWED_LABEL[c.followed] : '—'}
                  {c.barrier && (
                    <span className="ink-3"> · {FUEL_BARRIER_LABEL[c.barrier].toLowerCase()}</span>
                  )}
                </td>
                <td className="py-2.5 pr-3 whitespace-nowrap">
                  {c.enough ? (
                    <StatusPill tone={ENOUGH_TONE[c.enough]}>
                      {FUEL_ENOUGH_LABEL[c.enough]}
                    </StatusPill>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2.5 whitespace-nowrap">
                  {c.gut === null ? '—' : FUEL_GUT_LABEL[c.gut]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
