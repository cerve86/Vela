import Link from 'next/link';
import {
  TODAY,
  adherenceBand,
  clients,
  daysBetween,
  rollupByClient,
  sessionsByClient,
} from '@coachapp/shared';
import { adherenceStyle, palette } from '@coachapp/shared/tokens';
import { Avatar, Card, PainDot, StatTile, StatusPill } from '@/components/ui';
import { Meter, Sparkline } from '@/components/charts';

export const metadata = { title: 'Clients — CoachApp' };

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

function painSeries(clientId: string): number[] {
  return (sessionsByClient.get(clientId) ?? [])
    .filter((s) => s.status === 'completed' && s.painAfter !== null)
    .slice(-14)
    .map((s) => s.painAfter as number);
}

function lastActivityLabel(iso: string | null): string {
  if (!iso) return 'Never';
  const d = daysBetween(iso, TODAY);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

const SEVERITY_RANK = { critical: 0, warn: 1, info: 2 } as const;

export default function ClientsPage() {
  const rows = clients.map((c) => ({ client: c, rollup: rollupByClient.get(c.id)! }));

  const needsAttention = rows
    .filter((r) => r.rollup.alerts.some((a) => a.severity !== 'info'))
    .sort((a, b) => {
      const rank = (x: typeof a) =>
        Math.min(...x.rollup.alerts.map((al) => SEVERITY_RANK[al.severity]));
      return rank(a) - rank(b);
    });

  const onTrack = rows.filter((r) => !needsAttention.includes(r));

  const sessionsToday = rows.reduce(
    (n, r) =>
      n +
      (sessionsByClient.get(r.client.id) ?? []).filter(
        (s) => s.scheduledDate === TODAY && s.status !== 'skipped',
      ).length,
    0,
  );
  const avgAdherence =
    rows.reduce((sum, r) => sum + r.rollup.adherence7d, 0) / Math.max(rows.length, 1);

  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-[30px] font-extrabold">Clients</h1>
          <p className="mt-0.5 text-sm ink-2">
            Monday 10 August 2026 · {rows.length} active
          </p>
        </div>
        <button
          className="display-face rounded-full px-4 py-2.5 text-sm font-semibold text-white"
          style={{ background: palette.brand[700] }}
        >
          Invite client
        </button>
      </header>

      <div className="mb-6 grid grid-cols-4 gap-3">
        <StatTile
          label="Need attention"
          value={String(needsAttention.length)}
          hint="Open alerts today"
        />
        <StatTile label="Sessions scheduled today" value={String(sessionsToday)} />
        <StatTile
          label="Avg adherence"
          value={pct(avgAdherence)}
          hint="Last 7 days across roster"
        />
        <StatTile label="Active clients" value={String(rows.length)} hint="0 invites pending" />
      </div>

      {needsAttention.length > 0 && (
        <Card
          title="Needs attention"
          className="mb-6"
          action={<span className="text-xs ink-3">Sorted by severity</span>}
        >
          <ul className="space-y-2">
            {needsAttention.map(({ client, rollup }) => (
              <li key={client.id}>
                <Link
                  href={`/clients/${client.id}`}
                  className="flex items-center gap-4 rounded-[16px] p-3.5 transition-colors hover:bg-[var(--ghost)]"
                >
                  <Avatar name={`${client.firstName} ${client.lastName}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {client.firstName} {client.lastName}
                      </span>
                      <span className="truncate text-xs ink-3">{client.condition}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {rollup.alerts.map((a) => (
                        <StatusPill
                          key={a.kind}
                          tone={a.severity === 'critical' ? 'critical' : a.severity === 'warn' ? 'warning' : 'neutral'}
                        >
                          {a.message}
                        </StatusPill>
                      ))}
                    </div>
                  </div>
                  <div className="w-28 shrink-0">
                    <Meter
                      value={rollup.adherence7d}
                      color={adherenceStyle[adherenceBand(rollup.adherence7d)].color}
                      label="Adherence"
                      valueLabel={pct(rollup.adherence7d)}
                    />
                  </div>
                  <div className="w-24 shrink-0 text-right">
                    <div className="text-xs ink-3">Last seen</div>
                    <div className="text-sm">{lastActivityLabel(rollup.lastActivityAt)}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="All clients">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs ink-3">
                <th className="pb-2 font-medium">Client</th>
                <th className="pb-2 font-medium">Adherence 7d</th>
                <th className="pb-2 font-medium">Pain trend</th>
                <th className="pb-2 font-medium">Avg pain</th>
                <th className="pb-2 font-medium">Weight 28d</th>
                <th className="pb-2 font-medium">Last activity</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {[...needsAttention, ...onTrack].map(({ client, rollup }) => {
                const band = adherenceBand(rollup.adherence7d);
                const trendColor =
                  rollup.painTrend === 'improving'
                    ? palette.status.good
                    : rollup.painTrend === 'worsening'
                      ? palette.status.critical
                      : 'var(--series-1)';
                return (
                  <tr key={client.id} className="border-b last:border-0">
                    <td className="py-3">
                      <Link
                        href={`/clients/${client.id}`}
                        className="flex items-center gap-2.5 hover:underline"
                      >
                        <Avatar name={`${client.firstName} ${client.lastName}`} size={28} />
                        <span>
                          <span className="font-medium">
                            {client.firstName} {client.lastName}
                          </span>
                          <span className="block text-xs ink-3">{client.condition}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="py-3">
                      <span className="tnum" style={{ color: 'var(--ink-primary)' }}>
                        {pct(rollup.adherence7d)}
                      </span>
                      <span className="ml-1.5 text-xs ink-3">
                        {rollup.sessionsCompleted7d}/{rollup.sessionsScheduled7d}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="flex items-center gap-2">
                        <Sparkline values={painSeries(client.id)} color={trendColor} />
                        <span className="text-xs ink-2">{rollup.painTrend}</span>
                      </span>
                    </td>
                    <td className="py-3">
                      <PainDot score={rollup.avgPain7d} />
                    </td>
                    <td className="tnum py-3">
                      {rollup.weightDelta28dKg === null
                        ? '—'
                        : `${rollup.weightDelta28dKg > 0 ? '+' : ''}${rollup.weightDelta28dKg} kg`}
                    </td>
                    <td className="py-3 ink-2">{lastActivityLabel(rollup.lastActivityAt)}</td>
                    <td className="py-3">
                      <StatusPill
                        tone={band === 'good' ? 'good' : band === 'watch' ? 'warning' : 'critical'}
                      >
                        {adherenceStyle[band].label}
                      </StatusPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
