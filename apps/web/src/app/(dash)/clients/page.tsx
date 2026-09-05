import Link from 'next/link';
import {
  adherenceBand,
  adherenceStyle,
  rosterRollups,
  shiftDate,
  type RosterRollup,
} from '@vela/shared';
import { palette } from '@vela/shared/tokens';
import { Meter } from '@/components/charts';
import { Avatar, Card, EmptyState, StatTile, StatusPill } from '@/components/ui';
import { createServerSupabase } from '@/lib/supabase/server';
import { ClientCard, sinceWords, type RosterClient } from './ClientCard';

export const metadata = { title: 'Clients — Vela' };

const SEVERITY_RANK = { critical: 0, warn: 1, info: 2 } as const;

/**
 * The roster.
 *
 * Every row came back through row level security — there is no `coach_id` filter in any
 * query here, because the database applies it. Not writing one is what makes a mistake in
 * this file harmless rather than a disclosure.
 *
 * Four queries for the whole roster rather than four per client: a roster of thirty would
 * otherwise open a hundred round trips to draw one page. The per-client arithmetic lives
 * in `rosterRollups`, pure and tested, so the number on a card and the alert that put the
 * client at the top of the page can never disagree.
 */
export default async function ClientsPage() {
  const supabase = await createServerSupabase();

  const today = new Date().toISOString().slice(0, 10);
  const since28 = shiftDate(today, -27);
  const since7 = shiftDate(today, -6);

  const [
    { data: clients },
    { data: sessions },
    { data: metrics },
    { data: reads },
    { count: logged },
  ] = await Promise.all([
    supabase
      .from('clients')
      .select(
        'id, email, first_name_hint, last_name_hint, condition, goal, status, weeks_postpartum, created_at',
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('sessions')
      .select('client_id, status, scheduled_date, pain_after, completed_at')
      .gte('scheduled_date', since28),
    supabase
      .from('metrics')
      .select('client_id, type, value, recorded_at')
      .in('type', ['weight_kg', 'resting_hr', 'hrv_ms'])
      .gte('recorded_at', `${since28}T00:00:00Z`)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('daily_reads')
      .select('client_id, read_on, readiness, created_at')
      .gte('read_on', since7),
    supabase
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed'),
  ]);

  const rows = (clients ?? []).map<RosterClient & { email: string; createdAt: string }>((c) => ({
    id: c.id,
    name: `${c.first_name_hint ?? ''} ${c.last_name_hint ?? ''}`.trim() || c.email,
    email: c.email,
    condition: c.condition,
    goal: c.goal,
    status: c.status,
    weeksPostpartum: c.weeks_postpartum,
    createdAt: c.created_at,
  }));

  const rollups = rosterRollups({
    clientIds: rows.map((c) => c.id),
    today,
    sessions: (sessions ?? []).map((s) => ({
      clientId: s.client_id,
      scheduledDate: s.scheduled_date,
      status: s.status,
      painAfter: s.pain_after,
      completedAt: s.completed_at,
    })),
    metrics: (metrics ?? []).map((m) => ({
      clientId: m.client_id,
      type: m.type,
      value: Number(m.value),
      recordedAt: m.recorded_at,
    })),
    reads: (reads ?? []).map((r) => ({
      clientId: r.client_id,
      readOn: r.read_on,
      readiness: r.readiness,
      createdAt: r.created_at,
    })),
  });

  const training = rows.filter((c) => c.status !== 'invited');
  const invited = rows.filter((c) => c.status === 'invited');
  const active = rows.filter((c) => c.status === 'active');

  const rank = (r: RosterRollup) =>
    r.alerts.length === 0 ? 3 : Math.min(...r.alerts.map((a) => SEVERITY_RANK[a.severity]));
  const needsAttention = training
    .filter((c) => rollups.get(c.id)!.alerts.some((a) => a.severity !== 'info'))
    .sort((a, b) => rank(rollups.get(a.id)!) - rank(rollups.get(b.id)!));
  const ordered = [...training].sort(
    (a, b) => rank(rollups.get(a.id)!) - rank(rollups.get(b.id)!) || a.name.localeCompare(b.name),
  );

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

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Active clients"
          value={String(active.length)}
          hint="Accepted and training"
        />
        <StatTile
          label="Needs attention"
          value={String(needsAttention.length)}
          hint="Missed sessions, high pain, or gone quiet"
        />
        <StatTile
          label="Awaiting acceptance"
          value={String(invited.length)}
          hint="Invited, not yet signed in"
        />
        <StatTile
          label="Sessions logged"
          value={String(logged ?? 0)}
          hint="Completed in the app, all time"
        />
      </div>

      {needsAttention.length > 0 && (
        <Card
          title="Needs attention"
          className="mb-6"
          action={<span className="text-xs ink-3">Sorted by severity</span>}
        >
          <ul className="space-y-1">
            {needsAttention.map((client) => {
              const r = rollups.get(client.id)!;
              return (
                <li key={client.id}>
                  <Link
                    href={`/clients/${client.id}`}
                    className="flex items-center gap-4 rounded-[16px] p-3.5 transition-colors hover:bg-[var(--ghost)]"
                  >
                    <Avatar name={client.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{client.name}</span>
                        <span className="truncate text-xs ink-3">{client.condition}</span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.alerts.map((a) => (
                          <StatusPill
                            key={a.kind}
                            tone={
                              a.severity === 'critical'
                                ? 'critical'
                                : a.severity === 'warn'
                                  ? 'warning'
                                  : 'neutral'
                            }
                          >
                            {a.message}
                          </StatusPill>
                        ))}
                      </div>
                    </div>
                    <div className="hidden w-28 shrink-0 sm:block">
                      {r.adherence7d === null ? (
                        <span className="text-xs ink-3">Nothing due</span>
                      ) : (
                        <Meter
                          value={r.adherence7d}
                          color={adherenceStyle[adherenceBand(r.adherence7d)].color}
                          label="Adherence"
                          valueLabel={`${Math.round(r.adherence7d * 100)}%`}
                        />
                      )}
                    </div>
                    <div className="w-24 shrink-0 text-right">
                      <div className="text-xs ink-3">Last seen</div>
                      <div className="text-sm">
                        {r.lastActivityAt
                          ? cap(sinceWords(r.daysSinceLastActivity ?? 0))
                          : 'Not yet'}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState
          art="roster"
          title="Nobody on the roster yet"
          body="Invite your first client and she'll appear here as soon as she accepts."
        />
      ) : (
        <>
          {training.length > 0 && (
            <section className="mb-6">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="display-face text-[15px] font-semibold">All clients</h2>
                <span className="text-xs ink-3">Those needing attention first</span>
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {ordered.map((client) => (
                  <ClientCard key={client.id} client={client} rollup={rollups.get(client.id)!} />
                ))}
              </div>
            </section>
          )}

          {invited.length > 0 && (
            <Card title="Awaiting acceptance" className="mb-6">
              <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {invited.map((client) => (
                  <li key={client.id} className="flex items-center gap-3 py-2.5">
                    <Avatar name={client.name} size={28} />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium">{client.name}</span>
                      <span className="ml-2 text-xs ink-3">{client.email}</span>
                    </div>
                    <span className="text-xs ink-3">
                      Invited {invitedWords(client.createdAt, today)}
                    </span>
                    <StatusPill tone="warning">Awaiting</StatusPill>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <p className="text-xs ink-3">
        Adherence counts only sessions already due, so a quiet Monday is not a miss. Symptom scores
        are what she reported after each session; weight and resting heart rate come from Apple
        Health when connected.
      </p>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function invitedWords(createdAt: string, today: string): string {
  const days = Math.floor(
    (new Date(`${today}T00:00:00Z`).getTime() -
      new Date(`${createdAt.slice(0, 10)}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  return sinceWords(days);
}
