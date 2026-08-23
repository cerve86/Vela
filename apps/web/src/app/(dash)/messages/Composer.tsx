'use client';

import { useEffect, useState, useTransition } from 'react';
import { Send } from 'lucide-react';
import { palette } from '@vela/shared/tokens';
import { markThreadRead, replyToClient } from './actions';

const QUICK_REPLIES = [
  'How did that feel the next morning?',
  'Hold the load where it is for now.',
  "Let's talk about this at your next appointment.",
];

/**
 * The coach's composer.
 *
 * Quick replies fill the box rather than sending — the same choice as the session response.
 * These are the three things a physiotherapist types most often, offered as a saved
 * keystroke, not as a substitute for her saying it herself.
 *
 * The caller keys this on the client id, which is what clears the draft when the coach
 * switches thread. Resetting state in an effect would do it a beat late and cause a
 * cascading render; remounting is both correct and simpler. It also matters more here than
 * most places — a draft carried to the wrong thread is a message sent to the wrong person.
 */
export function Composer({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Opening the thread is what marks it read. Doing it here rather than while the page
  // renders keeps the server component free of side effects.
  useEffect(() => {
    void markThreadRead(clientId);
  }, [clientId]);

  function send() {
    setError(null);
    const form = new FormData();
    form.set('clientId', clientId);
    form.set('body', body);

    startTransition(async () => {
      const result = await replyToClient(form);
      if (!result.ok) {
        setError(result.error ?? 'That did not send.');
        return;
      }
      setBody('');
    });
  }

  return (
    <div
      className="border-t px-6 pt-3.5 pb-4"
      style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
    >
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {QUICK_REPLIES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => setBody((b) => (b ? b : q))}
            className="rounded-full px-3.5 py-2 text-xs font-medium transition-transform hover:-translate-y-px"
            style={{ background: 'var(--ghost)', color: 'var(--ink-primary)' }}
          >
            {q}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2.5">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder={`Write to ${clientName}`}
          aria-label={`Message ${clientName}`}
          className="min-h-12 flex-1 rounded-[22px] px-4 py-3.5 text-sm leading-relaxed outline-none"
          style={{ background: 'var(--ghost)', color: 'var(--ink-primary)' }}
        />
        <button
          type="button"
          onClick={send}
          disabled={!body.trim() || pending}
          aria-label="Send"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full transition-transform enabled:hover:-translate-y-px disabled:opacity-40"
          style={{ background: body.trim() && !pending ? palette.brand[600] : 'var(--ghost)' }}
        >
          <Send
            size={19}
            strokeWidth={2.4}
            style={{ color: body.trim() && !pending ? '#fff' : 'var(--ink-muted)' }}
            aria-hidden
          />
        </button>
      </div>

      {error && <p className="mt-2 text-xs" style={{ color: palette.status.critical }}>{error}</p>}
    </div>
  );
}
