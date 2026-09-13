'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { palette } from '@vela/shared/tokens';
import { deleteInvitedClientAction, remindClientAction } from './invite/actions';

/**
 * The two things a coach does about an invitation nobody has answered: send it again, or
 * give up on it. Deleting asks once, inline, because it takes the client row with it; a
 * reminder needs no second thought, it is the same email again.
 */
export function InviteActions({ clientId, name }: { clientId: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const link = 'text-xs underline ink-2 disabled:opacity-40';

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-3">
        {confirming ? (
          <>
            <span className="text-xs ink-2">Delete {name}?</span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await deleteInvitedClientAction(clientId);
                  if (!res.ok) {
                    setNote({ tone: 'error', text: res.error ?? 'Could not delete.' });
                    setConfirming(false);
                  } else {
                    router.refresh();
                  }
                })
              }
              className="text-xs font-medium underline disabled:opacity-40"
              style={{ color: palette.status.critical }}
            >
              {pending ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={link}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await remindClientAction(clientId);
                  setNote(
                    res.ok
                      ? { tone: 'ok', text: res.note ?? `Reminder sent to ${res.email}.` }
                      : { tone: 'error', text: res.error ?? 'Could not send the reminder.' },
                  );
                  if (res.ok) router.refresh();
                })
              }
              className={link}
            >
              {pending ? 'Sending…' : 'Send a reminder'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setNote(null);
                setConfirming(true);
              }}
              className={link}
            >
              Delete
            </button>
          </>
        )}
      </div>
      {note && (
        <span
          className="max-w-[28rem] text-right text-xs"
          style={{
            color: note.tone === 'error' ? palette.status.critical : 'var(--ink-secondary)',
          }}
        >
          {note.text}
        </span>
      )}
    </div>
  );
}
