import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CHALLENGE_METRICS, challengeWeekNow } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Avatar, Card, StatTile } from '@/components/ui';
import { loadChallengeDashboard } from '../actions';

export const metadata = { title: 'Challenge — Vela' };

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { challenge, weeks, board, standing } = await loadChallengeDashboard(id);
  if (!challenge) notFound();

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

        <Card title="Participation">
          <div className="flex flex-col gap-3">
            {board.map((p) => {
              const pct = p.target > 0 ? Math.min(100, Math.round((p.done / p.target) * 100)) : 0;
              return (
                <div key={p.clientId} className="flex items-center gap-3">
                  <Avatar name={p.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--ghost)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: palette.brand[600] }}
                      />
                    </div>
                  </div>
                  <span className="tnum text-xs ink-2">
                    {p.done}/{p.target}
                  </span>
                </div>
              );
            })}
            {board.length === 0 && (
              <p className="text-sm ink-2">
                Nobody is enrolled yet. The challenge exists but has no participants — add
                some from the list.
              </p>
            )}
          </div>

          <p className="mt-4 text-[11px] ink-3">
            Ordered by participation, not performance. Nobody is ranked on pain, weight or
            load — and none of these names is visible to the other participants, who see the
            group total and their own share only.
          </p>
        </Card>
      </div>
    </div>
  );
}
