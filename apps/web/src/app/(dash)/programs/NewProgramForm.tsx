'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { palette } from '@vela/shared/tokens';
import { Card } from '@/components/ui';
import { createProgramAction } from './actions';

const field = 'rounded-[14px] px-3.5 py-2.5 text-sm outline-none';
const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

export function NewProgramForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="display-face rounded-full px-4 py-2.5 text-sm font-semibold text-white"
        style={{ background: palette.brand[600] }}
      >
        New programme
      </button>
    );
  }

  return (
    <Card title="New programme">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          startTransition(async () => {
            const res = await createProgramAction(fd);
            if (!res.ok) setError(res.error ?? 'Something went wrong.');
            else router.push(`/programs/${res.id}`);
          });
        }}
        className="space-y-3"
      >
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label htmlFor="name" className="mb-1.5 block text-xs font-medium ink-2">
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              placeholder="Return to running — weeks 12-18"
              className={`${field} w-full`}
              style={fieldStyle}
            />
          </div>
          <div>
            <label htmlFor="durationWeeks" className="mb-1.5 block text-xs font-medium ink-2">
              Weeks
            </label>
            <input
              id="durationWeeks"
              name="durationWeeks"
              type="number"
              min={1}
              max={52}
              defaultValue={6}
              className={`${field} w-full`}
              style={fieldStyle}
            />
          </div>
        </div>

        <div>
          <label htmlFor="description" className="mb-1.5 block text-xs font-medium ink-2">
            Description <span className="ink-3">(optional)</span>
          </label>
          <input
            id="description"
            name="description"
            placeholder="Graded walk-run with posterior chain strength"
            className={`${field} w-full`}
            style={fieldStyle}
          />
        </div>

        <label className="flex items-center gap-2 text-sm ink-2">
          <input type="checkbox" name="isTemplate" />
          Save as a reusable template
        </label>

        {error && (
          <p className="text-sm" style={{ color: palette.status.critical }}>
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="display-face rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: palette.brand[600] }}
          >
            {pending ? 'Creating…' : 'Create and build'}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-full px-4 py-2.5 text-sm font-medium"
            style={{ background: 'var(--ghost)' }}
          >
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
