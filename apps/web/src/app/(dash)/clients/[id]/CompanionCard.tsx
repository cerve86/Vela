import Link from 'next/link';
import { OctagonAlert } from 'lucide-react';
import { palette } from '@vela/shared/tokens';
import { Card, StatusPill } from '@/components/ui';
import type { CompanionData, CompanionVerdict, ShareResult } from './companion';
import { CompanionRaceForm } from './CompanionRaceForm';

/** The words she tapped, 0 → 2, as the companion shows them. */
const ANSWERS = {
  sleep: ['Rough', 'OK', 'Good'],
  legs: ['Heavy', 'Normal', 'Fresh'],
  energy: ['Low', 'Meh', 'Good'],
  lastSession: ['Hard', 'Moderate', 'Easy'],
} as const;

const VERDICT: Record<CompanionVerdict, { label: string; tone: 'good' | 'warning' | 'serious' }> = {
  go: { label: 'Good to go', tone: 'good' },
  ease: { label: 'Ease in', tone: 'warning' },
  easy: { label: 'Keep it easy', tone: 'serious' },
  rest: { label: 'Rest day', tone: 'good' },
};

const RESULT: Record<ShareResult, { label: string; tone: 'good' | 'warning' | 'critical' }> = {
  clear: { label: 'Clear', tone: 'good' },
  watch: { label: 'Worth watching', tone: 'warning' },
  flag: { label: 'Flag', tone: 'critical' },
};

/**
 * What she told the companion: her morning checks with the verdict she was shown, the
 * nutrition results she chose to share, and the race you set for her countdown.
 *
 * An energy flag sits at the top of the card in the critical colour, because it is the one
 * result here that should change what happens next: it points to a GP visit, and she is
 * more likely to book one when her coach brings it up.
 */
