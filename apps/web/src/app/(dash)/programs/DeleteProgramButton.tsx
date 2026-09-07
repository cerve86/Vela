'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { palette } from '@vela/shared/tokens';
import { deleteProgramAction } from './actions';

/**
 * Delete a programme, with one confirmation and a plain account of what will happen.
 *
 * The action decides between deleting and archiving — a programme a client was ever
 * assigned is archived so her week carries on — and this tells the coach which it was.
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

  function confirmAndDelete() {
    const sure = window.confirm(
      `Delete "${name}"?\n\nIf a client was ever assigned it, it is archived instead and her sessions stay on her calendar. Otherwise it is gone, days and exercises with it.`,
    );
    if (!sure) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteProgramAction(id);
      if (!res.ok) {
        setError(res.error ?? 'Could not delete the programme.');
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
        onClick={confirmAndDelete}
        disabled={pending}
        className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        style={{ background: 'var(--ghost)', color: palette.status.critical }}
        aria-label={`Delete ${name}`}
      >
        {pending ? 'Deleting…' : 'Delete'}
      </button>
    </span>
  );
}
