'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  EXERCISE_CATEGORIES,
  GATE_LABEL,
  type ClientPriority,
  type Domain,
  type ExerciseCategory,
  type ExerciseGate,
  type LibraryExercise,
} from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Card, StatusPill } from '@/components/ui';
import {
  archiveExerciseAction,
  duplicateExerciseAction,
  saveExerciseAction,
  setSelectedAction,
} from './actions';
import { BundleDialog } from './BundleDialog';
import { CircuitDialog } from './CircuitDialog';
import { LeanCard } from './LeanCard';
import { LibraryImport } from './LibraryImport';

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
  domains,
  priorities,
}: {
  exercises: LibraryExercise[];
  clients: { id: string; name: string }[];
  domains: Domain[];
  priorities: ClientPriority[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ExerciseCategory | 'all'>('all');
  const [mineOnly, setMineOnly] = useState(false);

  /**
   * Her library first: the movements she selected, by domain, as lean cards. The rest of
   * the catalogue stays one tap away under "Everything".
   */
  const hasCurated = exercises.some((e) => e.selected);
  const [mode, setMode] = useState<'curated' | 'all'>(hasCurated ? 'curated' : 'all');
  const [domainF, setDomainF] = useState('all');
  const [typeF, setTypeF] = useState('all');
  const [phaseF, setPhaseF] = useState('all');
  const [clientF, setClientF] = useState('');
  const [importing, setImporting] = useState(false);
  const [makingCircuit, setMakingCircuit] = useState(false);

  const names = useMemo(() => new Map(exercises.map((e) => [e.id, e.name])), [exercises]);
  const types = [...new Set(exercises.map((e) => e.movementType).filter(Boolean))] as string[];
  const phases = [...new Set(exercises.flatMap((e) => e.phases))];
  const domainNames = [
    ...domains.map((d) => d.name),
    ...[...new Set(exercises.map((e) => e.domain).filter(Boolean))].filter(
      (n) => !domains.some((d) => d.name === n),
    ),
  ] as string[];
  const clientPriority = useMemo(
    () =>
      new Map(priorities.filter((p) => p.clientId === clientF).map((p) => [p.exerciseId, p.level])),
    [priorities, clientF],
  );

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
      if (mode === 'curated' && !e.selected) return false;
      if (category !== 'all' && e.category !== category) return false;
      if (mineOnly && !e.isMine) return false;
      if (domainF !== 'all' && e.domain !== domainF) return false;
      if (typeF !== 'all' && e.movementType !== typeF) return false;
      if (phaseF !== 'all' && !e.phases.includes(phaseF)) return false;
      if (clientF && !clientPriority.has(e.id)) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.muscleGroups.some((m) => m.includes(q)) ||
        e.equipment.toLowerCase().includes(q)
      );
    });
  }, [
    exercises,
    search,
    category,
    mineOnly,
    mode,
    domainF,
    typeF,
    phaseF,
    clientF,
    clientPriority,
  ]);

  const curatedGroups = useMemo(() => {
    const order = [...domainNames, 'Circuits', 'Other'];
    const map = new Map<string, LibraryExercise[]>();
    for (const e of filtered) {
      const key = e.kind === 'block' ? 'Circuits' : (e.domain ?? 'Other');
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    for (const list of map.values())
      list.sort(
        (a, b) =>
          (clientPriority.get(a.id) === 'priority' ? 0 : 1) -
            (clientPriority.get(b.id) === 'priority' ? 0 : 1) ||
          (a.code ?? a.name).localeCompare(b.code ?? b.name, undefined, { numeric: true }),
      );
    return [...map.entries()]
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([name, items]) => ({
        name,
        purpose: domains.find((d) => d.name === name)?.purpose ?? null,
        items,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, domains, clientPriority]);

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

      {importing && <LibraryImport onClose={() => setImporting(false)} />}
      {makingCircuit && (
        <CircuitDialog
          movements={exercises.filter((e) => e.selected || e.isMine)}
          initial={pickedExercises.filter((e) => e.kind === 'movement')}
          onClose={() => setMakingCircuit(false)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Library view"
          className="grid grid-cols-2 rounded-full p-[3px]"
          style={{ background: 'var(--ghost)' }}
        >
          {(['curated', 'all'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold"
              style={{
                background: mode === m ? 'var(--surface)' : 'transparent',
                color: mode === m ? 'var(--ink-primary)' : 'var(--ink-secondary)',
              }}
            >
              {m === 'curated' ? 'Her library' : 'Everything'}
            </button>
          ))}
        </div>
        {domainNames.length > 0 && (
          <select
            value={domainF}
            onChange={(e) => setDomainF(e.target.value)}
            className="rounded-[14px] px-3 py-2.5 text-sm outline-none"
            style={fieldStyle}
            aria-label="Filter by domain"
          >
            <option value="all">All domains</option>
            {domainNames.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
        {types.length > 0 && (
          <select
            value={typeF}
            onChange={(e) => setTypeF(e.target.value)}
            className="rounded-[14px] px-3 py-2.5 text-sm outline-none"
            style={fieldStyle}
            aria-label="Filter by type"
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {phases.length > 0 && (
          <select
            value={phaseF}
            onChange={(e) => setPhaseF(e.target.value)}
            className="rounded-[14px] px-3 py-2.5 text-sm outline-none"
            style={fieldStyle}
            aria-label="Filter by phase"
          >
            <option value="all">All phases</option>
            {phases.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
        {priorities.length > 0 && (
          <select
            value={clientF}
            onChange={(e) => setClientF(e.target.value)}
            className="rounded-[14px] px-3 py-2.5 text-sm outline-none"
            style={fieldStyle}
            aria-label="Show one client's movements"
          >
            <option value="">Every client</option>
            {clients
              .filter((c) => priorities.some((p) => p.clientId === c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}&rsquo;s movements
                </option>
              ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => setImporting(true)}
          className="rounded-full px-3.5 py-2 text-sm font-medium"
          style={{ background: 'var(--ghost)' }}
        >
          Import library sheet
        </button>
        <button
          type="button"
          onClick={() => setMakingCircuit(true)}
          className="rounded-full px-3.5 py-2 text-sm font-medium"
          style={{ background: 'var(--ghost)' }}
        >
          New circuit
        </button>
      </div>

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

            {(editing === 'new' || editing.isMine) && (
              <CurationFields exercise={editing === 'new' ? null : editing} />
            )}

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

      {mode === 'curated' ? (
        curatedGroups.length === 0 ? (
          <Card>
            <p className="text-sm ink-2">
              {hasCurated
                ? 'Nothing in her library matches that filter.'
                : 'Her library is empty. Import her library sheet, or tick "In her library" on any of your movements under Everything.'}
            </p>
          </Card>
        ) : (
          curatedGroups.map((g) => (
            <section key={g.name}>
              <div className="mb-1 flex items-baseline justify-between">
                <h2 className="display-face text-[17px] font-bold">{g.name}</h2>
                <span className="text-xs ink-3">{g.items.length}</span>
              </div>
              {g.purpose && <p className="mb-2 text-xs ink-2">{g.purpose}</p>}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map((e) => (
                  <LeanCard
                    key={e.id}
                    exercise={e}
                    names={names}
                    priority={clientF ? (clientPriority.get(e.id) ?? null) : null}
                    picked={picked.has(e.id)}
                    onPick={() => togglePick(e.id)}
                    onEdit={e.isMine ? () => setEditing(e) : undefined}
                  />
                ))}
              </div>
            </section>
          ))
        )
      ) : grouped.length === 0 ? (
        <Card>
          <p className="text-sm ink-2">Nothing matches that filter.</p>
        </Card>
      ) : (
        grouped.map(([cat, items]) => (
          <Card
            key={cat}
            title={categoryLabel(cat)}
            action={<span className="text-xs ink-3">{items.length}</span>}
          >
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
                            onClick={() => run(() => setSelectedAction(e.id, !e.selected))}
                            className="mr-3 text-xs underline ink-2 disabled:opacity-40"
                          >
                            {e.selected ? 'In her library ✓' : 'Add to her library'}
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

/** The sheet's fields for one of her own movements: what the lean card shows. */
function CurationFields({ exercise: e }: { exercise: LibraryExercise | null }) {
  const label = 'mb-1 block text-xs font-medium ink-2';
  const gates: ExerciseGate[] = ['pelvic_floor', 'shin'];
  return (
    <fieldset
      className="space-y-3 rounded-[14px] p-3"
      style={{ border: '1px solid var(--border)' }}
    >
      <legend className="px-1 text-xs font-semibold ink-2">Her library card</legend>
      <input type="hidden" name="curation" value="1" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label htmlFor="code" className={label}>
            Code
          </label>
          <input
            id="code"
            name="code"
            defaultValue={e?.code ?? ''}
            placeholder="FA1"
            className={field}
            style={fieldStyle}
          />
        </div>
        <div>
          <label htmlFor="domain" className={label}>
            Domain
          </label>
          <input
            id="domain"
            name="domain"
            defaultValue={e?.domain ?? ''}
            placeholder="Foot & ankle"
            className={field}
            style={fieldStyle}
          />
        </div>
        <div>
          <label htmlFor="movementType" className={label}>
            Type
          </label>
          <input
            id="movementType"
            name="movementType"
            defaultValue={e?.movementType ?? ''}
            placeholder="Strength"
            className={field}
            style={fieldStyle}
          />
        </div>
        <div>
          <label htmlFor="phases" className={label}>
            Phases <span className="ink-3">(comma separated)</span>
          </label>
          <input
            id="phases"
            name="phases"
            defaultValue={e?.phases.join(', ') ?? ''}
            placeholder="base, build"
            className={field}
            style={fieldStyle}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="dose" className={label}>
            Dose
          </label>
          <input
            id="dose"
            name="dose"
            defaultValue={e?.dose ?? ''}
            placeholder="4 x 5-6 per side"
            className={field}
            style={fieldStyle}
          />
        </div>
        <div>
          <label htmlFor="loadRule" className={label}>
            Load rule (RIR / RPE, est. kg)
          </label>
          <input
            id="loadRule"
            name="loadRule"
            defaultValue={e?.loadRule ?? ''}
            placeholder="RIR 2-3 · est. 10-25 kg"
            className={field}
            style={fieldStyle}
          />
        </div>
      </div>
      <div>
        <span className={label}>Ladder</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <input
              key={i}
              name={`l${i + 1}`}
              defaultValue={e?.ladder[i] ?? ''}
              placeholder={`L${i + 1}`}
              aria-label={`Level ${i + 1}`}
              className={field}
              style={fieldStyle}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="watchFor" className={label}>
            Watch for
          </label>
          <input
            id="watchFor"
            name="watchFor"
            defaultValue={e?.watchFor ?? ''}
            placeholder="Knee drifting in"
            className={field}
            style={fieldStyle}
          />
        </div>
        <div>
          <label htmlFor="regression" className={label}>
            Regression
          </label>
          <input
            id="regression"
            name="regression"
            defaultValue={e?.regression ?? ''}
            className={field}
            style={fieldStyle}
          />
        </div>
      </div>
      <div>
        <label htmlFor="why" className={label}>
          Why this one
        </label>
        <input
          id="why"
          name="why"
          defaultValue={e?.why ?? ''}
          className={field}
          style={fieldStyle}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="videoUrl" className={label}>
            Video link
          </label>
          <input
            id="videoUrl"
            name="videoUrl"
            type="url"
            defaultValue={e?.videoUrl ?? ''}
            placeholder="https://"
            className={field}
            style={fieldStyle}
          />
        </div>
        <div>
          <label htmlFor="videoSource" className={label}>
            Video source
          </label>
          <select
            id="videoSource"
            name="videoSource"
            defaultValue={e?.videoSource ?? ''}
            className={field}
            style={fieldStyle}
          >
            <option value="">Not set</option>
            <option value="own">Her own clip</option>
            <option value="stock">Stock clip</option>
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        {gates.map((g) => (
          <label key={g} className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              name="gates"
              value={g}
              defaultChecked={e?.gates.includes(g) ?? false}
              style={{ accentColor: palette.brand[600] }}
            />
            {GATE_LABEL[g]}
          </label>
        ))}
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            name="selected"
            defaultChecked={e?.selected ?? true}
            style={{ accentColor: palette.brand[600] }}
          />
          In her library
        </label>
      </div>
    </fieldset>
  );
}
