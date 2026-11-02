'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { palette } from '@vela/shared/tokens';
import { saveCompanionRaceAction } from './actions';

/** The race name and date behind her countdown. Clearing both removes the countdown. */
export function CompanionRaceForm({
  clientId,
  raceName,
  raceDate,
}: {
  clientId: string;
  raceName: string;
  raceDate: string;
}) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(raceName);
  const [date, setDate] = useState(raceDate);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const field = 'w-full rounded-[10px] px-2.5 py-2 text-sm outline-none';
  const style = { background: 'var(--ghost)', color: 'var(--ink-primary)' };
  const changed = name.trim() !== raceName || date !== raceDate;

  return (
    <form
      className="mt-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setNotice(null);
          const res = await saveCompanionRaceAction(clientId, { name, date });
          if (!res.ok) setNotice({ ok: false, text: res.error ?? 'Could not save.' });
          else {
            setNotice({
              ok: true,
              text: date ? 'Saved. Her countdown uses this.' : 'Cleared. No countdown for now.',
            });
            router.refresh();
          }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div>
          <label htmlFor={`${id}-name`} className="text-xs ink-3">
            Race name
          </label>
          <input
            id={`${id}-name`}
            value={name}
            maxLength={80}
            placeholder="Angkor Wat Half"
            onChange={(e) => setName(e.target.value)}
            className={`${field} mt-1`}
            style={style}
          />
        </div>
        <div>
          <label htmlFor={`${id}-date`} className="text-xs ink-3">
            Race day
          </label>
          <input
            id={`${id}-date`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${field} mt-1 tnum`}
            style={style}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !changed}
          className="display-face min-h-[40px] rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: palette.brand[600] }}
        >
          {pending ? 'Saving…' : 'Save race'}
        </button>
        {(raceName || raceDate) && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setName('');
              setDate('');
              setNotice(null);
            }}
            className="text-xs underline ink-3"
          >
            Clear
          </button>
        )}
        <span
          className="text-xs"
          role="status"
          aria-live="polite"
          style={{ color: notice && !notice.ok ? palette.status.critical : undefined }}
        >
          {notice?.text}
        </span>
      </div>
    </form>
  );
}
