'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { palette } from '@vela/shared/tokens';
import { deleteProgramAction } from './actions';

/**
 * Archive a programme. No confirmation: nothing is lost — it leaves the list, keeps its
 * days and items, and comes back with one click from the archived list at the bottom of
 * the programmes page. A client on it stays on it.
 */
export function DeleteProgramButton({
  id,
  name,
  afterDelete,
}: {
  id: string;
  name: string;
  /** Go back to the list (from the programme page) or stay and refresh (from the list). */
  afterDelete: 'list' | 'refresh';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function archive() {
    setError(null);
    startTransition(async () => {
      const res = await deleteProgramAction(id);
      if (!res.ok) {
        setError(res.error ?? 'Could not archive the programme.');
        return;
      }
      if (afterDelete === 'list') router.push('/programs');
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      {error && (
        <span className="text-xs" style={{ color: palette.status.critical }}>
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={archive}
        disabled={pending}
        className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        style={{ background: 'var(--ghost)', color: 'var(--ink-secondary)' }}
        aria-label={`Archive ${name}`}
      >
        {pending ? 'Archiving…' : 'Archive'}
      </button>
    </span>
  );
}
