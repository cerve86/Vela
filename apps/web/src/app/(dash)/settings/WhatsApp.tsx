'use client';

import { useState, useTransition } from 'react';
import { palette } from '@vela/shared/tokens';
import { saveWhatsAppAction } from './actions';

const field = 'rounded-[14px] px-3.5 py-2.5 text-sm outline-none';
const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

/** The coach's WhatsApp link: one field, Save, and empty clears it. */
export function WhatsApp({ url }: { url: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [value, setValue] = useState(url);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        setSaved(null);
        startTransition(async () => {
          const res = await saveWhatsAppAction(fd);
          if (!res.ok) setError(res.error ?? 'Something went wrong.');
          else {
            setValue(res.url ?? '');
            setSaved(
              res.url
                ? 'Saved. Your athletes’ WhatsApp buttons open this link.'
                : 'Cleared. The companion shows no WhatsApp button until you add one.',
            );
          }
        });
      }}
      className="space-y-3"
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <label htmlFor="whatsapp" className="mb-1.5 block text-xs font-medium ink-2">
            WhatsApp link or number
          </label>
          <input
            id="whatsapp"
            name="whatsapp"
            inputMode="url"
            autoComplete="off"
            maxLength={300}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://wa.me/6591234567"
            aria-describedby="whatsapp-help"
            aria-invalid={error ? true : undefined}
            className={`${field} w-full`}
            style={fieldStyle}
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="display-face rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: palette.brand[600] }}
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
      </div>
      <p id="whatsapp-help" className="text-xs ink-3">
        A wa.me link, a group invite link, or your number with its country code (+44 7700 900123).
        Leave it empty and save to remove it. With a group link, athletes’ messages go to the whole
        group, so the companion won’t offer to send their running clips or week summaries there.
      </p>
      {error && (
        <p className="text-sm" role="alert" style={{ color: palette.status.critical }}>
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm ink-2" role="status">
          {saved}
        </p>
      )}
    </form>
  );
}
