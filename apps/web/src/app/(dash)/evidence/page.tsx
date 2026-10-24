import { listEvidence } from '@vela/api';
import { createServerSupabase } from '@/lib/supabase/server';
import { EvidenceList } from './EvidenceList';

export const metadata = { title: 'Evidence — Vela' };

/**
 * The coach's reference list, for her eyes only: what the freshness panel, the fuelling
 * cards and the ladder rest on. Clients never see this page.
 */
export default async function EvidencePage() {
  const supabase = await createServerSupabase();
  const refs = await listEvidence(supabase);
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 md:p-8">
      <header className="mb-6">
        <h1 className="text-[30px] font-extrabold">Evidence</h1>
        <p className="mt-0.5 text-sm ink-2">
          Your reference list, by topic. Only you see it; the freshness panel and the fuelling page
          link here.
        </p>
      </header>
      <EvidenceList refs={refs} />
    </div>
  );
}
