'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { EXERCISE_CATEGORIES, type ExerciseCategory, type LibraryExercise } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Card, StatusPill } from '@/components/ui';
import {
  archiveExerciseAction,
  duplicateExerciseAction,
  saveExerciseAction,
} from './actions';
import { BundleDialog } from './BundleDialog';

const field = 'w-full rounded-[14px] px-3.5 py-2.5 text-sm outline-none';
const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

const CATEGORY_TONE: Record<ExerciseCategory, 'good' | 'warning' | 'serious' | 'neutral'> = {
  pelvic_floor: 'good',
  strength: 'neutral',
  plyometric: 'warning',
  running: 'serious',
  mobility: 'neutral',
};

function categoryLabel(c: ExerciseCategory) {
  return EXERCISE_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

export function LibraryClient({
  exercises,
  clients,
}: {
  exercises: LibraryExercise[];
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ExerciseCategory | 'all'>('all');
  const [mineOnly, setMineOnly] = useState(false);

  /** Editing state: null = closed, '' = creating, an id = editing that exercise. */
  const [editing, setEditing] = useState<LibraryExercise | 'new' | null>(null);

  /**
   * Movements picked for a block.
   *
   * Held here rather than in the dialog so a coach can filter, search and change category
   * while building a selection — the whole point is picking five movements that are not
   * next to each other in the list.
   */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bundling, setBundling] = useState(false);

  const pickedExercises = exercises.filter((e) => picked.has(e.id));

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Filtering client-side: the whole library is a few hundred rows at most, and a
  // round-trip per keystroke would feel worse than it looks in a network tab.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises.filter((e) => {
      if (category !== 'all' && e.category !== category) return false;
      if (mineOnly && !e.isMine) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.muscleGroups.some((m) => m.includes(q)) ||
        e.equipment.toLowerCase().includes(q)
      );
    });
  }, [exercises, search, category, mineOnly]);

  const grouped = useMemo(() => {
    const map = new Map<ExerciseCategory, LibraryExercise[]>();
    for (const e of filtered) {
      const arr = map.get(e.category);
      if (arr) arr.push(e);
      else map.set(e.category, [e]);
    }
    return [...map.entries()];
  }, [filtered]);

  const mineCount = exercises.filter((e) => e.isMine).length;

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Something went wrong.');
      else {
        setEditing(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4 pb-20">
      {bundling && (
        <BundleDialog
          selected={pickedExercises}
          clients={clients}
          onClose={() => setBundling(false)}
          onDone={() => {
            setBundling(false);
            setPicked(new Set());
          }}
        />
      )}

      {/*
        A docked bar rather than a button at the top of the page: the selection is built by
        scrolling, and a control that scrolls away is a control that gets forgotten.
      */}
      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center p-4">
          <div
            className="flex items-center gap-4 rounded-full px-5 py-3 shadow-lg"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
          >
            <span className="text-sm">
              <span className="font-semibold">{picked.size}</span> selected
            </span>
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="text-xs underline ink-2"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setBundling(true)}
              className="display-face rounded-full px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-px"
              style={{ background: palette.brand[600] }}
            >
              Bundle into a block
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, muscle group or equipment"
          className={`${field} max-w-xs`}
          style={fieldStyle}
          aria-label="Search exercises"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ExerciseCategory | 'all')}
          className="rounded-[14px] px-3 py-2.5 text-sm outline-none"
          style={fieldStyle}
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          {EXERCISE_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setMineOnly((v) => !v)}
          className="rounded-full px-3.5 py-2 text-sm font-medium"
          style={{
            background: mineOnly ? palette.brand[600] : 'var(--ghost)',
            color: mineOnly ? '#fff' : 'var(--ink-secondary)',
          }}
        >
          Mine only ({mineCount})
        </button>
        <span className="ml-auto text-sm ink-3">{filtered.length} shown</span>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="display-face rounded-full px-4 py-2.5 text-sm font-semibold text-white"
          style={{ background: palette.brand[600] }}
        >
          New exercise
        </button>
      </div>

      {error && (
        <p className="text-sm" style={{ color: palette.status.critical }}>
          {error}
        </p>
      )}

      {editing !== null && (
        <Card title={editing === 'new' ? 'New exercise' : `Edit ${editing.name}`}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              run(() => saveExerciseAction(fd));
            }}
            className="space-y-3"
          >
            {editing !== 'new' && <input type="hidden" name="id" value={editing.id} />}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="name" className="mb-1.5 block text-xs font-medium ink-2">
                  Name
                </label>
                <input
                  id="name"
                  name="name"
                  required
                  defaultValue={editing === 'new' ? '' : editing.name}
                  className={field}
                  style={fieldStyle}
                />
              </div>
              <div>
                <label htmlFor="category" className="mb-1.5 block text-xs font-medium ink-2">
                  Category
                </label>
                <select
                  id="category"
                  name="category"
                  defaultValue={editing === 'new' ? 'strength' : editing.category}
                  className={field}
                  style={fieldStyle}
                >
                  {EXERCISE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="cues" className="mb-1.5 block text-xs font-medium ink-2">
                Coaching cues — one per line
              </label>
              <textarea
                id="cues"
                name="cues"
                rows={3}
                defaultValue={editing === 'new' ? '' : editing.cues.join('\n')}
                placeholder={'Hips stay level\nDrive through the heel'}
                className={field}
                style={fieldStyle}
              />
              <p className="mt-1 text-xs ink-3">
                These appear on your client&apos;s phone while she trains, in this order.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="muscleGroups" className="mb-1.5 block text-xs font-medium ink-2">
                  Muscle groups <span className="ink-3">(comma separated)</span>
                </label>
                <input
                  id="muscleGroups"
                  name="muscleGroups"
                  defaultValue={editing === 'new' ? '' : editing.muscleGroups.join(', ')}
                  placeholder="glutes, hamstrings"
                  className={field}
                  style={fieldStyle}
                />
              </div>
              <div>
                <label htmlFor="equipment" className="mb-1.5 block text-xs font-medium ink-2">
                  Equipment
                </label>
                <input
                  id="equipment"
                  name="equipment"
                  defaultValue={editing === 'new' ? '' : editing.equipment}
                  placeholder="Bodyweight"
                  className={field}
                  style={fieldStyle}
                />
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="mb-1.5 block text-xs font-medium ink-2">
                Private notes <span className="ink-3">(only you see these)</span>
              </label>
              <input
                id="notes"
                name="notes"
                defaultValue={editing === 'new' ? '' : (editing.notes ?? '')}
                className={field}
                style={fieldStyle}
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={pending}
                className="display-face rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: palette.brand[600] }}
              >
                {pending ? 'Saving…' : 'Save exercise'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-full px-4 py-2.5 text-sm font-medium"
                style={{ background: 'var(--ghost)' }}
              >
                Cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      {grouped.length === 0 ? (
        <Card>
          <p className="text-sm ink-2">Nothing matches that filter.</p>
        </Card>
      ) : (
        grouped.map(([cat, items]) => (
          <Card key={cat} title={categoryLabel(cat)} action={<span className="text-xs ink-3">{items.length}</span>}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs ink-3">
                  <th className="pb-2 font-medium w-8" />
                  <th className="pb-2 font-medium">Exercise</th>
                  <th className="pb-2 font-medium">Muscle groups</th>
                  <th className="pb-2 font-medium">Equipment</th>
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} className="border-b last:border-0 align-top">
                    <td className="py-2.5">
                      <input
                        type="checkbox"
                        checked={picked.has(e.id)}
                        onChange={() => togglePick(e.id)}
                        aria-label={`Add ${e.name} to a block`}
                        className="h-4 w-4 cursor-pointer"
                        style={{ accentColor: palette.brand[600] }}
                      />
                    </td>
                    <td className="py-2.5">
                      <div className="font-medium">{e.name}</div>
                      {e.cues[0] && <div className="text-xs ink-3">{e.cues[0]}</div>}
                    </td>
                    <td className="py-2.5 ink-2">
                      {e.muscleGroups.join(', ').replace(/_/g, ' ') || '—'}
                    </td>
                    <td className="py-2.5 ink-2">{e.equipment}</td>
                    <td className="py-2.5">
                      {e.isMine ? (
                        <StatusPill tone={CATEGORY_TONE[e.category]}>Mine</StatusPill>
                      ) : (
                        <StatusPill tone="neutral">Vela library</StatusPill>
                      )}
                    </td>
                    <td className="py-2.5 text-right whitespace-nowrap">
                      {e.isMine ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditing(e)}
                            className="text-xs underline ink-2"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => run(() => archiveExerciseAction(e.id))}
                            className="ml-3 text-xs underline ink-2 disabled:opacity-40"
                          >
                            Archive
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => duplicateExerciseAction(e))}
                          className="text-xs underline ink-2 disabled:opacity-40"
                        >
                          Duplicate to edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))
      )}
    </div>
  );
}
