import Link from 'next/link';
import { notFound } from 'next/navigation';
import { clientById, rollupByClient } from '@coachapp/shared';
import { Avatar, StatusPill } from '@/components/ui';
import { ClientTabs } from '@/components/ClientTabs';

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = clientById.get(id);
  if (!client) notFound();
  const rollup = rollupByClient.get(id)!;

  return (
    <div className="mx-auto max-w-6xl p-8">
      <Link href="/clients" className="text-sm ink-2 hover:underline">
        ← All clients
      </Link>

      <header className="mt-3 mb-5 flex items-start gap-4">
        <Avatar name={`${client.firstName} ${client.lastName}`} size={52} />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">
            {client.firstName} {client.lastName}
          </h1>
          <p className="mt-0.5 text-sm ink-2">{client.condition}</p>
          <p className="mt-0.5 text-sm ink-3">Goal — {client.goal}</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {rollup.alerts.length === 0 ? (
            <StatusPill tone="good">No open alerts</StatusPill>
          ) : (
            rollup.alerts.map((a) => (
              <StatusPill
                key={a.kind}
                tone={a.severity === 'critical' ? 'critical' : a.severity === 'warn' ? 'warning' : 'neutral'}
              >
                {a.message}
              </StatusPill>
            ))
          )}
        </div>
      </header>

      <ClientTabs clientId={id} />
      <div className="mt-5">{children}</div>
    </div>
  );
}
