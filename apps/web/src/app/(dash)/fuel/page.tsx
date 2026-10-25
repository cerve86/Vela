import { listClientsBrief, listFuelCards, listFuelChecks } from '@vela/api';
import { mergeFuelCards } from '@vela/shared';
import { createServerSupabase } from '@/lib/supabase/server';
import { FuelEditor } from './FuelEditor';
import { FuelRoster } from './FuelRoster';

export const metadata = { title: 'Fuelling — Vela' };

/** ISO date `n` days before today, UTC. */
function daysBack(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * How fuelling is going for her clients, and the words on their fuelling and supplement
 * cards. Vela ships her framework as the starting point; every card here is hers to
 * rewrite, and a supplement card reaches clients only once she publishes it.
 */
export default async function FuelPage() {
  const supabase = await createServerSupabase();
  const [mine, clients, checks] = await Promise.all([
    listFuelCards(supabase),
    listClientsBrief(supabase),
    listFuelChecks(supabase, { from: daysBack(27) }),
  ]);
  const cards = mergeFuelCards(mine);
  const own = new Set(mine.map((c) => c.key));
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-[30px] font-extrabold">Fuelling</h1>
        <p className="mt-0.5 text-sm ink-2">
          What &ldquo;Fuel for today&rdquo; says on her phone. The session picks its card — long,
          quality, strength, or the plate reminder on an easy day — and long runs add the heat and
          pre-dawn cues. One plain line each on the face; amounts and the why behind a tap, hidden
          for any client you flag for restrictive patterns. Amounts written per kg — “1–2 g per kg”
          — also read in grams for each client from her latest weight. Supplement cards stay drafts
          until you publish them.{' '}
          <a href="/evidence" className="underline">
            Evidence
          </a>
        </p>
      </header>
      <div className="mb-8">
        <FuelRoster clients={clients} checks={checks} days={28} />
      </div>
      <FuelEditor cards={cards} own={[...own]} />
    </div>
  );
}
