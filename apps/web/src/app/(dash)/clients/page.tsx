import Link from 'next/link';
import { palette } from '@vela/shared/tokens';
import { Avatar, Card, EmptyState, StatTile, StatusPill } from '@/components/ui';
import { createServerSupabase } from '@/lib/supabase/server';

export const metadata = { title: 'Clients — Vela' };

/**
 * Live roster, read as the signed-in coach. Every row here came back through row level
 * security — there is no coach_id filter in this query, because the database applies it.
 */
export default async function ClientsPage() {
  const supabase = await createServerSupabase();

  const { data: clients } = await supabase
    .from('clients')
    .select('id, email, first_name_hint, last_name_hint, condition, goal, status, started_on, profile_id')
    .order('created_at', { ascending: false });

  const rows = clients ?? [];
  const active = rows.filter((c) => c.status === 'active');
  const invited = rows.filter((c) => c.status === 'invited');

  // head:true means the rows never travel — only the count, which is all this tile needs.
  const { count: logged } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed');

  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-[30px] font-extrabold">Clients</h1>
          <p className="mt-0.5 text-sm ink-2">
            {active.length} active · {invited.length} awaiting acceptance
          </p>
        </div>
        <Link
          href="/clients/invite"
          className="display-face rounded-full px-4 py-2.5 text-sm font-semibold text-white"
          style={{ background: palette.brand[600] }}
        >
          Invite client
        </Link>
      </header>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatTile label="Active clients" value={String(active.length)} />
        <StatTile
          label="Awaiting acceptance"
          value={String(invited.length)}
          hint="Invited, email not yet verified"
        />
        <StatTile
          label="Sessions logged"
          value={String(logged ?? 0)}
          hint="Completed in the app, all time"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          art="roster"
          title="No clients yet"
          body="Invite your first client and they'll appear here the moment they accept and verify their email address."
        />
      ) : (
        <Card title="All clients">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs ink-3">
                <th className="pb-2 font-medium">Client</th>
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Condition</th>
                <th className="pb-2 font-medium">Since</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const name = `${c.first_name_hint ?? ''} ${c.last_name_hint ?? ''}`.trim() || c.email;
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="py-3">
                      {/* Invited clients have no data to show yet, so the deep dive only
                          becomes reachable once they have accepted. */}
                      {c.status === 'invited' ? (
                        <span className="flex items-center gap-2.5">
                          <Avatar name={name} size={28} />
                          <span className="font-medium">{name}</span>
                        </span>
                      ) : (
                        <Link
                          href={`/clients/${c.id}`}
                          className="flex items-center gap-2.5 hover:underline"
                        >
                          <Avatar name={name} size={28} />
                          <span className="font-medium">{name}</span>
                        </Link>
                      )}
                    </td>
                    <td className="py-3 ink-2">{c.email}</td>
                    <td className="py-3 ink-2">{c.condition ?? '—'}</td>
                    <td className="tnum py-3 ink-2">
                      {new Date(c.started_on).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3">
                      {c.status === 'active' ? (
                        <StatusPill tone="good">Active</StatusPill>
                      ) : c.status === 'invited' ? (
                        <StatusPill tone="warning">Invited</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">{c.status}</StatusPill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <p className="mt-6 text-xs ink-3">
        Open a client for her training, vitals and nutrition. Roster-level adherence and
        pain columns arrive with the offline sync in Phase 3 — see the{' '}
        <Link href="/preview" className="underline">
          design preview
        </Link>{' '}
        for how they read.
      </p>
    </div>
  );
}
