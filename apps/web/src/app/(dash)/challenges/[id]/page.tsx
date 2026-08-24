import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CHALLENGE_METRICS, challengeWeekNow } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Card, StatTile } from '@/components/ui';
import { loadChallengeDashboard } from '../actions';
import { loadAssignableClients } from '../../programs/actions';
import { Participants } from './Participants';

export const metadata = { title: 'Challenge — Vela' };

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ challenge, weeks, board, standing }, clients] = await Promise.all([
    loadChallengeDashboard(id),
    loadAssignableClients(),
  ]);
  if (!challenge) notFound();

  // Her active clients who are not already in it. Offering somebody already enrolled would
  // fail on the primary key and read as a bug rather than as a duplicate.
  const enrolled = new Set(board.map((p) => p.clientId));
  const eligible = clients.filter((c) => !enrolled.has(c.id));

  const today = new Date().toISOString().slice(0, 10);
  const week = challengeWeekNow(challenge.startsOn, challenge.weeks, today);
  const metric = CHALLENGE_METRICS.find((m) => m.value === challenge.metric);
  const noun = challenge.metric === 'fuel_days' ? 'days' : 'sessions';

  // Weeks that have not happened yet are not misses. Counting them would make every
  // challenge look failing on day one.
  const elapsed = week ?? 0;
  const soFar = weeks.filter((w) => w.weekNo <= elapsed);
  const onTrack = board.filter((p) => p.done >= (p.target / challenge.weeks) * Math.max(1, elapsed));
  const started = board.filter((p) => p.done > 0);

  const weekTarget = weeks[0]?.target ?? 0;
  const peak = Math.max(weekTarget, ...weeks.map((w) => w.total), 1);

  return (
    <div className="mx-auto max-w-6xl p-8">
      <Link href="/challenges" className="text-xs font-medium" style={{ color: palette.brand[600] }}>
        ← All challenges
      </Link>

      <header className="mt-3 mb-6">
        <h1 className="text-[30px] font-extrabold">{challenge.name}</h1>
        {challenge.summary && <p className="mt-0.5 text-sm ink-2">{challenge.summary}</p>}
        <p className="mt-1.5 text-xs ink-3">
          {metric?.label} · {week === null ? `starts ${challenge.startsOn}` : `week ${week} of ${challenge.weeks}`} ·{' '}
          {challenge.weeklyTarget} a week each
        </p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={`Group ${noun}`}
          value={String(standing?.groupTotal ?? 0)}
          hint={`of ${standing?.groupTarget ?? 0} across ${standing?.participants ?? 0} people`}
        />
        <StatTile
          label="Started"
          value={String(started.length)}
          hint={
            started.length === board.length && board.length > 0
              ? 'Everyone has logged at least once'
              : `${board.length - started.length} yet to log anything`
          }
        />
        <StatTile
          label="On track"
          value={String(onTrack.length)}
          hint={`of ${board.length}, at or above their own pace`}
        />
        <StatTile
          label="Weeks in"
          value={String(elapsed)}
          hint={`${challenge.weeks - elapsed} to go`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card title="Group total, week by week">
          <p className="-mt-1 mb-4 text-xs ink-3">
            Everyone&apos;s {noun} combined. The dashed line is the weekly group target.
          </p>

          {/* Bars in a scroll container: a 26-week challenge must not stretch the page. */}
          <div className="overflow-x-auto">
            <div className="flex min-w-full items-end gap-2" style={{ height: 150 }}>
              {weeks.map((w) => {
                const future = w.weekNo > elapsed;
                const h = Math.round((w.total / peak) * 116);
                return (
                  <div key={w.weekNo} className="flex min-w-8 flex-1 flex-col items-center gap-1.5">
                    <div className="relative flex w-full items-end justify-center" style={{ height: 122 }}>
                      {/* The target line, drawn per bar so it survives the scroll. */}
                      <div
                        className="absolute w-full border-t border-dashed"
                        style={{
                          bottom: Math.round((weekTarget / peak) * 116),
                          borderColor: palette.status.good,
                        }}
                      />
                      <div
                        className="w-full rounded-t-[6px]"
                        style={{
                          height: Math.max(w.total > 0 ? 4 : 0, h),
                          background: future
                            ? 'var(--ghost)'
                            : w.total >= w.target
                              ? palette.status.good
                              : palette.brand[600],
                        }}
                        title={`Week ${w.weekNo}: ${w.total} of ${w.target}`}
                      />
                    </div>
                    <span className="text-[10px] ink-3">{w.weekNo}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <p className="mt-3 text-[11px] ink-3">
            Weekly group target — {weekTarget} {noun}. Green means the group cleared it;
            pale bars are weeks that have not happened yet.
            {soFar.length === 0 && ' Nothing to show until the first week is underway.'}
          </p>
        </Card>

        <Participants
          challengeId={challenge.id}
          board={board}
          eligible={eligible}
          weeks={challenge.weeks}
          weeklyTarget={challenge.weeklyTarget}
          noun={noun}
        />
      </div>
    </div>
  );
}
