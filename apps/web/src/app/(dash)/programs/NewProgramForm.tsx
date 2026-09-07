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
  const [kind, setKind] = useState<'structured' | 'descriptive'>('structured');

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

        {/* Two shapes of programme. Days of prescriptions go on the calendar as sessions;
            a piece of text goes on her phone to read through. */}
        <fieldset className="flex gap-4 text-sm ink-2">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="kind"
              value="structured"
              checked={kind === 'structured'}
              onChange={() => setKind('structured')}
            />
            Days of exercises
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="kind"
              value="descriptive"
              checked={kind === 'descriptive'}
              onChange={() => setKind('descriptive')}
            />
            A written programme
          </label>
        </fieldset>

        {kind === 'descriptive' ? (
          <div>
            <label htmlFor="body" className="mb-1.5 block text-xs font-medium ink-2">
              What to do
            </label>
            <textarea
              id="body"
              name="body"
              required
              rows={10}
              placeholder={
                'Three times this week:\n\n1. Walk 10 min, run 2 min, walk 2 min — repeat four times.\n2. Pelvic floor set: 10 long holds, 10 quick flicks, twice a day.\n3. Glute bridges 3 × 12, slow on the way down.\n\nStop if anything feels heavy or dragging, and tell me.'
              }
              className={`${field} w-full font-[inherit]`}
              style={fieldStyle}
            />
            <p className="mt-1.5 text-xs ink-3">
              She reads this as it is written, on her phone. Blank lines make paragraphs; lines
              starting with a number or a dash become a list.
            </p>
          </div>
        ) : (
          <label className="flex items-center gap-2 text-sm ink-2">
            <input type="checkbox" name="isTemplate" />
            Save as a reusable template
          </label>
        )}

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
            {pending ? 'Creating…' : kind === 'descriptive' ? 'Create' : 'Create and build'}
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
