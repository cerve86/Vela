'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FLAG_LABEL, type CoachFlag, type FlagKind } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { resolveFlagAction } from '@/app/(dash)/clients/[id]/actions';

const TONE: Record<FlagKind, string> = {
  acute: palette.status.critical,
  pain: palette.status.critical,
  pelvic_floor: palette.status.critical,
  readiness_low: palette.status.warning,
  divergence: palette.status.warning,
  hold: palette.brand[600],
};

/**
 * Flags awaiting the coach, each with what she can do about it.
 *
 * A hold is a question about today — she answers with what the session becomes, and the
 * client sees that answer. Everything else is information she acknowledges once she has
 * acted on it, by message or in person. Nothing here reaches the client by itself.
 */
export function FlagsPanel({
  flags,
  names,
  compact = false,
}: {
  flags: CoachFlag[];
  /** client id → name, for the dashboard's list across clients. */
  names?: Record<string, string>;
  compact?: boolean;
}) {
  if (flags.length === 0) return null;
  return (
    <section
      className="rounded-[20px] p-4 sm:p-5"
      style={{ background: 'var(--surface)', boxShadow: '0 10px 30px rgba(18,23,43,0.06)' }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="display-face text-[17px] font-bold">Needs your decision</h2>
        <span className="text-xs ink-3 tnum">
          {flags.length} open · the client sees none of these
        </span>
      </div>
      <ul className="mt-3 grid gap-2">
        {flags.map((f) => (
          <FlagRow key={f.id} flag={f} name={names?.[f.clientId]} compact={compact} />
        ))}
      </ul>
    </section>
  );
}

function FlagRow({ flag, name, compact }: { flag: CoachFlag; name?: string; compact: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const act = (input: Parameters<typeof resolveFlagAction>[1]) =>
    startTransition(async () => {
      setError(null);
      const res = await resolveFlagAction(flag.id, input);
      if (!res.ok) setError(res.error ?? 'Could not save.');
      else router.refresh();
    });

  const btn =
    'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40';
  const when = new Date(flag.createdAt).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Singapore',
  });

  return (
    <li className="rounded-[14px] p-3" style={{ background: 'var(--ghost)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white"
          style={{ background: TONE[flag.kind] }}
        >
          {FLAG_LABEL[flag.kind]}
        </span>
        {name && (
          <Link
            href={`/clients/${flag.clientId}`}
            className="text-sm font-semibold hover:underline"
          >
            {name}
          </Link>
        )}
        <span className="ml-auto text-xs ink-3">{when}</span>
      </div>
      <p className="mt-1.5 text-sm">{flag.detail}</p>
      {!compact && (
        <>
          {flag.kind === 'hold' ? (
            <div className="mt-2 grid gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={240}
                placeholder="Optional line for her, e.g. 30 min easy spin, low resistance"
                className="rounded-[10px] px-2.5 py-1.5 text-sm outline-none"
                style={{ background: 'var(--surface)', color: 'var(--ink-primary)' }}
                aria-label="Note for the client"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  className={btn}
                  style={{ background: palette.brand[600], color: '#fff' }}
                  onClick={() => act({ resolution: 'low_impact', adjustTo: 'low_impact', note })}
                >
                  Low impact (walk or spin)
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className={btn}
                  style={{ background: 'var(--surface)' }}
                  onClick={() => act({ resolution: 'strength', adjustTo: 'strength', note })}
                >
                  Strength day
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className={btn}
                  style={{ background: 'var(--surface)' }}
                  onClick={() => act({ resolution: 'gentle', adjustTo: 'gentle', note })}
                >
                  Keep the gentle version
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className={btn}
                  style={{ background: 'var(--surface)' }}
                  onClick={() => act({ resolution: 'as_planned', adjustTo: 'as_planned', note })}
                >
                  As planned
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                className={btn}
                style={{ background: palette.brand[600], color: '#fff' }}
                onClick={() => act({ resolution: 'acknowledged' })}
              >
                Seen — I&rsquo;m on it
              </button>
              <Link
                href={`/messages?client=${flag.clientId}`}
                className={btn}
                style={{ background: 'var(--surface)' }}
              >
                Message her
              </Link>
            </div>
          )}
          {error && (
            <p className="mt-1 text-xs" style={{ color: palette.status.critical }}>
              {error}
            </p>
          )}
        </>
      )}
    </li>
  );
}
