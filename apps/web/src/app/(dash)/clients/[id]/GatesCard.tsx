'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ClientGates, PainThreshold } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Card } from '@/components/ui';
import { saveGatesAction } from './actions';

const LOCATIONS = ['knee', 'shin', 'hip', 'back', 'foot', 'pelvic floor', 'other'];

/**
 * Her gates: the pain ceilings that flag a session, and whether the pelvic-floor
 * question is asked before each one. Off by default — the gate is per client, not a rule.
 */
export function GatesCard({ clientId, gates }: { clientId: string; gates: ClientGates }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pfGate, setPfGate] = useState(gates.pfGate);
  const [rows, setRows] = useState<PainThreshold[]>(gates.painThresholds);
  const [notice, setNotice] = useState<string | null>(null);

  const field = 'rounded-[10px] px-2.5 py-1.5 text-sm outline-none';
  const style = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

  return (
    <Card title="Gates and thresholds">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={pfGate}
          onChange={(e) => setPfGate(e.target.checked)}
          className="mt-1"
        />
        <span>
          Ask the pelvic-floor question before each session.
          <span className="ink-3"> A yes takes impact work out of that session and flags you.</span>
        </span>
      </label>

      <div className="mt-4">
        <div className="text-xs font-medium ink-2">
          Pain thresholds — a score above one flags you
        </div>
        <div className="mt-2 grid gap-2">
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={r.location}
                onChange={(e) =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, location: e.target.value } : x)))
                }
                className={field}
                style={style}
                aria-label="Location"
              >
                {LOCATIONS.map((l) => (
                  <option key={l} value={l}>
                    {l.charAt(0).toUpperCase() + l.slice(1)}
                  </option>
                ))}
              </select>
              <span className="text-sm ink-2">above</span>
              <input
                type="number"
                min={0}
                max={10}
                value={r.max}
                onChange={(e) =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, max: Number(e.target.value) } : x)))
                }
                className={`${field} w-16 tnum`}
                style={style}
                aria-label="Threshold"
              />
              <span className="text-sm ink-2">/ 10</span>
              <button
                type="button"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                className="text-xs underline ink-3"
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows([...rows, { location: 'shin', max: 3 }])}
            className="w-fit text-xs underline ink-2"
          >
            Add a threshold
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setNotice(null);
              const res = await saveGatesAction(clientId, { pfGate, painThresholds: rows });
              setNotice(
                res.ok ? 'Saved. Her next session uses these.' : (res.error ?? 'Could not save.'),
              );
              if (res.ok) router.refresh();
            })
          }
          className="display-face rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: palette.brand[600] }}
        >
          Save
        </button>
        {notice && <span className="text-xs ink-2">{notice}</span>}
      </div>
    </Card>
  );
}
