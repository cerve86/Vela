import { notFound } from 'next/navigation';
import { clientById, isDayOnTarget, rollupByClient } from '@coachapp/shared';
import { palette } from '@coachapp/shared/tokens';
import { Card, StatTile } from '@/components/ui';
import { Meter, TimeSeriesPanels } from '@/components/charts';
import { nutritionPanels, todayMacros } from '@/lib/series';

export default async function NutritionTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!clientById.get(id)) notFound();

  const rollup = rollupByClient.get(id)!;
  const { xLabels, panels } = nutritionPanels(id, 28);
  const { actual, target, entries } = todayMacros(id);
  const onTarget = isDayOnTarget(actual, target);

  const macroRows = [
    { key: 'kcal', label: 'Calories', actual: actual.kcal, target: target.kcal, unit: 'kcal', color: 'var(--series-1)' },
    { key: 'protein', label: 'Protein', actual: actual.proteinG, target: target.proteinG, unit: 'g', color: 'var(--series-3)' },
    { key: 'carbs', label: 'Carbs', actual: actual.carbsG, target: target.carbsG, unit: 'g', color: 'var(--series-4)' },
    { key: 'fat', label: 'Fat', actual: actual.fatG, target: target.fatG, unit: 'g', color: 'var(--series-5)' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <StatTile
          label="Days logged · 7 days"
          value={`${Math.round((rollup.nutritionAdherence7d ?? 0) * 7)}/7`}
        />
        <StatTile label="Calorie target" value={target.kcal.toLocaleString('en-GB')} unit="kcal" />
        <StatTile label="Protein target" value={String(target.proteinG)} unit="g" />
        <StatTile
          label="Today"
          value={entries.length === 0 ? 'Not logged' : onTarget ? 'On target' : 'Off target'}
          hint={entries.length === 0 ? 'No entries yet' : `${entries.length} entries`}
        />
      </div>

      <Card title="Today against target">
        <div className="grid grid-cols-4 gap-5">
          {macroRows.map((m) => (
            <Meter
              key={m.key}
              value={m.actual}
              max={m.target}
              color={
                m.target > 0 && Math.abs(m.actual - m.target) / m.target <= 0.1
                  ? palette.status.good
                  : m.color
              }
              label={m.label}
              valueLabel={`${Math.round(m.actual)} / ${m.target} ${m.unit}`}
            />
          ))}
        </div>
      </Card>

      <Card title="Intake over time" action={<span className="text-xs ink-3">Last 28 days</span>}>
        <TimeSeriesPanels xLabels={xLabels} panels={panels} />
        <p className="mt-2 text-xs ink-3">
          Gaps are days with no entries — an unlogged day is not a zero-calorie day, so it is
          drawn as absent rather than as a bar at nought.
        </p>
      </Card>

      <Card title="Today's entries">
        {entries.length === 0 ? (
          <p className="text-sm ink-2">Nothing logged today yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs ink-3">
                <th className="pb-2 font-medium">Meal</th>
                <th className="pb-2 font-medium">Food</th>
                <th className="pb-2 font-medium">Amount</th>
                <th className="pb-2 font-medium">kcal</th>
                <th className="pb-2 font-medium">P</th>
                <th className="pb-2 font-medium">C</th>
                <th className="pb-2 font-medium">F</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="py-2 capitalize ink-2">{e.meal}</td>
                  <td className="py-2 font-medium">{e.foodName}</td>
                  <td className="tnum py-2">{e.quantityG} g</td>
                  <td className="tnum py-2">{e.macros.kcal}</td>
                  <td className="tnum py-2">{e.macros.proteinG}</td>
                  <td className="tnum py-2">{e.macros.carbsG}</td>
                  <td className="tnum py-2">{e.macros.fatG}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
