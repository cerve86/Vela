'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserMinus, UserPlus } from 'lucide-react';
import type { ChallengeBoardRow } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Avatar } from '@/components/ui';
import { addParticipantsAction, removeParticipantAction } from '../actions';

/**
 * Participation, and the two edits a coach needs after a challenge has started.
 *
 * The list was server-rendered and read-only, which made a challenge immutable the moment
 * it was created — somebody who joined the practice in week two could never be added, and
 * somebody who stopped training could not be taken out of a group total she was dragging
 * down. The server actions existed and nothing called them.
 *
 * Both edits move the group target, because the target is head count × weekly × weeks. That
 * is stated rather than left to be discovered: a coach adding a fourth person is raising the
 * bar for everyone, and she should see by how much before she does it.
 */
export function Participants({
  challengeId,
  board,
  eligible,
  weeks,
  weeklyTarget,
  noun,
}: {
  challengeId: string;
  board: ChallengeBoardRow[];
  /** The coach's active clients who are not already in it. */
  eligible: { id: string; name: string }[];
  weeks: number;
  weeklyTarget: number;
  noun: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  /** Two-step removal: the first click asks, the second does it. */
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const perPerson = weeks * weeklyTarget;

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await addParticipantsAction(challengeId, picked);
      if (!result.ok) {
        setError(result.error ?? 'Could not add them.');
        return;
      }
      setPicked([]);
      setAdding(false);
      router.refresh();
    });
  }

  function remove(clientId: string) {
    setError(null);
    startTransition(async () => {
      const result = await removeParticipantAction(challengeId, clientId);
      if (!result.ok) {
        setError(result.error ?? 'Could not remove them.');
        return;
      }
      setConfirming(null);
      router.refresh();
    });
  }

  return (
    <div className="surface rounded-[20px] p-6" style={{ background: 'var(--surface)' }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="display-face text-base font-semibold">Participation</h2>
        {eligible.length > 0 && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-transform hover:-translate-y-px"
            style={{ background: 'var(--ghost)', color: 'var(--ink-primary)' }}
          >
            <UserPlus size={13} strokeWidth={2.2} aria-hidden />
            Add participants
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-4 rounded-[16px] p-4" style={{ background: 'var(--ghost)' }}>
          <div className="flex flex-wrap gap-2">
            {eligible.map((c) => {
              const on = picked.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    setPicked((prev) =>
                      prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id],
                    )
                  }
                  aria-pressed={on}
                  className="rounded-full px-3 py-1.5 text-xs font-medium"
                  style={{
                    background: on ? palette.brand[600] : 'var(--surface)',
                    color: on ? '#fff' : 'var(--ink-primary)',
                  }}
                >
                  {c.name}
                </button>
              );
            })}
          </div>

          {/* What it costs the group, before it is done. */}
          <p className="mt-3 text-[11px] ink-3">
            {picked.length === 0
              ? 'Adding somebody raises the group target — everyone is aiming at a bigger number, not an easier one.'
              : `Group target rises by ${picked.length * perPerson} ${noun}, to ${(board.length + picked.length) * perPerson}.`}
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={add}
              disabled={pending || picked.length === 0}
              className="display-face rounded-full px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
              style={{ background: palette.brand[600] }}
            >
              {pending ? 'Adding…' : `Add ${picked.length || ''}`.trim()}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setPicked([]);
                setError(null);
              }}
              className="text-xs underline ink-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {board.map((p) => {
          const pct = p.target > 0 ? Math.min(100, Math.round((p.done / p.target) * 100)) : 0;
          const asking = confirming === p.clientId;

          return (
            <div key={p.clientId} className="flex items-center gap-3">
              <Avatar name={p.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.name}</div>
                <div
                  className="mt-1 h-1.5 overflow-hidden rounded-full"
                  style={{ background: 'var(--ghost)' }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: palette.brand[600] }}
                  />
                </div>
              </div>
              <span className="tnum text-xs ink-2">
                {p.done}/{p.target}
              </span>

              {asking ? (
                <span className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => remove(p.clientId)}
                    disabled={pending}
                    className="rounded-full px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                    style={{ background: palette.status.critical }}
                  >
                    {pending ? '…' : 'Remove'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="text-[11px] underline ink-2"
                  >
                    Keep
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(p.clientId)}
                  aria-label={`Remove ${p.name} from this challenge`}
                  title={`Remove ${p.name}`}
                  className="rounded-full p-1.5 transition-colors hover:bg-[var(--ghost)]"
                >
                  <UserMinus size={14} strokeWidth={2.2} style={{ color: 'var(--ink-secondary)' }} aria-hidden />
                </button>
              )}
            </div>
          );
        })}

        {board.length === 0 && (
          <p className="text-sm ink-2">
            Nobody is enrolled. The challenge exists but has no participants — add some above.
          </p>
        )}
      </div>

      {error && (
        <p className="mt-3 text-xs" style={{ color: palette.status.critical }}>
          {error}
        </p>
      )}

      <p className="mt-4 text-[11px] ink-3">
        Ordered by participation, not performance. Nobody is ranked on pain, weight or load —
        and none of these names is visible to the other participants, who see the group total
        and their own share only. Removing somebody takes her out of the group total; it does
        not touch anything she logged.
      </p>
    </div>
  );
}
