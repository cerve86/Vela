import { notFound } from 'next/navigation';
import { METRIC_META, clientById, latestMetric, metricsByClient } from '@vela/shared';
import { Card } from '@/components/ui';
import { TimeSeriesPanels } from '@/components/charts';
import { metricPanel } from '@/lib/series';

export default async function VitalsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!clientById.get(id)) notFound();

  const metrics = metricsByClient.get(id) ?? [];
  const weight = metricPanel(id, 'weight_kg', {
    label: 'Weight (kg)',
    color: 'var(--series-1)',
    days: 56,
    decimals: 1,
  });
  const hr = metricPanel(id, 'resting_hr', {
    label: 'Resting heart rate (bpm)',
    color: 'var(--series-2)',
    days: 28,
  });
  const sleep = metricPanel(id, 'sleep_min', {
    label: 'Sleep (minutes)',
    color: 'var(--series-3)',
    days: 28,
    kind: 'bar',
  });
  const steps = metricPanel(id, 'steps', {
    label: 'Steps',
    color: 'var(--series-7)',
    days: 28,
    kind: 'bar',
  });

  const sources = new Set(metrics.map((m) => m.source));

  return (
    <div className="space-y-4">
      <Card title="Latest readings">
        <div className="grid grid-cols-6 gap-3">
          {(['weight_kg', 'resting_hr', 'hrv_ms', 'sleep_min', 'steps', 'body_fat_pct'] as const).map(
            (t) => {
              const m = latestMetric(metrics, t);
              const meta = METRIC_META[t];
              return (
                <div key={t}>
                  <div className="text-xs ink-2">{meta.label}</div>
                  <div className="tnum mt-0.5 text-lg font-semibold">
                    {m ? m.value.toLocaleString('en-GB', { minimumFractionDigits: meta.decimals, maximumFractionDigits: meta.decimals }) : '—'}
                    {meta.unit && (
                      <span className="ml-1 text-xs font-normal ink-3">{meta.unit}</span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs ink-3">
                    {m
                      ? m.source === 'healthkit'
                        ? 'Apple Health'
                        : m.source === 'manual'
                          ? 'Manual'
                          : 'Coach'
                      : 'No data'}
                  </div>
                </div>
              );
            },
          )}
        </div>
        <p className="mt-3 border-t pt-3 text-xs ink-3">
          Sources present in this window: {[...sources].join(', ')}. Every reading keeps its
          origin so an Apple Health import is never mistaken for something the client typed.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card title="Body weight">
          <TimeSeriesPanels xLabels={weight.xLabels} panels={weight.panels} />
        </Card>
        <Card title="Resting heart rate">
          <TimeSeriesPanels xLabels={hr.xLabels} panels={hr.panels} />
        </Card>
        <Card title="Sleep">
          <TimeSeriesPanels xLabels={sleep.xLabels} panels={sleep.panels} />
        </Card>
        <Card title="Daily steps">
          <TimeSeriesPanels xLabels={steps.xLabels} panels={steps.panels} />
        </Card>
      </div>
    </div>
  );
}
