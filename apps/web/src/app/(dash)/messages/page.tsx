import Link from 'next/link';
import { listMessages, type Message } from '@vela/api';
import { Avatar, EmptyState } from '@/components/ui';
import { createServerSupabase } from '@/lib/supabase/server';
import { Composer } from './Composer';

export const metadata = { title: 'Messages — Vela' };

/**
 * One thread per client, selected by query parameter.
 *
 * Server-rendered rather than a client-side thread switcher: each thread is a URL, so it
 * survives a refresh, can be linked to from anywhere in the portal, and does not require
 * holding every conversation in browser state. Only the composer needs to be interactive.
 */
export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: selected } = await searchParams;
  const supabase = await createServerSupabase();

  const { data: clients } = await supabase
    .from('clients')
    .select('id, email, first_name_hint, last_name_hint, status')
    .neq('status', 'invited')
    .order('created_at', { ascending: false });

  const roster = clients ?? [];

  // Every thread at once. A practice has tens of clients, not thousands, and one query per
  // thread would mean a request per row to render a sidebar.
  const threads = await Promise.all(
    roster.map(async (c) => ({
      client: c,
      name: [c.first_name_hint, c.last_name_hint].filter(Boolean).join(' ') || c.email,
      messages: await listMessages(supabase, c.id, 200),
    })),
  );

  const withAny = threads.filter((t) => t.messages.length > 0);
  const unreadTotal = threads.reduce(
    (n, t) => n + t.messages.filter((m) => m.sender === 'client' && m.readAt === null).length,
    0,
  );

  // Default to the thread that most needs answering, then the most recent, then the first
  // client. Landing on an arbitrary thread would make the unread count decorative.
  const active =
    threads.find((t) => t.client.id === selected) ??
    withAny.find((t) => t.messages.some((m) => m.sender === 'client' && m.readAt === null)) ??
    withAny.sort((a, b) =>
      (a.messages.at(-1)?.createdAt ?? '') < (b.messages.at(-1)?.createdAt ?? '') ? 1 : -1,
    )[0] ??
    threads[0] ??
    null;

  if (roster.length === 0) {
    return (
      <div className="mx-auto max-w-6xl p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold">Messages</h1>
        </header>
        <EmptyState
          art="roster"
          title="Nobody to message yet"
          body="Threads appear here once a client has accepted her invitation."
        />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <aside
        className="flex w-[290px] shrink-0 flex-col border-r"
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
      >
        <div className="border-b px-5 pt-6 pb-3.5" style={{ borderColor: 'var(--border)' }}>
          <h1 className="display-face text-2xl font-semibold">Messages</h1>
          <p className="mt-0.5 text-xs ink-2">
            {unreadTotal === 0
              ? 'Nothing waiting on you'
              : `${unreadTotal} unread from ${
                  threads.filter((t) =>
                    t.messages.some((m) => m.sender === 'client' && m.readAt === null),
                  ).length
                } client${unreadTotal === 1 ? '' : 's'}`}
          </p>
        </div>

        <nav className="flex-1 overflow-auto p-2">
          {threads.map((t) => {
            const last = t.messages.at(-1);
            const unread = t.messages.filter(
              (m) => m.sender === 'client' && m.readAt === null,
            ).length;
            const isActive = active?.client.id === t.client.id;

            return (
              <Link
                key={t.client.id}
                href={`/messages?client=${t.client.id}`}
                className="flex gap-2.5 rounded-[16px] px-3 py-3.5 transition-transform hover:-translate-y-px"
                style={{ background: isActive ? 'var(--ghost)' : 'transparent' }}
              >
                <Avatar name={t.name} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`flex-1 truncate text-sm ${unread ? 'font-semibold' : 'font-medium'}`}
                    >
                      {t.name}
                    </span>
                    {last && (
                      <span className="shrink-0 text-[11px] ink-3">{shortWhen(last.createdAt)}</span>
                    )}
                  </div>
                  <div className={`mt-0.5 truncate text-xs ${unread ? '' : 'ink-2'}`}>
                    {last
                      ? `${last.sender === 'coach' ? 'You: ' : ''}${last.body}`
                      : 'No messages yet'}
                  </div>
                </div>
                {unread > 0 && (
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: 'var(--series-1)' }}
                    aria-label={`${unread} unread`}
                  />
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {active ? (
        <section className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--page)' }}>
          <header
            className="flex items-center gap-3.5 border-b px-6 py-4"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <Avatar name={active.name} size={36} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{active.name}</div>
              <div className="text-[11px] ink-2">
                {active.messages.length === 0
                  ? 'No messages yet'
                  : `${active.messages.length} message${active.messages.length === 1 ? '' : 's'}`}
              </div>
            </div>
            <Link
              href={`/clients/${active.client.id}`}
              className="shrink-0 rounded-full px-4 py-2.5 text-xs font-medium transition-transform hover:-translate-y-px"
              style={{ border: '1.5px solid var(--border)', color: 'var(--ink-primary)' }}
            >
              Open client
            </Link>
          </header>

          <div className="flex flex-1 flex-col gap-2.5 overflow-auto p-6">
            {active.messages.length === 0 ? (
              <p className="mx-auto mt-8 max-w-sm text-center text-sm ink-2">
                Nothing here yet. Anything you send lands in her app rather than her inbox, so
                it sits beside the sessions it is about.
              </p>
            ) : (
              active.messages.map((m) => <Bubble key={m.id} message={m} />)
            )}
          </div>

          {/* Keyed so switching thread gives a fresh draft rather than carrying one over. */}
          <Composer
            key={active.client.id}
            clientId={active.client.id}
            clientName={active.name.split(' ')[0] ?? 'her'}
          />
        </section>
      ) : null}
    </div>
  );
}

/**
 * One message.
 *
 * The coach's own words sit right and filled; the client's sit left on a plain surface —
 * the mirror image of what the client sees in her app, which is the convention that needs
 * no explaining in either direction.
 */
function Bubble({ message }: { message: Message }) {
  const mine = message.sender === 'coach';

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[62%] rounded-[22px] px-4 py-3.5"
        style={{
          background: mine ? 'var(--series-1)' : 'var(--surface)',
          border: mine ? 'none' : '1px solid var(--border)',
        }}
      >
        {message.sessionId && (
          <div
            className="mb-2.5 border-b pb-2.5 text-[11px] font-medium tracking-wide"
            style={{
              borderColor: mine ? 'rgba(255,255,255,0.24)' : 'var(--border)',
              color: mine ? 'rgba(255,255,255,0.72)' : 'var(--ink-muted)',
            }}
          >
            About a session
          </div>
        )}
        <div
          className="text-sm leading-relaxed"
          style={{ color: mine ? '#fff' : 'var(--ink-primary)' }}
        >
          {message.body}
        </div>
        <div
          className="mt-1.5 text-[11px]"
          style={{ color: mine ? 'rgba(255,255,255,0.66)' : 'var(--ink-muted)' }}
        >
          {shortWhen(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

/** Time today, weekday this week, date beyond. */
function shortWhen(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const days = Math.floor((new Date().getTime() - d.getTime()) / 86400000);
  if (days <= 0) return time;
  if (days < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
