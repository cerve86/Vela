import Link from 'next/link';
import type { FuelCheckRow } from '@vela/api';
import { FUEL_ENOUGH_LABEL, summariseFuelChecks } from '@vela/shared';
import { Card, StatusPill } from '@/components/ui';

/**
 * Every client's fuelling checks over the window, one row each: how often she fuelled as
 * planned, how often it felt about right, and the times it did not. Clients it is not
 * working for come first; each row opens her Nutrition tab, where the answers are.
 */
export function FuelRoster({
  clients,
  checks,
  days,
}: {
  clients: { id: string; name: string }[];
  checks: FuelCheckRow[];
  days: number;
}) {
  const rows = clients.map((c) => {
    const mine = checks.filter((k) => k.clientId === c.id);
    return { ...c, latest: mine[0] ?? null, s: summariseFuelChecks(mine) };
  });
  const concern = (r: (typeof rows)[number]) => r.s.ranOut + r.s.gutHard + r.s.short;
  rows.sort((a, b) => concern(b) - concern(a) || b.s.answered - a.s.answered);
  const answered = rows.filter((r) => r.s.answered > 0).length;

  return (
    <Card title={`How fuelling went · ${days} days`}>
      <p className="mb-3 text-sm ink-2">
        After a long run, a quality session or a strength day, each client answers three taps: did
        she fuel as planned, was it enough for the session, and how was her stomach.{' '}
        {answered === 0
          ? 'No answers yet — they arrive with app version 0.3.18.'
          : `${answered} of ${rows.length} clients answered in the last ${days} days.`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs ink-3">
              <th className="pb-2 font-medium">Client</th>
              <th className="pb-2 font-medium">Check-ins</th>
              <th className="pb-2 font-medium">As planned</th>
              <th className="pb-2 font-medium">About right</th>
              <th className="pb-2 font-medium">Ran short</th>
              <th className="pb-2 font-medium">Stomach</th>
              <th className="pb-2 font-medium">Latest</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2.5 pr-3 font-medium whitespace-nowrap">
                  <Link href={`/clients/${r.id}/nutrition`} className="hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="tnum py-2.5 pr-3 ink-2">{r.s.answered || '—'}</td>
                <td className="tnum py-2.5 pr-3">
                  {r.s.answered ? `${r.s.followed}/${r.s.answered}` : '—'}
                </td>
                <td className="tnum py-2.5 pr-3">
                  {r.s.answered ? `${r.s.right}/${r.s.answered}` : '—'}
                </td>
                <td className="tnum py-2.5 pr-3">
                  {r.s.answered ? (
                    r.s.ranOut ? (
                      <StatusPill tone="serious">
                        {r.s.short} · {r.s.ranOut} ran out
                      </StatusPill>
                    ) : (
                      r.s.short
                    )
                  ) : (
                    '—'
                  )}
                </td>
                <td className="tnum py-2.5 pr-3">
                  {r.s.answered ? (
                    r.s.gutHard ? (
                      <StatusPill tone="warning">
                        {r.s.gut} · {r.s.gutHard} slowed or stopped
                      </StatusPill>
                    ) : (
                      r.s.gut
                    )
                  ) : (
                    '—'
                  )}
                </td>
                <td className="py-2.5 whitespace-nowrap ink-2">
                  {r.latest
                    ? `${r.latest.title}${r.latest.enough ? ` · ${FUEL_ENOUGH_LABEL[r.latest.enough]}` : ''}`
                    : 'No check-ins yet'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
