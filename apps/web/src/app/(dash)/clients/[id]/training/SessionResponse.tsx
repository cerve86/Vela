'use client';

import { useState, useTransition } from 'react';
import { Reply } from 'lucide-react';
import { palette } from '@vela/shared/tokens';
import { respondToSession } from './actions';

/**
 * The coach's reply to a logged session.
 *
 * The chips are openers, not canned messages — they fill the box and leave the cursor in
 * it. A one-tap send of somebody else's words is exactly the thing a client can feel, and
 * a physiotherapist's judgement is the product here.
 *
 * The draft survives a failed send. Losing a paragraph of clinical reasoning to a dropped
 * connection is the one failure this component must not have.
 */
export function SessionResponse({
  clientId,
  sessionId,
  sessionTitle,
  suggestions,
}: {
  clientId: string;
  sessionId: string | null;
  sessionTitle: string;
  /** Openers derived from what actually happened in the session. */
  suggestions: string[];
}) {
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setError(null);
    const form = new FormData();
    form.set('clientId', clientId);
    if (sessionId) form.set('sessionId', sessionId);
    form.set('body', body);

    startTransition(async () => {
      const result = await respondToSession(form);
      if (!result.ok) {
        setError(result.error ?? 'That did not send.');
        return;
      }
      setSent(true);
      setBody('');
    });
  }

  if (sent) {
    return (
      <div className="rounded-[16px] p-4" style={{ background: 'var(--tint-mint)' }}>
        <div className="text-sm font-semibold">Sent to her thread</div>
        <p className="mt-0.5 text-sm ink-2">
          It appears in her app attached to {sessionTitle}, so she does not have to work out
          which day you mean.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          className="mt-2 text-xs underline ink-2"
        >
          Write another
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]"
          style={{ background: 'var(--tint-cream)' }}
        >
          <Reply size={15} strokeWidth={2.1} style={{ color: palette.brand[600] }} aria-hidden />
        </span>
        <span className="text-sm font-medium">Your response</span>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setBody((b) => (b ? b : s))}
              className="rounded-full px-4 py-2.5 text-sm font-medium transition-transform hover:-translate-y-px"
              style={{
                background: 'var(--surface)',
                border: '1.5px solid var(--border)',
                color: 'var(--ink-primary)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="What she should take from this session, in your words."
        aria-label="Your response"
        className="mt-3.5 w-full rounded-[16px] px-4 py-3.5 text-sm leading-relaxed outline-none"
        style={{ background: 'var(--ghost)', color: 'var(--ink-primary)' }}
      />

      <div className="mt-3.5 flex items-center gap-2.5">
        <button
          type="button"
          onClick={send}
          disabled={!body.trim() || pending}
          className="display-face rounded-full px-5 py-2.5 text-sm font-medium text-white transition-transform enabled:hover:-translate-y-px disabled:opacity-50"
          style={{ background: palette.brand[600] }}
        >
          {pending ? 'Sending…' : 'Send to her'}
        </button>
        <span className="text-xs ink-2">
          {error ??
            (sessionId
              ? `Attached to ${sessionTitle}. She sees it in her app, not by email.`
              : 'She sees it in her app, not by email.')}
        </span>
      </div>
    </div>
  );
}
