import Link from 'next/link';
import { adherenceBand, adherenceStyle, painColor, painLabel } from '@vela/shared';
import { palette } from '@vela/shared/tokens';
import { Avatar, Card, EmptyState, StatTile, StatusPill } from '@/components/ui';
import { createServerSupabase } from '@/lib/supabase/server';

export const metadata = { title: 'Clients — Vela' };

/**
 * The roster.
 *
 * Every row came back through row level security — there is no `coach_id` filter in any
 * query here, because the database applies it. Not writing one is what makes a mistake in
 * this file harmless rather than a disclosure.
 *
 * The columns are chosen to answer one question on sight: who needs me this week. A name
 * and a status cannot answer it, which is why adherence and the last symptom score sit on
 * the row rather than two clicks inside it.
 */
export default async function ClientsPage() {
  const supabase = await createServerSupabase();

  const since = daysBack(6);

  const [{ data: clients }, { data: sessions }, { count: logged }] = await Promise.all([
    supabase
      .from('clients')
      .select(
        'id, email, first_name_hint, last_name_hint, condition, goal, status, started_on, weeks_postpartum, profile_id',
      )
      .order('created_at', { ascending: false }),
    // One query for every client's week rather than one per row: a roster of thirty would
    // otherwise open thirty round trips to render a single table.
    supabase
      .from('sessions')
      .select('client_id, status, scheduled_date, pain_after, completed_at')
      .gte('scheduled_date', since),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
  ]);

  const rows = clients ?? [];
  const week = sessions ?? [];
  const active = rows.filter((c) => c.status === 'active');
  const invited = rows.filter((c) => c.status === 'invited');

  const todayIso = daysBack(0);

  /** Per-client week summary, computed once. */
  const summary = new Map(
    rows.map((c) => {
      const mine = week.filter((s) => s.client_id === c.id);
      // Only what has already come due counts against her. Measuring Wednesday against
      // Friday's session reports a miss for work still ahead.
      const due = mine.filter((s) => s.scheduled_date <= todayIso);
      const done = due.filter((s) => s.status === 'completed');
      const withPain = mine
        .filter((s) => s.pain_after !== null)
        .sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : -1));
      const lastDone = [...done].sort((a, b) =>
        (a.completed_at ?? '') < (b.completed_at ?? '') ? 1 : -1,
      )[0];

      return [
        c.id,
        {
          due: due.length,
          done: done.length,
          ratio: due.length ? done.length / due.length : null,
          painAfter: withPain[0]?.pain_after ?? null,
          lastSeen: lastDone?.completed_at ?? null,
        },
      ] as const;
    }),
  );

  const needsEye = rows.filter((c) => {
    const s = summary.get(c.id);
    return s && ((s.painAfter !== null && s.painAfter >= 6) || (s.ratio !== null && s.ratio < 0.5));
  });

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
          className="display-face rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-px"
          style={{ background: palette.brand[600] }}
        >
          Invite client
        </Link>
      </header>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active clients" value={String(active.length)} hint="Accepted and training" />
        <StatTile
          label="Awaiting acceptance"
          value={String(invited.length)}
          hint="Invited, email not yet verified"
        />
        <StatTile
          label="Needs your eye"
          value={String(needsEye.length)}
          hint="High symptoms or under half their sessions"
        />
        <StatTile
          label="Sessions logged"
          value={String(logged ?? 0)}
          hint="Completed in the app, all time"
        />
      </div>

      <Card title="All clients">
        {rows.length === 0 ? (
          <EmptyState
            art="roster"
            title="Nobody on the roster yet"
            body="Invite your first client and she'll appear here as soon as she accepts."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] ink-2">
                  {['Client', 'Condition', 'Adherence · 7d', 'Symptoms after', 'Last seen', 'Status'].map(
                    (h) => (
                      <th
                        key={h}
                        className="border-b px-2 pt-2.5 pb-2 font-medium whitespace-nowrap"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const s = summary.get(c.id)!;
                  const name =
                    [c.first_name_hint, c.last_name_hint].filter(Boolean).join(' ') || c.email;
                  const openable = c.status !== 'invited';

                  return (
                    <tr key={c.id} className="group">
                      <td className="border-b px-2 py-3" style={{ borderColor: 'var(--border)' }}>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={name} size={30} />
                          <div className="min-w-0">
                            {openable ? (
                              <Link
                                href={`/clients/${c.id}`}
                                className="font-medium hover:underline"
                                style={{ color: 'var(--ink-primary)' }}
                              >
                                {name}
                              </Link>
                            ) : (
                              <span className="font-medium">{name}</span>
                            )}
                            <div className="text-[11px] ink-2">
                              {c.weeks_postpartum != null
                                ? `Week ${c.weeks_postpartum} postpartum`
                                : c.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td
                        className="border-b px-2 py-3 ink-2"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        {c.condition ?? '—'}
                      </td>

                      <td className="border-b px-2 py-3" style={{ borderColor: 'var(--border)' }}>
                        {s.ratio === null ? (
                          <span className="text-xs ink-3">Nothing due yet</span>
                        ) : (
                          <div className="flex items-center gap-2.5">
                            <div
                              className="h-1.5 w-[60px] shrink-0 overflow-hidden rounded-full"
                              style={{ background: 'var(--ghost)' }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.round(s.ratio * 100)}%`,
                                  background: adherenceStyle[adherenceBand(s.ratio)].color,
                                }}
                              />
                            </div>
                            <span className="tnum text-xs">
                              {s.done}/{s.due}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="border-b px-2 py-3" style={{ borderColor: 'var(--border)' }}>
                        {s.painAfter === null ? (
                          <span className="text-xs ink-3">Not recorded</span>
                        ) : (
                          // Dot plus word, never colour alone — the same rule the charts follow.
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-block h-2 w-2 shrink-0 rounded-full"
                              style={{ background: painColor(s.painAfter) }}
                            />
                            <span className="text-xs">
                              {painLabel(s.painAfter)}
                              <span className="tnum ink-3"> · {s.painAfter}</span>
                            </span>
                          </span>
                        )}
                      </td>

                      <td
                        className="border-b px-2 py-3 text-xs ink-2 whitespace-nowrap"
                        style={{ borderColor: 'var(--border)' }}
                      >
                        {s.lastSeen ? sinceWords(s.lastSeen) : 'Not yet'}
                      </td>

                      <td className="border-b px-2 py-3" style={{ borderColor: 'var(--border)' }}>
                        <StatusPill tone={statusTone(c.status)}>
                          {c.status === 'invited' ? 'Awaiting' : cap(c.status)}
                        </StatusPill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-4 text-xs ink-3">
          Adherence counts only sessions already due, so a quiet Monday is not a miss. Rows for
          clients who have not accepted their invitation do not open yet.
        </p>
      </Card>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Status maps to a tone, and the pill always carries the word beside the icon. */
function statusTone(status: string): 'good' | 'warning' | 'neutral' {
  if (status === 'active') return 'good';
  if (status === 'invited' || status === 'paused') return 'warning';
  return 'neutral';
}

/**
 * An ISO date `n` days back.
 *
 * A function rather than an inline expression because the clock is impure, and reading it
 * straight in a component body is what the purity lint rule exists to catch — it renders
 * fine on a server component and rots the moment the same code is used on the client.
 */
function daysBack(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** "Today", "Yesterday", "3 days ago" — the resolution a coach actually reads. */
function sinceWords(iso: string): string {
  const days = Math.floor((new Date().getTime() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  return `${Math.floor(days / 7)} weeks ago`;
}
