'use client';

import { useState, useTransition } from 'react';
import { palette } from '@vela/shared/tokens';
import { markDoneAction } from './actions';

export function DoneForm({
  sessionId,
  token,
  title,
  date,
  completed,
  items,
}: {
  sessionId: string;
  token: string;
  title: string;
  date: string;
  completed: boolean;
  items: { name: string; dose: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(completed);
  const [error, setError] = useState<string | null>(null);

  const when = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });

  return (
    <div className="surface rounded-[20px] p-6" style={{ background: 'var(--surface)' }}>
      <div className="text-xs ink-3">{when}</div>
      <h1 className="display-face mt-0.5 text-xl font-semibold">{title}</h1>

      {items.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {items.map((i, n) => (
            <li key={n} className="flex items-baseline justify-between gap-3 text-sm">
              <span>{i.name}</span>
              <span className="tnum shrink-0 text-xs ink-3">{i.dose}</span>
            </li>
          ))}
        </ul>
      )}

      {done ? (
        <div className="mt-5 rounded-[14px] p-4 text-sm" style={{ background: 'var(--ghost)' }}>
          <span className="font-semibold" style={{ color: palette.status.good }}>
            Marked as done.
          </span>{' '}
          <span className="ink-2">
            Every set counts as completed. Your physiotherapist can see it.
          </span>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setError(null);
            startTransition(async () => {
              const res = await markDoneAction(fd);
              if (res.ok) setDone(true);
              else setError(res.error ?? 'Something went wrong.');
            });
          }}
          className="mt-5"
        >
          <input type="hidden" name="sessionId" value={sessionId} />
          <input type="hidden" name="token" value={token} />
          <button
            type="submit"
            disabled={pending}
            className="display-face w-full rounded-full px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: palette.brand[600] }}
          >
            {pending ? 'Saving…' : 'I did the whole session'}
          </button>
          <p className="mt-2 text-center text-xs ink-3">
            Marks every set as done. To log sets one by one, or pain before and after, use the app.
          </p>
          {error && (
            <p className="mt-2 text-sm" style={{ color: palette.status.critical }}>
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
