'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { PowerLadder } from '@vela/api';
import { POWER_LADDER_RULES, POWER_LEVELS } from '@vela/shared';
import { palette } from '@vela/shared/tokens';
import { Card } from '@/components/ui';
import { setPowerLevelAction } from './actions';

/**
 * Where she is on the power and elasticity ladder, and the coach's tick to move her. Up
 * one level at a time, only past cleared pelvic-floor and shin gates; down any time. Every
 * change is kept with its note.
 */
export function PowerLadderCard({
  clientId,
  ladder,
  gatesCleared,
}: {
  clientId: string;
  ladder: PowerLadder;
  gatesCleared: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const level = ladder.level ?? 0;
  const next = level < 4 ? level + 1 : null;
  const blocked = next !== null && next > 1 && !gatesCleared;

  const move = (to: number) =>
    startTransition(async () => {
      setError(null);
      const res = await setPowerLevelAction(clientId, to, note);
      if (!res.ok) setError(res.error ?? 'Could not save.');
      else {
        setNote('');
        router.refresh();
      }
    });

  return (
    <Card title="Power ladder">
      <ol className="grid grid-cols-2 gap-1.5">
        {POWER_LEVELS.map((l) => {
          const on = l.level <= level;
          return (
            <li
              key={l.level}
              className="rounded-[10px] px-2 py-1.5 text-[11.5px] leading-snug"
              style={{
                background: on ? palette.brand[600] : 'var(--ghost)',
                color: on ? '#fff' : 'var(--ink-secondary)',
              }}
              title={l.work}
            >
              <b className="block text-xs">{l.name}</b>
              {l.work}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs ink-3">{POWER_LADDER_RULES}</p>

      {next !== null && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What made the gate clean (optional)"
            className="min-w-0 flex-1 rounded-[10px] px-2.5 py-1.5 text-sm outline-none"
            style={{ background: 'var(--ghost)', color: 'var(--ink-primary)' }}
            aria-label="Note"
          />
          <button
            type="button"
            disabled={pending || blocked}
            onClick={() => move(next)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            style={{ background: palette.brand[600] }}
          >
            {level === 0 ? 'Start her on L1' : `Gate clean — move to L${next}`}
          </button>
        </div>
      )}
      {blocked && (
        <p className="mt-1.5 text-xs" style={{ color: palette.status.warning }}>
          Clear her pelvic-floor and shin gates (Movement gates) before L{next}.
        </p>
      )}
      {level > 1 && (
        <button
          type="button"
          disabled={pending}
          onClick={() => move(level - 1)}
          className="mt-2 text-xs underline ink-2 disabled:opacity-40"
        >
          Back to L{level - 1}
        </button>
      )}
      {ladder.log.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs ink-2">
          {ladder.log.slice(0, 4).map((e, i) => (
            <li key={i}>
              L{e.level} ·{' '}
              {new Date(e.createdAt).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
              })}
              {e.note ? ` — ${e.note}` : ''}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="mt-2 text-xs" style={{ color: palette.status.critical }}>
          {error}
        </p>
      )}
    </Card>
  );
}
