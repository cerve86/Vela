import { notFound } from 'next/navigation';
import {
  METRIC_META,
  listMetrics,
  listSessions,
  type MetricType,
  type ScheduledSession,
} from '@vela/api';
import { adherenceBand } from '@vela/shared';
import { adherenceStyle } from '@vela/shared/tokens';
import { Card, PainDot, StatTile, StatusPill } from '@/components/ui';
import { Meter, TimeSeriesPanels, type Panel } from '@/components/charts';
import { dateWindow } from '@/lib/series';
import { createServerSupabase } from '@/lib/supabase/server';

const VITALS: MetricType[] = ['weight_kg', 'resting_hr', 'hrv_ms', 'steps'];

/** ISO date `n` days before today, UTC — the same basis as `dateWindow`. */
function daysBack(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Full timestamp `n` days back, for `recorded_at` comparisons. */
function sinceTimestamp(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

/**
 * Sessions that have already come due: everything before today, plus anything she has
 * finished or explicitly skipped. Work still ahead of her is not a miss — the app scores
 * her week the same way, and the two views disagreeing would be worse than either.
 */
function adherenceOver(sessions: ScheduledSession[], since: string, todayIso: string) {
  const window = sessions.filter((s) => s.scheduledDate >= since);
  const due = window.filter(
    (s) => s.scheduledDate < todayIso || s.status === 'completed' || s.status === 'skipped',
  );
  const completed = due.filter((s) => s.status === 'completed').length;
  return { completed, due: due.length, ratio: due.length === 0 ? 0 : completed / due.length };
}

export default async function ClientOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: client } = await supabase
    .from('clients')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!client) notFound();

  const todayIso = new Date().toISOString().slice(0, 10);
  const since28 = daysBack(27);

  const [sessions, metrics] = await Promise.all([
    listSessions(supabase, { clientId: id, from: since28 }),
    listMetrics(supabase, { clientId: id, types: VITALS, since: sinceTimestamp(28) }),
  ]);

  const week = adherenceOver(sessions, daysBack(6), todayIso);
  const band = adherenceBand(week.ratio);

  // Pain lives on the session, so it is real today. Volume load needs set-by-set logs,
  // which arrive with the Phase 3 offline outbox — until then the panel would be an
  // empty axis pretending to be a measurement, so it is not drawn.
  const painScores = sessions
    .filter((s) => s.scheduledDate >= daysBack(6) && s.painAfter !== null)
    .map((s) => s.painAfter as number);
  const avgPain =
    painScores.length === 0
      ? null
      : Math.round((painScores.reduce((a, b) => a + b, 0) / painScores.length) * 10) / 10;

  const latest = (type: MetricType) => {
    const of = metrics.filter((m) => m.type === type);
    return of.length ? of[of.length - 1]! : null;
  };

  const weights = metrics.filter((m) => m.type === 'weight_kg');
  const weightDelta =
    weights.length >= 2
      ? Math.round((weights[weights.length - 1]!.value - weights[0]!.value) * 10) / 10
      : null;

  const xLabels = dateWindow(28);
  const painByDate = new Map(
    sessions.filter((s) => s.painAfter !== null).map((s) => [s.scheduledDate, s.painAfter as number]),
  );
  const painPanel: Panel[] = [
    {
      id: 'pain',
      label: 'Reported pain after session (0–10)',
      domain: [0, 10],
      height: 150,
      format: { style: 'fixed', decimals: 0 },
      series: [
        {
          id: 'pain',
          label: 'Pain',
          color: 'var(--series-2)',
          kind: 'line',
          points: xLabels.map((d) => ({ x: d, y: painByDate.get(d) ?? null })),
          connectGaps: true,
        },
      ],
    },
  ];

  const recent = sessions
    .filter((s) => s.status !== 'scheduled' || s.scheduledDate < todayIso)
    .slice(-6)
    .reverse();

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatTile
          label="Adherence · 7 days"
          value={week.due === 0 ? '—' : `${Math.round(week.ratio * 100)}%`}
          hint={
            week.due === 0
              ? 'Nothing due yet this week'
              : `${week.completed} of ${week.due} sessions`
          }
        />
        <StatTile
          label="Avg pain after · 7 days"
          value={avgPain === null ? '—' : String(avgPain)}
          unit={avgPain === null ? undefined : '/10'}
          hint={painScores.length === 0 ? 'No sessions logged yet' : `${painScores.length} logged`}
        />
        <StatTile
          label="Weight · 28 days"
          value={latest('weight_kg') ? latest('weight_kg')!.value.toFixed(1) : '—'}
          unit="kg"
          delta={weightDelta === null ? undefined : `${weightDelta > 0 ? '+' : ''}${weightDelta} kg`}
          // Postpartum, and possibly breastfeeding: a fall is not automatically good, so
          // the delta is shown without a value judgement.
          deltaGood={undefined}
        />
        <StatTile
          label="Readings · 28 days"
          value={String(metrics.length)}
          hint="From Apple Health and manual entries"
        />
      </div>

      <Card title="Reported pain" action={<span className="text-xs ink-3">Last 28 days</span>}>
        {painByDate.size === 0 ? (
          // An empty 0–10 axis reads like something failed to load. Say what is actually
          // true: she has not finished a session yet, so there is no score to plot.
          <p className="text-sm ink-2">
            No pain scores yet. Each session she finishes records one before and one after,
            and the gap between them is what tells you whether the load is right.
          </p>
        ) : (
          <>
            <TimeSeriesPanels xLabels={xLabels} panels={painPanel} />
            <p className="mt-2 text-xs ink-3">
              Training volume load joins this timeline once set-by-set logs sync in Phase 3.
            </p>
          </>
        )}
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card title="This week" className="col-span-1">
          <div className="space-y-4">
            <Meter
              value={week.ratio}
              color={adherenceStyle[band].color}
              label="Session adherence"
              valueLabel={week.due === 0 ? '—' : `${week.completed}/${week.due}`}
            />
            <div className="border-t pt-3">
              <div className="text-xs ink-2">Scheduled in the last 7 days</div>
              <div className="tnum text-lg font-semibold">
                {sessions.filter((s) => s.scheduledDate >= daysBack(6) && s.scheduledDate <= todayIso).length}
              </div>
            </div>
            <div>
              <div className="text-xs ink-2">Last completed session</div>
              <div className="text-sm">
                {(() => {
                  const last = sessions.filter((s) => s.status === 'completed').at(-1);
                  return last
                    ? new Date(`${last.scheduledDate}T00:00:00Z`).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        timeZone: 'UTC',
                      })
                    : 'None yet';
                })()}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Recent sessions" className="col-span-2">
          {recent.length === 0 ? (
            <p className="text-sm ink-2">Nothing scheduled in the last 28 days.</p>
          ) : (
            <ul className="divide-y">
              {recent.map((s) => (
                <li key={s.id} className="flex items-center gap-4 py-2.5">
                  <div className="w-24 shrink-0">
                    <div className="tnum text-sm">
                      {new Date(`${s.scheduledDate}T00:00:00Z`).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'UTC',
                      })}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{s.title}</div>
                  </div>
                  <div className="w-20 shrink-0">
                    <PainDot score={s.painAfter} />
                  </div>
                  <div className="w-24 shrink-0 text-right">
                    {s.status === 'completed' ? (
                      <StatusPill tone="good">Completed</StatusPill>
                    ) : s.status === 'skipped' ? (
                      <StatusPill tone="warning">Skipped</StatusPill>
                    ) : (
                      <StatusPill tone="critical">Missed</StatusPill>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Latest vitals">
        <div className="grid grid-cols-4 gap-3">
          {VITALS.map((type) => {
            const m = latest(type);
            const meta = METRIC_META[type];
            return (
              <div key={type}>
                <div className="text-xs ink-2">{meta.label}</div>
                <div className="tnum mt-0.5 text-lg font-semibold">
                  {m
                    ? m.value.toLocaleString('en-GB', {
                        minimumFractionDigits: meta.decimals,
                        maximumFractionDigits: meta.decimals,
                      })
                    : '—'}
                  {meta.unit && <span className="ml-1 text-xs font-normal ink-3">{meta.unit}</span>}
                </div>
                {m && (
                  <div className="mt-0.5 text-xs ink-3">
                    {m.source === 'healthkit'
                      ? 'Apple Health'
                      : m.source === 'manual'
                        ? 'Manual'
                        : 'Coach'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
