import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, EmptyState } from '@/components/ui';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Nutrition has no store yet — food logging is Phase 5. Rather than keep rendering the
 * mock dataset's macros under a real client's name, this says so plainly. A coach
 * mistaking seeded numbers for her client's intake is a worse failure than an empty tab.
 */
export default async function NutritionTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: client } = await supabase
    .from('clients')
    .select('id, breastfeeding')
    .eq('id', id)
    .maybeSingle();
  if (!client) notFound();

  return (
    <div className="space-y-4">
      <EmptyState
        title="Nutrition logging arrives in Phase 5"
        body="Food logging, macro targets and the barcode scanner are not built yet. Nothing is recorded for this client, so nothing is shown here."
      />

      <Card title="What this tab will show">
        <ul className="space-y-1.5 text-sm ink-2">
          <li>· Calories and protein logged each day against her standing target</li>
          <li>· Days logged per week, so you can see engagement before you read intake</li>
          <li>· Today&apos;s meals as she entered them, with the source of each item</li>
        </ul>
        {client.breastfeeding && (
          <p className="mt-3 text-sm ink-2">
            She is breastfeeding, so targets here will account for the extra energy
            requirement rather than treating a deficit as progress.
          </p>
        )}
        <p className="mt-3 text-xs ink-3">
          The{' '}
          <Link href="/preview" className="underline">
            design preview
          </Link>{' '}
          shows the intended layout against sample data.
        </p>
      </Card>
    </div>
  );
}
