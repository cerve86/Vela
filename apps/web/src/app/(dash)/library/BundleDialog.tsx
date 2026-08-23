'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LibraryExercise } from '@vela/api';
import { PROGRESSION_MODELS, planBundle, weeklySets, type ProgressionModel } from '@vela/shared';
import { palette } from '@vela/shared/tokens';
import { createBundleAction } from '../programs/actions';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const field = 'w-full rounded-[14px] px-3.5 py-2.5 text-sm outline-none';
const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

/**
 * Turns a selection of movements into weeks of prescription, on one screen.
 *
 * The alternative — and what this replaces — is the day-by-day builder: create a block, add
 * a day, add five items to it, add the next day, repeat for six weeks, then go and assign
 * it. Dozens of interactions to express one decision a coach had already made before she
 * opened the page.
 *
 * The preview is not decoration. A coach picking "wave" over six weeks on four days is
 * committing someone to a specific amount of work, and the weekly set count is the number
 * that tells her whether she has just been ambitious or unreasonable — before it lands on
 * a phone rather than after.
 */
export function BundleDialog({
  selected,
  clients,
  onClose,
  onDone,
}: {
  selected: LibraryExercise[];
  clients: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState(6);
  const [days, setDays] = useState<number[]>([1, 3, 5]);
  const [model, setModel] = useState<ProgressionModel>('wave');
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState('8-10');
  const [assignTo, setAssignTo] = useState('');
  const [startDate, setStartDate] = useState(nextMonday());

  const movements = useMemo(
    () =>
      selected.map((e) => ({
        exerciseId: e.id,
        name: e.name,
        sets,
        reps,
        restSec: 90,
      })),
    [selected, sets, reps],
  );

  // The same function the server uses to write the rows, so the preview cannot disagree
  // with what gets saved.
  const plan = useMemo(
    () => planBundle({ movements, days, weeks, model, title: name || 'Block' }),
    [movements, days, weeks, model, name],
  );
  const byWeek = useMemo(() => weeklySets(plan), [plan]);

  function save() {
    setError(null);
    const form = new FormData();
    form.set('name', name);
    form.set('weeks', String(weeks));
    form.set('model', model);
    form.set('days', JSON.stringify(days));
    form.set('movements', JSON.stringify(movements));
    if (assignTo) {
      form.set('assignTo', assignTo);
      form.set('startDate', startDate);
    }

    startTransition(async () => {
      const result = await createBundleAction(form);
      if (!result.ok) {
        setError(result.error ?? 'Could not save.');
        return;
      }
      onDone();
      router.push('/programs');
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto p-6"
      style={{ background: 'rgba(18,23,43,0.45)' }}
    >
      <div
        className="w-full max-w-2xl rounded-[22px] p-7"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="display-face text-2xl font-semibold">Bundle into a block</h2>
            <p className="mt-0.5 text-sm ink-2">
              {selected.length} movement{selected.length === 1 ? '' : 's'} ·{' '}
              {selected.map((e) => e.name).join(', ')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-sm underline ink-2">
            Cancel
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          <label className="col-span-2 block">
            <span className="text-xs ink-2">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Return to running — weeks 12–18"
              className={`${field} mt-1`}
              style={fieldStyle}
            />
          </label>

          <label className="block">
            <span className="text-xs ink-2">Sets to start</span>
            <input
              type="number"
              min={1}
              max={10}
              value={sets}
              onChange={(e) => setSets(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              className={`${field} mt-1 tnum`}
              style={fieldStyle}
            />
          </label>

          <label className="block">
            <span className="text-xs ink-2">Reps</span>
            <input
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              placeholder="8-10, AMRAP, 30s"
              className={`${field} mt-1`}
              style={fieldStyle}
            />
          </label>

          <label className="block">
            <span className="text-xs ink-2">Weeks</span>
            <input
              type="number"
              min={1}
              max={24}
              value={weeks}
              onChange={(e) => setWeeks(Math.max(1, Math.min(24, Number(e.target.value) || 1)))}
              className={`${field} mt-1 tnum`}
              style={fieldStyle}
            />
          </label>

          <div>
            <span className="text-xs ink-2">Training days</span>
            <div className="mt-1 flex gap-1">
              {DAY_NAMES.map((d, i) => {
                const n = i + 1;
                const on = days.includes(n);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setDays((prev) =>
                        prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
                      )
                    }
                    aria-pressed={on}
                    className="flex-1 rounded-[10px] py-2.5 text-[11px] font-medium"
                    style={{
                      background: on ? palette.brand[600] : 'var(--ghost)',
                      color: on ? '#fff' : 'var(--ink-secondary)',
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="col-span-2">
            <span className="text-xs ink-2">Progression</span>
            <div className="mt-1 grid grid-cols-3 gap-2">
              {PROGRESSION_MODELS.map((m) => {
                const on = m.value === model;
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setModel(m.value)}
                    aria-pressed={on}
                    className="rounded-[14px] p-3 text-left"
                    style={{
                      background: on ? 'var(--tint-cream)' : 'var(--ghost)',
                      border: `1.5px solid ${on ? palette.brand[600] : 'transparent'}`,
                    }}
                  >
                    <div className="text-sm font-medium">{m.label}</div>
                    <div className="mt-0.5 text-[11px] ink-2">{m.blurb}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* The commitment, in sets per week. */}
        {byWeek.length > 0 && (
          <div className="mt-5 rounded-[16px] p-4" style={{ background: 'var(--ghost)' }}>
            <div className="text-xs font-medium ink-2">
              {plan.length} sessions · {byWeek.reduce((n, w) => n + w.sets, 0)} sets in total
            </div>
            <div className="mt-2.5 flex items-end gap-1.5">
              {byWeek.map((w) => {
                const max = Math.max(...byWeek.map((x) => x.sets), 1);
                return (
                  <div key={w.week} className="flex-1 text-center">
                    <div
                      className="mx-auto w-full rounded-t-[4px]"
                      style={{
                        height: Math.max(6, (w.sets / max) * 54),
                        background: w.deload ? palette.brand[300] : palette.brand[600],
                      }}
                      title={`Week ${w.week}: ${w.sets} sets`}
                    />
                    <div className="mt-1 text-[10px] ink-3">{w.week}</div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 text-[11px] ink-3">
              Sets per week. Pale bars are deload weeks — the drop is deliberate.
            </div>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs ink-2">Assign to (optional)</span>
            <select
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value)}
              className={`${field} mt-1`}
              style={fieldStyle}
            >
              <option value="">Save without assigning</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs ink-2">Starting</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={!assignTo}
              className={`${field} mt-1 tnum disabled:opacity-50`}
              style={fieldStyle}
            />
          </label>
        </div>

        {error && (
          <p className="mt-3 text-sm" style={{ color: palette.status.critical }}>
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending || !name.trim() || days.length === 0}
            className="display-face rounded-full px-5 py-2.5 text-sm font-medium text-white transition-transform enabled:hover:-translate-y-px disabled:opacity-50"
            style={{ background: palette.brand[600] }}
          >
            {pending ? 'Saving…' : assignTo ? 'Save and send to her app' : 'Save block'}
          </button>
          <span className="text-xs ink-2">
            {assignTo
              ? 'Sessions are generated from the start date and appear on her phone.'
              : 'You can assign it from the block afterwards.'}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Blocks almost always start on a Monday, so offer the next one. */
function nextMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}
