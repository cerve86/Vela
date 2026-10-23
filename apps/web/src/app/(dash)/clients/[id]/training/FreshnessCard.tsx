import {
  CYCLE_STATUS_LABEL,
  type CycleContext,
  type Freshness,
  type SessionLoad,
  type WellnessCheck,
} from '@vela/api';
import { cycleDay } from '@vela/shared';
import { Card, StatusPill } from '@/components/ui';
import { TimeSeriesPanels, type Panel } from '@/components/charts';
import { dateWindow } from '@/lib/series';

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

const BASIS_WORD = { heart_rate: 'heart rate', rpe: 'her RPE', strava_rpe: 'Strava effort' };

/**
 * The week against the month, for the coach.
 *
 * Every number here comes from session load as the database defines it, so this panel,
 * the client report and the divergence flag cannot disagree. The caveat is on the panel
 * itself, not in a help page: the ratio is one line of context, and the flag that matters
 * is load and wellness disagreeing.
 */
export function FreshnessCard({
  freshness,
  loads,
  wellness,
  cycle,
  today,
}: {
  freshness: Freshness | null;
  loads: SessionLoad[];
  wellness: WellnessCheck[];
  cycle: CycleContext | null;
  today: string;
}) {
  const xLabels = dateWindow(28);
  const byDay = new Map<string, number>();
  for (const l of loads) if (l.load !== null) byDay.set(l.day, (byDay.get(l.day) ?? 0) + l.load);
  const wellnessByWeek = new Map(
    wellness.map((w) => [w.weekStart, w.sleep + w.fatigue + w.soreness + w.stress]),
  );

  const enough = freshness !== null && freshness.historyDays >= 21;
  const dailyAverage = freshness && freshness.chronic > 0 ? freshness.chronic / 7 : null;

  const panels: Panel[] = [
    {
      id: 'load',
      label: 'Daily load (RPE × minutes)',
      height: 170,
      format: { style: 'thousands' },
      series: [
        {
          id: 'load',
          label: 'Load',
          color: 'var(--series-1)',
          kind: 'bar',
          points: xLabels.map((d) => ({ x: d, y: byDay.get(d) ?? 0 })),
        },
        ...(dailyAverage !== null
          ? [
              {
                id: 'avg',
                label: '28-day daily average',
                color: 'var(--ink-muted)',
                kind: 'line' as const,
                dashed: true,
                points: xLabels.map((d) => ({ x: d, y: Math.round(dailyAverage) })),
              },
            ]
          : []),
      ],
    },
    {
      id: 'wellness',
      label: 'Weekly wellness (4 best – 20 worst)',
      height: 120,
      domain: [4, 20],
      format: { style: 'fixed', decimals: 0 },
      series: [
        {
          id: 'wellness',
          label: 'Wellness',
          color: 'var(--series-2)',
          kind: 'line',
          connectGaps: true,
          points: xLabels.map((d) => ({ x: d, y: wellnessByWeek.get(d) ?? null })),
        },
      ],
    },
  ];

  const measured = loads.filter((l) => l.day > shiftIso(today, -7) && l.basis !== null);
  const basisCounts = (['heart_rate', 'rpe', 'strava_rpe'] as const)
    .map((b) => [b, measured.filter((l) => l.basis === b).length] as const)
    .filter(([, n]) => n > 0);

  const position = cycle ? cycleDay(cycle.periodStarts, today) : null;
  const periodsInWindow = (cycle?.periodStarts ?? []).filter((d) => d >= xLabels[0]!);

  return (
    <Card
      title="Freshness"
      action={
        enough && freshness.ratio !== null ? (
          <StatusPill
            tone={freshness.ratio > 1.5 ? 'warning' : freshness.ratio < 0.8 ? 'neutral' : 'good'}
          >
            {freshness.ratio > 1.5
              ? 'Load up sharply'
              : freshness.ratio < 0.8
                ? 'Lighter week'
                : 'Steady'}
          </StatusPill>
        ) : (
          <StatusPill tone="neutral">Building baseline</StatusPill>
        )
      }
    >
      {!freshness || freshness.historyDays === 0 ? (
        <p className="text-sm ink-2">
          Nothing to read yet. Each session she finishes with an RPE, or that Strava brings with
          heart rate, adds its load here.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="This week" value={freshness.acute.toLocaleString('en-GB')} unit="AU" />
            <Stat
              label="Weekly average, 4 weeks"
              value={freshness.chronic.toLocaleString('en-GB')}
              unit="AU"
            />
            <Stat
              label="Acute : chronic"
              value={enough && freshness.ratio !== null ? freshness.ratio.toFixed(2) : '—'}
            />
            <Stat
              label="Monotony · strain"
              value={
                freshness.monotony !== null
                  ? `${freshness.monotony.toFixed(1)} · ${(freshness.strain ?? 0).toLocaleString('en-GB')}`
                  : '—'
              }
            />
          </div>

          <div className="mt-4">
            <TimeSeriesPanels xLabels={xLabels} panels={panels} />
          </div>

          <ul className="mt-3 space-y-1 text-xs ink-2">
            <li>
              {freshness.sessions7} {freshness.sessions7 === 1 ? 'session' : 'sessions'} in the last
              7 days
              {basisCounts.length > 0 &&
                `: intensity from ${basisCounts.map(([b, n]) => `${BASIS_WORD[b]} (${n})`).join(', ')}`}
              {freshness.unmeasured7 > 0 &&
                ` · ${freshness.unmeasured7} with no RPE or heart rate, so no load`}
              .
            </li>
            {!enough && (
              <li>
                The ratio needs three weeks of recording; she has {freshness.historyDays}{' '}
                {freshness.historyDays === 1 ? 'day' : 'days'}.
              </li>
            )}
            <li>
              {cycle ? (
                <>
                  {CYCLE_STATUS_LABEL[cycle.status]}
                  {position &&
                    (cycle.status === 'regular' ||
                      cycle.status === 'irregular' ||
                      cycle.status === 'perimenopause') &&
                    ` · day ${position.day} (period started ${shortDate(position.lastStart)}${
                      position.averageLength
                        ? `, cycles average ${position.averageLength} days`
                        : ''
                    })`}
                  {periodsInWindow.length > 0 &&
                    ` · periods started in this window: ${periodsInWindow.map(shortDate).join(', ')}`}
                  . Context only, never a gate.
                </>
              ) : (
                'Cycle context not shared. She can add it, with its own consent, from Profile in the app.'
              )}
            </li>
          </ul>

          <p
            className="mt-4 rounded-[14px] p-3 text-xs ink-2"
            style={{ background: 'var(--tint-cream)' }}
          >
            Read the acute:chronic ratio as context, not a prediction. It divides two coupled
            numbers and has no established predictive or causal validity. Vela flags only when load
            and her weekly wellness disagree: wellness sliding on a steady load, or load up sharply
            while she reports feeling as usual.
          </p>
        </>
      )}
    </Card>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-[14px] px-3.5 py-3" style={{ background: 'var(--ghost)' }}>
      <div className="text-[11px] ink-3">{label}</div>
      <div className="tnum mt-1 text-lg font-semibold">
        {value}
        {unit && value !== '—' && <span className="ml-1 text-xs font-normal ink-3">{unit}</span>}
      </div>
    </div>
  );
}

function shiftIso(iso: string, by: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}
