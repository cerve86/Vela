'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { palette } from '@vela/shared/tokens';
import { moveSessionAction } from './actions';
import { longDate } from './dates';

export interface PendingMove {
  sessionId: string;
  title: string;
  from: string;
  to: string;
  /** From a block, so the rest of it can follow. */
  inBlock: boolean;
  /** Planned sessions of the block after this one, among those loaded. */
  after: number;
}

/**
 * Asks which kind of move a drop meant: this session only, or this one and everything
 * after it in the block. A moved session stays where it is put when the programme
 * changes; a session already done never moves.
 */
export function MoveDialog({ move, onClose }: { move: PendingMove; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const days = Math.round(
    (Date.parse(`${move.to}T00:00:00Z`) - Date.parse(`${move.from}T00:00:00Z`)) / 86_400_000,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const go = (ripple: boolean) =>
    startTransition(async () => {
      setError(null);
      const res = await moveSessionAction(move.sessionId, move.to, ripple);
      if (!res.ok) setError(res.error ?? 'Could not move it.');
      else {
        onClose();
        router.refresh();
      }
    });

  const btn =
    'display-face rounded-full px-3.5 py-2 text-xs font-semibold transition-opacity disabled:opacity-40';

  return (
    <>
      <button
        type="button"
        aria-label="Cancel"
        onClick={onClose}
        className="fixed inset-0 z-[60]"
        style={{ background: 'rgba(18,23,43,0.28)' }}
      />
      <div
        role="dialog"
        aria-label="Move a session"
        className="fixed left-1/2 top-1/2 z-[70] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[20px] p-5"
        style={{ background: 'var(--surface)', boxShadow: '0 20px 60px rgba(18,23,43,0.25)' }}
      >
        <div className="display-face text-[17px] font-bold">Move {move.title}?</div>
        <p className="mt-1 text-sm ink-2">
          From {longDate(move.from)} to {longDate(move.to)} ({days > 0 ? '+' : ''}
          {days} {Math.abs(days) === 1 ? 'day' : 'days'}). It stays there if the programme changes;
          she sees the new day straight away.
        </p>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            disabled={pending}
            className={btn}
            style={{ background: palette.brand[600], color: '#fff' }}
            onClick={() => go(false)}
          >
            This session only
          </button>
          {move.inBlock && (
            <button
              type="button"
              disabled={pending}
              className={btn}
              style={{ background: 'var(--ghost)', color: 'var(--ink-primary)' }}
              onClick={() => go(true)}
            >
              This and the rest of the block
              {move.after > 0
                ? ` (${move.after} more ${move.after === 1 ? 'session' : 'sessions'})`
                : ''}
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            className={btn}
            style={{ background: 'transparent', color: 'var(--ink-secondary)' }}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs" style={{ color: palette.status.critical }}>
            {error}
          </p>
        )}
      </div>
    </>
  );
}
