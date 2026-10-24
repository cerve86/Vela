'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createStarterTemplatesAction } from './actions';

/** Makes the spec's three starter templates, once. Nothing is assigned. */
export function StarterTemplatesButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await createStarterTemplatesAction();
            setNotice(
              !res.ok
                ? (res.error ?? 'Could not create them.')
                : res.created?.length
                  ? `Created ${res.created.join(', ')}.`
                  : 'The starter templates are already here.',
            );
            router.refresh();
          })
        }
        className="text-sm font-medium ink-2 hover:underline disabled:opacity-40"
      >
        Add the starter templates →
      </button>
      {notice && <span className="text-xs ink-3">{notice}</span>}
    </span>
  );
}
