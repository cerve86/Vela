'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { palette } from '@vela/shared/tokens';
import { restoreProgramAction } from './actions';

/** Bring an archived programme back into the list. */
export function RestoreProgramButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      {error && (
        <span className="text-xs" style={{ color: palette.status.critical }}>
          {error}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await restoreProgramAction(id);
            if (!res.ok) setError(res.error ?? 'Could not restore.');
            else router.refresh();
          });
        }}
        className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
        style={{ background: 'var(--ghost)', color: palette.brand[600] }}
        aria-label={`Restore ${name}`}
      >
        {pending ? 'Restoring…' : 'Restore'}
      </button>
    </span>
  );
}
