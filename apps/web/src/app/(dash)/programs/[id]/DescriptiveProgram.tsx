'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Program } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Card } from '@/components/ui';
import { assignProgramAction, saveProgramBodyAction } from '../actions';
import { AssignCard } from './Builder';

const field = 'rounded-[14px] px-3.5 py-2.5 text-sm outline-none';
const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

/**
 * A written programme: the text, and who to send it to.
 *
 * There is nothing to build. She writes what to do, saves it, and assigns it with a start
 * date; the client reads it on her phone exactly as written. Editing after assigning
 * changes what the client sees — the text is read live, not copied.
 */
export function DescriptiveProgram({
  program,
  clients,
}: {
  program: Program;
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState(program.body ?? '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dirty = body.trim() !== (program.body ?? '').trim();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Something went wrong.');
      else {
        if (success) setNotice(success);
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card title="What to do">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={18}
          className={`${field} w-full font-[inherit] leading-relaxed`}
          style={fieldStyle}
          aria-label="The programme, as she will read it"
        />
        <p className="mt-2 text-xs ink-3">
          She reads this as it is written. Blank lines make paragraphs; lines starting with a number
          or a dash become a list. If she is already assigned it, saving changes what she sees.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            disabled={pending || !dirty}
            onClick={() => run(() => saveProgramBodyAction(program.id, body), 'Saved.')}
            className="display-face rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: palette.brand[600] }}
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
          {notice && <span className="text-sm ink-2">{notice}</span>}
          {error && (
            <span className="text-sm" style={{ color: palette.status.critical }}>
              {error}
            </span>
          )}
        </div>
      </Card>

      <AssignCard
        clients={clients}
        pending={pending}
        onAssign={(clientId, startDate) =>
          run(
            () => assignProgramAction(program.id, clientId, startDate),
            'Assigned. She can read it on her phone now.',
          )
        }
      />
    </div>
  );
}