export function CompanionCard({
  clientId,
  firstName,
  data,
  todayIso,
}: {
  clientId: string;
  firstName: string;
  data: CompanionData;
  todayIso: string;
}) {
  const { checks, share } = data;
  const energyFlag = share?.energy === 'flag';

  return (
    <Card
      title="Companion"
      action={<span className="text-xs ink-3">Morning checks · last 14 days</span>}
    >
      {data.failed && (
        <p className="mb-3 text-sm" style={{ color: palette.status.critical }} role="status">
          Some of her companion data could not be loaded. Reload the page to try again.
        </p>
      )}

      {share && energyFlag && (
        <div
          className="mb-4 flex items-start gap-3 rounded-[14px] p-4"
          style={{ background: 'var(--ghost)', borderLeft: `4px solid ${palette.status.critical}` }}
        >
          <OctagonAlert
            size={20}
            strokeWidth={2.2}
            aria-hidden
            className="mt-0.5 shrink-0"
            style={{ color: palette.status.critical }}
          />
          <div className="min-w-0 flex-1">
            <div className="display-face text-[15px] font-semibold">
              Her nutrition check flagged low energy
            </div>
            <p className="mt-0.5 text-sm ink-2">
              Shared {longDate(share.sharedAt.slice(0, 10))}. Her answers suggest she may not be
              eating enough for her training
              {share.periodsFlag ? ', and her periods have stopped or become irregular' : ''}. This
              suggests a GP visit. A message from you is a good way to raise it.
            </p>
            <Link
              href={`/messages?client=${clientId}`}
              className="mt-2 inline-block text-sm font-medium underline"
              style={{ color: palette.brand[700] }}
            >
              Message {firstName}
            </Link>
          </div>
        </div>
      )}

      {checks.length === 0 ? (
        <p className="text-sm ink-2">
          No morning checks in the last 14 days. {firstName} answers four quick questions on Today
          in the companion, and they appear here with the verdict she was shown.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs ink-3">
                <th className="pb-2 pr-3 font-medium">Day</th>
                <th className="pb-2 pr-3 font-medium">Sleep</th>
                <th className="pb-2 pr-3 font-medium">Legs</th>
                <th className="pb-2 pr-3 font-medium">Energy</th>
                <th className="pb-2 pr-3 font-medium">Last session</th>
                <th className="pb-2 pr-3 font-medium">She was shown</th>
                <th className="pb-2 pr-3 font-medium">HRV</th>
                <th className="pb-2 font-medium">Resting HR</th>
              </tr>
            </thead>
            <tbody className="tnum">
              {checks.map((c) => (
                <tr key={c.logDate} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="py-2 pr-3 whitespace-nowrap">{shortDate(c.logDate)}</td>
                  <Answer words={ANSWERS.sleep} value={c.sleep} />
                  <Answer words={ANSWERS.legs} value={c.legs} />
                  <Answer words={ANSWERS.energy} value={c.energy} />
                  {/* A hard last session is information, not a warning, so it is not coloured. */}
                  <Answer words={ANSWERS.lastSession} value={c.lastSession} plain />
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {c.verdict ? (
                      <StatusPill tone={VERDICT[c.verdict].tone}>
                        {VERDICT[c.verdict].label}
                      </StatusPill>
                    ) : (
                      <span className="ink-3">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {c.hrv !== null ? `${c.hrv} ms` : <span className="ink-3">—</span>}
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    {c.rhr !== null ? `${c.rhr} bpm` : <span className="ink-3">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs ink-3">
            Rough sleep, heavy legs and low energy are shown in amber. HRV and resting HR appear
            only when she typed them in; synced readings are under Vitals.
          </p>
        </div>
      )}

      <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
        <h3 className="text-xs font-medium ink-2">Nutrition check</h3>
        {share ? (
          <>
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm" aria-label="Shared results">
              {(
                [
                  ['Energy', share.energy],
                  ['Iron', share.iron],
                  ['Vitamin D', share.vitaminD],
                ] as const
              ).map(([label, r]) => (
                <li key={label} className="flex items-center gap-2">
                  <span className="ink-2">{label}</span>
                  <StatusPill tone={RESULT[r].tone}>{RESULT[r].label}</StatusPill>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs ink-3">
              Shared {longDate(share.sharedAt.slice(0, 10))}. Only these results reach you; her
              answers stay on her phone.
              {share.periodsFlag && !energyFlag
                ? ' She reported that her periods have stopped or become irregular.'
                : ''}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm ink-2">
            Nothing shared yet. Her nutrition check stays on her phone unless she chooses to send
            you the results.
          </p>
        )}
      </div>

      <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
        <h3 className="text-xs font-medium ink-2">Race</h3>
        {data.raceDate && (
          <p className="mt-1 text-sm">
            {data.raceName ?? 'Race day'} · {longDate(data.raceDate)}
            <span className="ink-3"> · {countdown(data.raceDate, todayIso)}</span>
          </p>
        )}
        <CompanionRaceForm
          clientId={clientId}
          raceName={data.raceName ?? ''}
          raceDate={data.raceDate ?? ''}
        />
      </div>
    </Card>
  );
}

function Answer({
  words,
  value,
  plain = false,
}: {
  words: readonly string[];
  value: number | null;
  plain?: boolean;
}) {
  if (value === null)
    return (
      <td className="py-2 pr-3">
        <span className="ink-3">—</span>
      </td>
    );
  const low = value === 0 && !plain;
  return (
    <td
      className="py-2 pr-3 whitespace-nowrap"
      style={{
        color: low ? palette.status.warning : undefined,
        fontWeight: low ? 600 : undefined,
      }}
    >
      {words[value] ?? '—'}
    </td>
  );
}

function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "6 weeks to go", "10 days to go", "today", "was 3 days ago" — what her strip will say. */
function countdown(raceIso: string, todayIso: string): string {
  const days = Math.round(
    (Date.parse(`${raceIso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000,
  );
  if (days === 0) return 'today';
  if (days < 0) return `was ${-days} day${days === -1 ? '' : 's'} ago`;
  if (days < 21) return `${days} day${days === 1 ? '' : 's'} to go`;
  return `${Math.floor(days / 7)} weeks to go`;
}
