import { notFound } from 'next/navigation';
import {
  METRIC_META,
  TODAY,
  adherenceBand,
  clientById,
  daysBetween,
  latestMetric,
  metricsByClient,
  rollupByClient,
  sessionsByClient,
} from '@vela/shared';
import { adherenceStyle, palette } from '@vela/shared/tokens';
import { Card, PainDot, StatTile, StatusPill } from '@/components/ui';
import { Meter, TimeSeriesPanels } from '@/components/charts';
import { painLoadPanels } from '@/lib/series';

export default async function ClientOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = clientById.get(id);
  if (!client) notFound();

  const rollup = rollupByClient.get(id)!;
  const metrics = metricsByClient.get(id) ?? [];
  const weight = latestMetric(metrics, 'weight_kg');
  const { xLabels, panels } = painLoadPanels(id, 28);

  const recent = (sessionsByClient.get(id) ?? [])
    .filter((s) => s.status !== 'scheduled')
    .slice(-6)
    .reverse();

  const band = adherenceBand(rollup.adherence7d);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatTile
          label="Adherence · 7 days"
          value={`${Math.round(rollup.adherence7d * 100)}%`}
          hint={`${rollup.sessionsCompleted7d} of ${rollup.sessionsScheduled7d} sessions`}
        />
        <StatTile
          label="Avg pain · 7 days"
          value={rollup.avgPain7d === null ? '—' : `${rollup.avgPain7d}`}
          unit={rollup.avgPain7d === null ? undefined : '/10'}
          delta={`Trend ${rollup.painTrend}`}
          deltaGood={rollup.painTrend === 'improving'}
        />
        <StatTile
          label="Weight · 28 days"
          value={weight ? `${weight.value}` : '—'}
          unit="kg"
          delta={
            rollup.weightDelta28dKg === null
              ? undefined
              : `${rollup.weightDelta28dKg > 0 ? '+' : ''}${rollup.weightDelta28dKg} kg`
          }
          deltaGood={(rollup.weightDelta28dKg ?? 0) < 0}
        />
        <StatTile
          label="Workload ratio"
          value={rollup.acwr === null ? '—' : rollup.acwr.toFixed(2)}
          hint={
            rollup.acwr !== null && rollup.acwr > 1.5
              ? 'Above 1.5 — elevated risk'
              : 'Acute ÷ chronic (target 0.8–1.3)'
          }
        />
      </div>

      <Card
        title="Pain against training load"
        action={<span className="text-xs ink-3">Last 28 days · shared timeline</span>}
      >
        <p className="mb-2 text-xs ink-2">
          Two panels on one timeline rather than one chart with two scales — pain and
          kilograms share no axis, so overlaying them would invent crossings that mean nothing.
        </p>
        <TimeSeriesPanels xLabels={xLabels} panels={panels} />
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card title="This week" className="col-span-1">
          <div className="space-y-4">
            <Meter
              value={rollup.adherence7d}
              color={adherenceStyle[band].color}
              label="Session adherence"
              valueLabel={`${Math.round(rollup.adherence7d * 100)}%`}
            />
            <Meter
              value={rollup.nutritionAdherence7d ?? 0}
              color={
                (rollup.nutritionAdherence7d ?? 0) >= 0.7
                  ? palette.status.good
                  : palette.status.warning
              }
              label="Days nutrition logged"
              valueLabel={`${Math.round((rollup.nutritionAdherence7d ?? 0) * 7)}/7`}
            />
            <div className="border-t pt-3">
              <div className="text-xs ink-2">Volume load · 7 days</div>
              <div className="tnum text-lg font-semibold">
                {rollup.volumeLoad7d.toLocaleString('en-GB')} kg
              </div>
            </div>
            <div>
              <div className="text-xs ink-2">Last activity</div>
              <div className="text-sm">
                {rollup.lastActivityAt
                  ? `${daysBetween(rollup.lastActivityAt, TODAY)} days ago`
                  : 'Never'}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Recent sessions" className="col-span-2">
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
                  {s.clientNotes && <div className="truncate text-xs ink-3">{s.clientNotes}</div>}
                </div>
                <div className="w-20 shrink-0">
                  <PainDot score={s.painAfter} />
                </div>
                <div className="w-24 shrink-0 text-right">
                  {s.status === 'completed' ? (
                    <StatusPill tone="good">Completed</StatusPill>
                  ) : (
                    <StatusPill tone="critical">Missed</StatusPill>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Latest vitals">
        <div className="grid grid-cols-5 gap-3">
          {(['weight_kg', 'resting_hr', 'hrv_ms', 'sleep_min', 'steps'] as const).map((t) => {
            const m = latestMetric(metrics, t);
            const meta = METRIC_META[t];
            return (
              <div key={t}>
                <div className="text-xs ink-2">{meta.label}</div>
                <div className="tnum mt-0.5 text-lg font-semibold">
                  {m ? m.value.toLocaleString('en-GB', { minimumFractionDigits: meta.decimals, maximumFractionDigits: meta.decimals }) : '—'}
                  {meta.unit && <span className="ml-1 text-xs font-normal ink-3">{meta.unit}</span>}
                </div>
                {m && (
                  <div className="mt-0.5 text-xs ink-3">
                    {m.source === 'healthkit' ? 'Apple Health' : m.source === 'manual' ? 'Manual' : 'Coach'}
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
