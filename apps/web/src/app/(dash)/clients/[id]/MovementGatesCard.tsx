'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GATE_LABEL, type ExerciseGate } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Card } from '@/components/ui';
import { saveClearedGatesAction, setGateOverrideAction } from './actions';

const GATES: ExerciseGate[] = ['pelvic_floor', 'shin'];

/**
 * The movement gates: which she has been cleared through, and what in her current block
 * waits behind one. A gated movement is served past a cleared gate, or when the coach
 * overrides it for this block; otherwise the app leaves it out and tells her it waits.
 */
export function MovementGatesCard({
  clientId,
  assignmentId,
  cleared,
  overrides,
  waiting,
}: {
  clientId: string;
  assignmentId: string | null;
  cleared: ExerciseGate[];
  overrides: ExerciseGate[];
  waiting: { name: string; gates: ExerciseGate[] }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Could not save.');
      else router.refresh();
    });

  const blocked = GATES.filter((g) => waiting.some((w) => w.gates.includes(g)));

  return (
    <Card title="Movement gates">
      <div className="text-xs font-medium ink-2">She has been cleared through</div>
      <div className="mt-2 flex flex-wrap gap-4 text-sm">
        {GATES.map((g) => (
          <label key={g} className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              disabled={pending}
              checked={cleared.includes(g)}
              onChange={(e) =>
                run(() =>
                  saveClearedGatesAction(
                    clientId,
                    e.target.checked ? [...cleared, g] : cleared.filter((x) => x !== g),
                  ),
                )
              }
              style={{ accentColor: palette.brand[600] }}
            />
            {GATE_LABEL[g]}
          </label>
        ))}
      </div>

      {assignmentId && (
        <div className="mt-4">
          {waiting.length === 0 ? (
            <p className="text-sm ink-2">Nothing in her current block waits behind a gate.</p>
          ) : (
            <>
              <div className="text-xs font-medium ink-2">Waiting in her current block</div>
              <ul className="mt-1.5 space-y-1 text-sm">
                {waiting.map((w) => (
                  <li key={w.name}>
                    {w.name}{' '}
                    <span className="text-xs" style={{ color: palette.status.critical }}>
                      · {w.gates.map((g) => GATE_LABEL[g]).join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs ink-3">
                The app leaves these out and tells her they wait for you.
              </p>
            </>
          )}
          {(blocked.length > 0 || overrides.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {GATES.filter((g) => blocked.includes(g) || overrides.includes(g)).map((g) => {
                const on = overrides.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setGateOverrideAction(clientId, assignmentId, g, !on))}
                    className="rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                    style={{
                      background: on ? 'var(--ghost)' : palette.brand[600],
                      color: on ? 'var(--ink-primary)' : '#fff',
                    }}
                  >
                    {on
                      ? `Remove the ${GATE_LABEL[g].toLowerCase()} override`
                      : `Override the ${GATE_LABEL[g].toLowerCase()} for this block`}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs" style={{ color: palette.status.critical }}>
          {error}
        </p>
      )}
    </Card>
  );
}
