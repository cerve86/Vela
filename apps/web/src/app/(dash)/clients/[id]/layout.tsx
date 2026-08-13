import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar, StatusPill } from '@/components/ui';
import { ClientTabs } from '@/components/ClientTabs';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * Shell for one client's deep dive.
 *
 * The row is fetched with no coach_id filter: row level security decides whether this
 * coach may see it, so an id belonging to somebody else's client 404s rather than
 * leaking a name in the header before the tab below refuses to load its data.
 */
export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: client } = await supabase
    .from('clients')
    .select(
      'id, email, first_name_hint, last_name_hint, condition, goal, status, weeks_postpartum, breastfeeding',
    )
    .eq('id', id)
    .maybeSingle();

  if (!client) notFound();

  const name =
    `${client.first_name_hint ?? ''} ${client.last_name_hint ?? ''}`.trim() || client.email;

  return (
    <div className="mx-auto max-w-6xl p-8">
      <Link href="/clients" className="text-sm ink-2 hover:underline">
        ← All clients
      </Link>

      <header className="mt-3 mb-5 flex items-start gap-4">
        <Avatar name={name} size={52} />
        <div className="flex-1">
          <h1 className="text-[30px] font-extrabold">{name}</h1>
          {client.condition && <p className="mt-0.5 text-sm ink-2">{client.condition}</p>}
          {client.goal && <p className="mt-0.5 text-sm ink-3">Goal — {client.goal}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {client.weeks_postpartum !== null && (
            <StatusPill tone="neutral">Week {client.weeks_postpartum} postpartum</StatusPill>
          )}
          {client.breastfeeding && <StatusPill tone="neutral">Breastfeeding</StatusPill>}
          {client.status === 'active' ? (
            <StatusPill tone="good">Active</StatusPill>
          ) : (
            <StatusPill tone="warning">{client.status}</StatusPill>
          )}
        </div>
      </header>

      <ClientTabs clientId={id} />
      <div className="mt-5">{children}</div>
    </div>
  );
}
