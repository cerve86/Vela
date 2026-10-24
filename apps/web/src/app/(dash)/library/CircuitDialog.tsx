'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LibraryExercise } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Card } from '@/components/ui';
import { saveCircuitAction } from './actions';

const field = 'w-full rounded-[12px] px-3 py-2 text-sm outline-none';
const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

/**
 * A session block: a named circuit ("Bun Burner 20") of movements from her library, each
 * with its dose. It is prescribed as one item and filmed once.
 */
export function CircuitDialog({
  movements,
  initial,
  onClose,
}: {
  movements: LibraryExercise[];
  /** Movements already ticked in the library, to start from. */
  initial: LibraryExercise[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [why, setWhy] = useState('');
  const [rows, setRows] = useState(initial.map((e) => ({ exerciseId: e.id, dose: e.dose ?? '' })));
  const [adding, setAdding] = useState('');
  const [error, setError] = useState<string | null>(null);
  const byId = new Map(movements.map((m) => [m.id, m]));

  const save = () =>
    startTransition(async () => {
      setError(null);
      const res = await saveCircuitAction({
        name,
        why,
        items: rows.map((r) => ({ exerciseId: r.exerciseId, dose: r.dose.trim() || null })),
      });
      if (!res.ok) setError(res.error ?? 'Could not save.');
      else {
        onClose();
        router.refresh();
      }
    });

  return (
    <Card title="New circuit">
      <div className="grid gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='Name, e.g. "Bun Burner 20"'
          className={field}
          style={fieldStyle}
          aria-label="Circuit name"
        />
        <ol className="grid gap-1.5">
          {rows.map((r, i) => (
            <li key={`${r.exerciseId}-${i}`} className="flex items-center gap-2">
              <span className="w-5 text-xs ink-3 tnum">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {byId.get(r.exerciseId)?.name ?? 'A movement'}
              </span>
              <input
                value={r.dose}
                onChange={(e) =>
                  setRows((rs) => rs.map((x, j) => (j === i ? { ...x, dose: e.target.value } : x)))
                }
                placeholder="Dose, e.g. 40 s on / 20 off"
                className="w-48 rounded-[10px] px-2 py-1 text-sm outline-none"
                style={fieldStyle}
                aria-label={`Dose for ${byId.get(r.exerciseId)?.name ?? 'movement'}`}
              />
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                className="text-xs underline ink-2"
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
        <div className="flex gap-2">
          <select
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className={field}
            style={fieldStyle}
            aria-label="Add a movement"
          >
            <option value="">Add a movement…</option>
            {movements
              .filter((m) => m.kind === 'movement')
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code ? `${m.code} · ` : ''}
                  {m.name}
                </option>
              ))}
          </select>
          <button
            type="button"
            disabled={!adding}
            onClick={() => {
              const m = byId.get(adding);
              setRows((rs) => [...rs, { exerciseId: adding, dose: m?.dose ?? '' }]);
              setAdding('');
            }}
            className="rounded-full px-3 text-sm font-semibold disabled:opacity-40"
            style={{ background: 'var(--ghost)' }}
          >
            Add
          </button>
        </div>
        <input
          value={why}
          onChange={(e) => setWhy(e.target.value)}
          placeholder="Why this circuit (optional, shown behind a tap)"
          className={field}
          style={fieldStyle}
          aria-label="Why this circuit"
        />
        {error && (
          <p className="text-sm" style={{ color: palette.status.critical }}>
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="display-face rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: palette.brand[600] }}
          >
            {pending ? 'Saving…' : 'Save circuit'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm"
            style={{ background: 'var(--ghost)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </Card>
  );
}
