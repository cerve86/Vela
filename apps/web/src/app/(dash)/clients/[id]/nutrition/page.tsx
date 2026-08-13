import { notFound } from 'next/navigation';
import {
  MEAL_SLOTS,
  adherence,
  currentTarget,
  listFoodLogs,
  listMetrics,
  listTargets,
  nutritionDays,
  sumMacros,
  type FoodLogEntry,
  type MealSlot,
} from '@vela/api';
import { Card, EmptyState, StatTile, StatusPill } from '@/components/ui';
import { Meter, TimeSeriesPanels, type Panel } from '@/components/charts';
import { createServerSupabase } from '@/lib/supabase/server';
import { TargetEditor } from './TargetEditor';

/** ISO date `n` days before today, UTC — the basis every window on this page shares. */
function daysBack(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export default async function NutritionTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: client } = await supabase
    .from('clients')
    .select('id, breastfeeding')
    .eq('id', id)
    .maybeSingle();
  if (!client) notFound();

  const today = daysBack(0);
  const from = daysBack(29);

  const [days, target, history, logs, weights] = await Promise.all([
    nutritionDays(supabase, id, from, today),
    currentTarget(supabase, id, today),
    listTargets(supabase, id),
    listFoodLogs(supabase, { clientId: id, from: daysBack(6) }),
    listMetrics(supabase, {
      clientId: id,
      types: ['weight_kg'],
      since: `${from}T00:00:00Z`,
    }),
  ]);

  const week = days.slice(-7);
  const week7 = adherence(week);
  const month30 = adherence(days);

  const xLabels = days.map((d) => d.day);

  // Energy and its target share a unit, so one panel is honest: the bar either reaches
  // the line or it does not. Weight gets its own panel below rather than a second axis —
  // kilograms and kilocalories have no common scale, and overlaying them would invent
  // crossings that mean nothing.
  const kcalPanel: Panel = {
    id: 'kcal',
    label: 'Energy logged (kcal)',
    height: 170,
    format: { style: 'thousands' },
    series: [
      {
        id: 'logged',
        label: 'Logged',
        color: 'var(--series-1)',
        kind: 'bar',
        points: days.map((d) => ({ x: d.day, y: d.entries > 0 ? Math.round(d.kcal) : null })),
      },
      {
        id: 'target',
        label: 'Target',
        color: 'var(--series-4)',
        kind: 'line',
        points: days.map((d) => ({ x: d.day, y: d.targetKcal })),
        connectGaps: true,
      },
    ],
  };

  const weightByDate = new Map(weights.map((m) => [m.recordedAt.slice(0, 10), m.value]));
  const weightPanel: Panel = {
    id: 'weight',
    label: 'Weight (kg)',
    height: 130,
    format: { style: 'fixed', decimals: 1 },
    series: [
      {
        id: 'weight',
        label: 'Weight',
        color: 'var(--series-2)',
        kind: 'line',
        points: xLabels.map((d) => ({ x: d, y: weightByDate.get(d) ?? null })),
        connectGaps: true,
      },
    ],
  };

  const byMeal = new Map<MealSlot, FoodLogEntry[]>();
  for (const l of logs.filter((l) => l.loggedOn === today)) {
    const arr = byMeal.get(l.meal);
    if (arr) arr.push(l);
    else byMeal.set(l.meal, [l]);
  }
  const todayTotals = sumMacros(logs.filter((l) => l.loggedOn === today));

  const recentDays = [...week].reverse();

  return (
    <div className="space-y-4">
      <TargetEditor
        clientId={id}
        current={target}
        history={history}
        breastfeeding={Boolean(client.breastfeeding)}
        today={today}
      />

      {days.every((d) => d.entries === 0) ? (
        <EmptyState
          title="Nothing logged yet"
          body="Her diary is empty for the last 30 days. Entries appear here the moment she logs a meal in the app — including what she scanned and what she typed by hand."
        />
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3">
            <StatTile
              label="Days logged · 7 days"
              value={`${week7.logged}/7`}
              hint={week7.logged === 7 ? 'Every day' : `${7 - week7.logged} without an entry`}
            />
            <StatTile
              label="On target · 7 days"
              value={week7.targetedDays === 0 ? '—' : `${week7.onTarget}/${week7.targetedDays}`}
              hint={
                week7.targetedDays === 0
                  ? 'No target set for those days'
                  : 'Within 10% of the energy target'
              }
            />
            <StatTile
              label="Days logged · 30 days"
              value={`${month30.logged}/${month30.total}`}
            />
            <StatTile
              label="Average energy · 7 days"
              value={
                week7.logged === 0
                  ? '—'
                  : Math.round(
                      week.filter((d) => d.entries > 0).reduce((n, d) => n + d.kcal, 0) /
                        week7.logged,
                    ).toLocaleString('en-GB')
              }
              unit="kcal"
              hint="Across the days she logged"
            />
          </div>

          <Card
            title="Energy against target"
            action={<span className="text-xs ink-3">Last 30 days · shared timeline</span>}
          >
            <TimeSeriesPanels xLabels={xLabels} panels={[kcalPanel, weightPanel]} />
            <p className="mt-2 text-xs ink-3">
              Days with no entry are gaps, not zeros. A blank bar means she did not log,
              which is a different fact from eating nothing.
            </p>
          </Card>

          <div className="grid grid-cols-3 gap-4">
            <Card title="This week" className="col-span-1">
              <div className="space-y-4">
                <Meter
                  value={week7.logged / 7}
                  color="var(--series-1)"
                  label="Days logged"
                  valueLabel={`${week7.logged}/7`}
                />
                {week7.targetedDays > 0 && (
                  <Meter
                    value={week7.onTarget / week7.targetedDays}
                    color="var(--series-3)"
                    label="Within 10% of target"
                    valueLabel={`${week7.onTarget}/${week7.targetedDays}`}
                  />
                )}
                <div className="border-t pt-3">
                  <div className="text-xs ink-2">Day by day</div>
                  <ul className="mt-1.5 space-y-1 text-sm">
                    {recentDays.map((d) => (
                      <li key={d.day} className="flex items-center justify-between gap-2">
                        <span className="ink-2">{fmtDay(d.day)}</span>
                        {d.entries === 0 ? (
                          <span className="text-xs ink-3">not logged</span>
                        ) : (
                          <span className="tnum">
                            {Math.round(d.kcal).toLocaleString('en-GB')}
                            {d.targetKcal !== null && (
                              <span className="ink-3"> / {d.targetKcal.toLocaleString('en-GB')}</span>
                            )}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>

            <Card title="Today" className="col-span-2">
              {byMeal.size === 0 ? (
                <p className="text-sm ink-2">Nothing logged today yet.</p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap gap-x-6 text-sm">
                    <span className="tnum font-semibold">
                      {Math.round(todayTotals.kcal).toLocaleString('en-GB')} kcal
                    </span>
                    <span className="tnum ink-2">
                      {Math.round(todayTotals.proteinG)} g protein
                    </span>
                    <span className="tnum ink-2">{Math.round(todayTotals.carbsG)} g carbs</span>
                    <span className="tnum ink-2">{Math.round(todayTotals.fatG)} g fat</span>
                  </div>
                  <div className="space-y-3">
                    {MEAL_SLOTS.filter((s) => byMeal.has(s.value)).map((slot) => (
                      <div key={slot.value}>
                        <div className="text-xs font-medium ink-3">{slot.label}</div>
                        <ul className="mt-0.5 divide-y text-sm">
                          {byMeal.get(slot.value)!.map((l) => (
                            <li key={l.id} className="flex items-center gap-3 py-1.5">
                              <span className="flex-1">{l.description}</span>
                              {l.quantityG !== null && (
                                <span className="tnum text-xs ink-3">{l.quantityG} g</span>
                              )}
                              <span className="tnum w-20 text-right">
                                {Math.round(l.kcal)} kcal
                              </span>
                              <StatusPill tone="neutral">
                                {l.source === 'barcode'
                                  ? 'Scanned'
                                  : l.source === 'quick'
                                    ? 'Typed'
                                    : l.source === 'custom'
                                      ? 'Custom'
                                      : 'Searched'}
                              </StatusPill>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
