import { notFound } from 'next/navigation';
import { METRIC_META, listMetrics, type Metric, type MetricType } from '@vela/api';
import { Card, EmptyState, StatTile } from '@/components/ui';
import { TimeSeriesPanels, type Panel } from '@/components/charts';
import { createServerSupabase } from '@/lib/supabase/server';
import { dateWindow } from '@/lib/series';

const TRACKED: MetricType[] = ['weight_kg', 'resting_hr', 'hrv_ms', 'steps'];

/** Full timestamp `n` days back, UTC, for `recorded_at` comparisons. */
function sinceTimestamp(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
}

const SERIES_COLOR: Record<MetricType, string> = {
  weight_kg: 'var(--series-1)',
  resting_hr: 'var(--series-2)',
  hrv_ms: 'var(--series-3)',
  steps: 'var(--series-4)',
  body_fat_pct: 'var(--series-5)',
  waist_cm: 'var(--series-6)',
  bp_systolic: 'var(--series-2)',
  bp_diastolic: 'var(--series-3)',
  spo2_pct: 'var(--series-4)',
  sleep_min: 'var(--series-3)',
  vo2max: 'var(--series-5)',
};

function panelFor(type: MetricType, metrics: Metric[], days: number): { xLabels: string[]; panels: Panel[] } {
  const xLabels = dateWindow(days);
  const meta = METRIC_META[type];

  // One reading per day: the latest wins. A day with three weigh-ins is still one point,
  // and picking the last avoids a mid-morning spike dragging the line around.
  const byDate = new Map<string, number>();
  for (const m of metrics.filter((m) => m.type === type)) {
    byDate.set(m.recordedAt.slice(0, 10), m.value);
  }

  return {
    xLabels,
    panels: [
      {
        id: type,
        label: `${meta.label}${meta.unit ? ` (${meta.unit})` : ''}`,
        height: 170,
        format: { style: 'fixed', decimals: meta.decimals },
        series: [
          {
            id: type,
            label: meta.label,
            color: SERIES_COLOR[type],
            kind: type === 'steps' ? 'bar' : 'line',
            points: xLabels.map((d) => ({ x: d, y: byDate.get(d) ?? null })),
            // Vitals are sampled, not continuous — weight lands every other day, HRV
            // weekly. Without this every segment is orphaned and the line vanishes.
            connectGaps: true,
          },
        ],
      },
    ],
  };
}

export default async function VitalsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: client } = await supabase
    .from('clients')
    .select('id, weeks_postpartum, breastfeeding')
    .eq('id', id)
    .maybeSingle();
  if (!client) notFound();

  const metrics = await listMetrics(supabase, {
    clientId: id,
    types: TRACKED,
    since: sinceTimestamp(90),
  });

  const latest = (type: MetricType) => {
    const of = metrics.filter((m) => m.type === type);
    return of.length ? of[of.length - 1]! : null;
  };

  /**
   * Which direction is the good one, per metric.
   *
   * Weight is deliberately absent. In a postpartum and often breastfeeding population a
   * falling weight is not automatically progress, and colouring it green would be the app
   * taking a clinical position it has no business taking. It shows the change and says
   * nothing about it.
   */
  const GOOD_DOWN: Partial<Record<MetricType, boolean>> = {
    resting_hr: true,
    hrv_ms: false,
    steps: false,
    vo2max: false,
    body_fat_pct: false,
  };

  /** Change across the window, with a word for the direction — never colour alone. */
  const change = (type: MetricType) => {
    const of = metrics.filter((m) => m.type === type);
    if (of.length < 2) return null;

    const meta = METRIC_META[type];
    const now = of[of.length - 1]!.value;
    const delta = now - of[0]!.value;
    const rounded = Math.round(delta * 10) / 10;

    /**
     * Meaningful relative to the metric's own scale, not to an absolute number.
     *
     * An absolute floor reported "−29 steps over 90 days · worth a look", which is 0.3% of
     * a nine-thousand-step day and well inside the noise — a warning that fires on nothing
     * teaches a coach to stop reading warnings. Three percent of the current value is a
     * crude line but it holds across kilograms, beats, milliseconds and step counts alike.
     */
    if (Math.abs(delta) < Math.abs(now) * 0.03) {
      return { text: 'no real change', good: undefined, word: 'holding steady' };
    }

    const goodDown = GOOD_DOWN[type];
    const good = goodDown === undefined ? undefined : goodDown ? rounded < 0 : rounded > 0;

    return {
      text: `${rounded > 0 ? '+' : ''}${rounded.toFixed(meta.decimals)} over 90 days`,
      good,
      word:
        good === undefined
          ? 'read alongside energy, not as a goal'
          : good
            ? 'going the right way'
            : 'worth a look',
    };
  };

  const sources = new Set(metrics.map((m) => m.source));

  if (metrics.length === 0) {
    return (
      <EmptyState
        art="trend"
        title="No readings yet"
        body="Once she connects Apple Health in the app, weight, resting heart rate, HRV and steps appear here — each labelled with where it came from."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {TRACKED.map((type) => {
          const m = latest(type);
          const meta = METRIC_META[type];
          return (
            <StatTile
              key={type}
              label={meta.label}
              value={m ? m.value.toLocaleString('en-GB', {
                minimumFractionDigits: meta.decimals,
                maximumFractionDigits: meta.decimals,
              }) : '—'}
              unit={meta.unit || undefined}
              delta={change(type)?.text}
              deltaGood={change(type)?.good}
              hint={
                m
                  ? `${change(type)?.word ?? ''}${change(type) ? ' · ' : ''}${
                      m.source === 'healthkit'
                        ? 'Apple Health'
                        : m.source === 'manual'
                          ? 'entered manually'
                          : 'recorded in clinic'
                    }`
                  : 'No data'
              }
            />
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {TRACKED.map((type) => {
          const { xLabels, panels } = panelFor(type, metrics, 56);
          return (
            <Card key={type} title={METRIC_META[type].label}>
              <TimeSeriesPanels xLabels={xLabels} panels={panels} />
            </Card>
          );
        })}
      </div>

      <Card title="Provenance">
        <p className="text-sm ink-2">
          {metrics.length} readings in the last 90 days from: {[...sources].join(', ')}. Every
          reading keeps its origin, so an Apple Health import is never mistaken for
          something she typed — or for something you measured in clinic.
        </p>
        {client.breastfeeding && (
          <p className="mt-2 text-sm ink-2">
            She is breastfeeding. Worth reading weight trend alongside energy availability
            rather than as a goal in itself.
          </p>
        )}
      </Card>
    </div>
  );
}
