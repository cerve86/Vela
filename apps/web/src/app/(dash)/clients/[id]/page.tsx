import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TriangleAlert } from 'lucide-react';
import {
  METRIC_META,
  listDailyReads,
  listMetrics,
  listSessions,
  type MetricType,
  type ScheduledSession,
} from '@vela/api';
import { adherenceBand, painLabel, tide } from '@vela/shared';
import { adherenceStyle, palette } from '@vela/shared/tokens';
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

  const [sessions, metrics, reads] = await Promise.all([
    listSessions(supabase, { clientId: id, from: since28 }),
    listMetrics(supabase, { clientId: id, types: VITALS, since: sinceTimestamp(28) }),
    listDailyReads(supabase, { clientId: id, from: daysBack(6) }),
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
  const beforeByDate = new Map(
    sessions
      .filter((s) => s.painBefore !== null)
      .map((s) => [s.scheduledDate, s.painBefore as number]),
  );

  /**
   * Both halves of the pair, on one axis.
   *
   * Plotting only the after-score was the weaker chart: 4/10 after means one thing when she
   * started at 2 and something else entirely when she started at 5. The gap is the reading,
   * so both lines are drawn and the eye does the subtraction.
   *
   * The two colours are the pair already validated for this app in both light and dark —
   * blue against pink, which clears CVD separation and the normal-vision floor. Two series
   * also means the panel renders its legend, so identity never rests on colour alone.
   */
  const painPanel: Panel[] = [
    {
      id: 'pain',
      label: 'Symptoms before and after each session (0–10)',
      domain: [0, 10],
      height: 160,
      format: { style: 'fixed', decimals: 0 },
      series: [
        {
          id: 'before',
          label: 'Before',
          color: 'var(--series-1)',
          kind: 'line',
          points: xLabels.map((d) => ({ x: d, y: beforeByDate.get(d) ?? null })),
          connectGaps: true,
        },
        {
          id: 'after',
          label: 'After',
          // Slot 2 is the validated partner for slot 1 now, so a page no longer has to
          // reach past the order to find a pair that separates. See tokens.ts `series`.
          color: 'var(--series-2)',
          kind: 'line',
          points: xLabels.map((d) => ({ x: d, y: painByDate.get(d) ?? null })),
          connectGaps: true,
        },
      ],
    },
  ];

  /**
   * The one thing worth surfacing above everything else, or nothing at all.
   *
   * Derived only from columns that exist: a high score after a session, a score that rose
   * sharply across one, or a run of missed work. The symptom flag the prototype leans on
   * ("she flagged heaviness") is not stored yet — it lives in the daily read on the device
   * — so it is not claimed here.
   */
  const alert = (() => {
    /**
     * A blocking symptom outranks everything else on this page.
     *
     * This is the signal the prototype's banner was built around and the one the screen
     * could not use until daily_reads existed. Heaviness, dragging or leaking means the app
     * withdrew her impact work on its own — the coach needs to know that happened, and why,
     * before she reads a single adherence figure.
     */
    const blocking = reads.filter((r) =>
      ['Heaviness', 'Dragging', 'Leaking'].includes(r.symptom),
    );
    if (blocking.length > 0) {
      const latest = blocking[blocking.length - 1]!;
      return {
        tone: 'critical' as const,
        title: `Needs your eye — she reported ${latest.symptom.toLowerCase()}`,
        body: `Logged on her ${latest.window} read${
          blocking.length > 1 ? `, and on ${blocking.length - 1} other read${blocking.length > 2 ? 's' : ''} this week` : ''
        }. The app withdrew the impact work for that day on its own. Readiness was ${tide[latest.readiness]?.label.toLowerCase() ?? 'unrecorded'}.`,
      };
    }

    const finished = sessions
      .filter((s) => s.status === 'completed' && s.painAfter !== null)
      .sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1));
    const last = finished[0];

    if (last && (last.painAfter as number) >= 6) {
      return {
        tone: 'critical' as const,
        title: `Needs your eye — ${last.painAfter}/10 after ${last.title}`,
        body: `She finished the session and reported ${painLabel(last.painAfter as number).toLowerCase()} symptoms afterwards${
          last.painBefore !== null ? `, from ${last.painBefore}/10 before` : ''
        }. Worth a look before the next one is due.`,
      };
    }

    if (last && last.painBefore !== null && (last.painAfter as number) - last.painBefore >= 3) {
      return {
        tone: 'warning' as const,
        title: 'Symptoms rose sharply during her last session',
        body: `${last.painBefore}/10 before, ${last.painAfter}/10 after ${last.title}. The absolute number is fine; the jump is the part worth reading.`,
      };
    }

    const missed = sessions.filter(
      (s) => s.scheduledDate < todayIso && s.status === 'scheduled' && s.scheduledDate >= daysBack(13),
    );
    if (missed.length >= 2) {
      return {
        tone: 'warning' as const,
        title: `${missed.length} sessions passed without being logged`,
        body: 'Could be a quiet fortnight, could be something she has not said. A message is usually quicker than guessing.',
      };
    }

    return null;
  })();

  /**
   * Slots filled, not entries logged.
   *
   * Counting rows gave "50 of 28 slots", which is not a typo so much as two different
   * measures wearing one label — a slot holds as many entries as she cares to add, so the
   * numerator outran its own denominator. What the panel is asking is how many of the
   * week's 28 meal slots got anything at all.
   */
  const { data: mealRows } = await supabase
    .from('food_logs')
    .select('logged_on, meal')
    .eq('client_id', id)
    .gte('logged_on', daysBack(6));

  const mealsLogged = new Set((mealRows ?? []).map((m) => `${m.logged_on}:${m.meal}`)).size;

  const recent = sessions
    .filter((s) => s.status !== 'scheduled' || s.scheduledDate < todayIso)
    .slice(-6)
    .reverse();

  return (
    <div className="space-y-4">
      {alert && (
        <div
          className="surface flex items-center gap-4 rounded-[22px] p-6"
          style={{ background: 'var(--surface)' }}
        >
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: 'var(--ghost)' }}
          >
            <TriangleAlert
              size={20}
              strokeWidth={2.2}
              aria-hidden
              style={{
                color:
                  alert.tone === 'critical' ? palette.status.critical : palette.status.warning,
              }}
            />
          </span>
          <div className="min-w-0 flex-1">
            <div className="display-face text-lg font-semibold">{alert.title}</div>
            <p className="mt-0.5 text-sm ink-2">{alert.body}</p>
          </div>
          <Link
            href={`/clients/${id}/training`}
            className="display-face shrink-0 rounded-full px-4 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-px"
            style={{ background: palette.brand[600] }}
          >
            Review sessions
          </Link>
        </div>
      )}

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

      <Card title="Symptoms" action={<span className="text-xs ink-3">Last 28 days</span>}>
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
              The gap between the two lines is the reading, not either number on its own.
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
            <div className="border-t pt-3">
              <div className="text-xs ink-2">Readiness reads · 7 days</div>
              <div className="tnum text-lg font-semibold">
                {reads.length}
                <span className="ml-1 text-xs font-normal ink-3">of 21</span>
              </div>
            </div>
            <div className="border-t pt-3">
              <div className="text-xs ink-2">Meals logged · 7 days</div>
              <div className="tnum text-lg font-semibold">
                {mealsLogged}
                <span className="ml-1 text-xs font-normal ink-3">of 28 slots</span>
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
