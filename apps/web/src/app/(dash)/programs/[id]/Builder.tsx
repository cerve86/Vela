'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DISCIPLINES,
  type Discipline,
  type LibraryExercise,
  type Program,
  type ProgramItem,
} from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Card, StatusPill } from '@/components/ui';
import {
  addDayAction,
  addItemAction,
  assignProgramAction,
  deleteDayAction,
  deleteItemAction,
  updateItemAction,
} from '../actions';

const input = 'rounded-[10px] px-2.5 py-1.5 text-sm outline-none';
const inputStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

const DISCIPLINE_TONE: Record<Discipline, 'good' | 'serious' | 'warning' | 'neutral'> = {
  strength: 'neutral',
  run: 'serious',
  rehab: 'good',
  mobility: 'warning',
};

export function Builder({
  program,
  library,
  clients,
}: {
  program: Program;
  library: LibraryExercise[];
  clients: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [week, setWeek] = useState(1);

  const weeks = useMemo(
    () => Array.from({ length: program.durationWeeks }, (_, i) => i + 1),
    [program.durationWeeks],
  );
  const daysThisWeek = program.days.filter((d) => d.weekNo === week);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Something went wrong.');
      else {
        if (success) setNotice(success);
        router.refresh();
      }
    });
  }

  /**
   * Copying a week is the single biggest time-saver in a builder like this: rehab
   * programmes repeat with small progressions, so week 2 is usually week 1 with more
   * load. We duplicate structure, not the prescription, and let the coach adjust.
   */
  function copyWeek(from: number, to: number) {
    const source = program.days.filter((d) => d.weekNo === from);
    if (source.length === 0) {
      setError(`Week ${from} has no days to copy.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      for (const d of source) {
        const res = await addDayAction(program.id, {
          weekNo: to,
          dayNo: d.dayNo,
          title: d.title,
          discipline: d.discipline,
        });
        if (!res.ok) {
          setError(res.error ?? 'Could not copy the week.');
          return;
        }
      }
      // Re-fetch so the new day ids are available before adding items to them.
      router.refresh();
      setNotice(`Copied week ${from} structure into week ${to}. Add the exercises and progress the load.`);
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm" style={{ color: palette.status.critical }}>
          {error}
        </p>
      )}
      {notice && (
        <p className="text-sm" style={{ color: 'var(--success-text)' }}>
          {notice}
        </p>
      )}

      <AssignCard
        clients={clients}
        pending={pending}
        onAssign={(clientId, startDate) =>
          run(
            () => assignProgramAction(program.id, clientId, startDate),
            'Assigned. The sessions are now on her calendar.',
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {weeks.map((w) => {
          const count = program.days.filter((d) => d.weekNo === w).length;
          const active = w === week;
          return (
            <button
              key={w}
              type="button"
              onClick={() => setWeek(w)}
              className="rounded-full px-3.5 py-2 text-sm font-medium"
              style={{
                background: active ? palette.brand[600] : 'var(--ghost)',
                color: active ? '#fff' : 'var(--ink-secondary)',
              }}
            >
              Week {w}
              <span className="ml-1.5 opacity-70">{count}</span>
            </button>
          );
        })}
        {week > 1 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => copyWeek(week - 1, week)}
            className="ml-2 text-xs underline ink-2 disabled:opacity-40"
          >
            Copy week {week - 1} structure here
          </button>
        )}
      </div>

      <AddDayCard
        week={week}
        existingDayNos={daysThisWeek.map((d) => d.dayNo)}
        pending={pending}
        onAdd={(dayNo, title, discipline) =>
          run(() => addDayAction(program.id, { weekNo: week, dayNo, title, discipline }))
        }
      />

      {daysThisWeek.length === 0 ? (
        <Card>
          <p className="text-sm ink-2">
            Week {week} is empty. Add a training day above — day 1 is the first session of
            the week, and the start date you assign decides what that means on a calendar.
          </p>
        </Card>
      ) : (
        daysThisWeek.map((day) => (
          <Card
            key={day.id}
            title={`Day ${day.dayNo} — ${day.title}`}
            action={
              <span className="flex items-center gap-3">
                <StatusPill tone={DISCIPLINE_TONE[day.discipline]}>
                  {DISCIPLINES.find((d) => d.value === day.discipline)?.label ?? day.discipline}
                </StatusPill>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => deleteDayAction(program.id, day.id))}
                  className="text-xs underline ink-2 disabled:opacity-40"
                >
                  Remove day
                </button>
              </span>
            }
          >
            {day.items.length === 0 ? (
              <p className="mb-3 text-sm ink-3">No exercises yet.</p>
            ) : (
              <table className="mb-3 w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs ink-3">
                    <th className="pb-2 font-medium">Block</th>
                    <th className="pb-2 font-medium">Exercise</th>
                    <th className="pb-2 font-medium">Sets</th>
                    <th className="pb-2 font-medium">Reps</th>
                    <th className="pb-2 font-medium">Load kg</th>
                    <th className="pb-2 font-medium">RPE</th>
                    <th className="pb-2 font-medium">Rest s</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {day.items.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      pending={pending}
                      onSave={(patch) =>
                        run(() => updateItemAction(program.id, item.id, patch), 'Saved.')
                      }
                      onDelete={() => run(() => deleteItemAction(program.id, item.id))}
                    />
                  ))}
                </tbody>
              </table>
            )}

            <ExercisePicker
              library={library}
              pending={pending}
              onPick={(exerciseId) =>
                run(() => addItemAction(program.id, day.id, exerciseId, day.items.length))
              }
            />
          </Card>
        ))
      )}

      <p className="text-xs ink-3">
        Editing this programme never changes sessions already completed — the prescription
        and the logged work are separate records. <Link href="/library" className="underline">
          Adjust exercises or add your own
        </Link>{' '}
        in the library.
      </p>
    </div>
  );
}

function ItemRow({
  item,
  pending,
  onSave,
  onDelete,
}: {
  item: ProgramItem;
  pending: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const [block, setBlock] = useState(item.block);
  const [sets, setSets] = useState(String(item.sets));
  const [reps, setReps] = useState(item.reps);
  const [load, setLoad] = useState(item.targetLoadKg === null ? '' : String(item.targetLoadKg));
  const [rpe, setRpe] = useState(item.targetRpe === null ? '' : String(item.targetRpe));
  const [rest, setRest] = useState(String(item.restSec));

  const dirty =
    block !== item.block ||
    sets !== String(item.sets) ||
    reps !== item.reps ||
    load !== (item.targetLoadKg === null ? '' : String(item.targetLoadKg)) ||
    rpe !== (item.targetRpe === null ? '' : String(item.targetRpe)) ||
    rest !== String(item.restSec);

  return (
    <tr className="border-b last:border-0">
      <td className="py-2 pr-2">
        <input
          value={block}
          onChange={(e) => setBlock(e.target.value.toUpperCase().slice(0, 1))}
          className={`${input} w-12 text-center`}
          style={inputStyle}
          aria-label="Block"
        />
      </td>
      <td className="py-2 pr-2 font-medium">{item.exerciseName}</td>
      <td className="py-2 pr-2">
        <input
          value={sets}
          onChange={(e) => setSets(e.target.value.replace(/\D/g, ''))}
          className={`${input} w-14 text-center`}
          style={inputStyle}
          aria-label="Sets"
        />
      </td>
      <td className="py-2 pr-2">
        <input
          value={reps}
          onChange={(e) => setReps(e.target.value)}
          className={`${input} w-24`}
          style={inputStyle}
          aria-label="Reps"
          placeholder="8-10"
        />
      </td>
      <td className="py-2 pr-2">
        <input
          value={load}
          onChange={(e) => setLoad(e.target.value.replace(/[^\d.]/g, ''))}
          className={`${input} w-16 text-center`}
          style={inputStyle}
          aria-label="Target load"
          placeholder="—"
        />
      </td>
      <td className="py-2 pr-2">
        <input
          value={rpe}
          onChange={(e) => setRpe(e.target.value.replace(/[^\d.]/g, ''))}
          className={`${input} w-14 text-center`}
          style={inputStyle}
          aria-label="Target RPE"
          placeholder="—"
        />
      </td>
      <td className="py-2 pr-2">
        <input
          value={rest}
          onChange={(e) => setRest(e.target.value.replace(/\D/g, ''))}
          className={`${input} w-16 text-center`}
          style={inputStyle}
          aria-label="Rest seconds"
        />
      </td>
      <td className="py-2 text-right whitespace-nowrap">
        {dirty && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              onSave({
                block: block || 'A',
                sets: Number(sets) || 1,
                reps: reps || '10',
                targetLoadKg: load === '' ? null : Number(load),
                targetRpe: rpe === '' ? null : Number(rpe),
                restSec: Number(rest) || 0,
              })
            }
            className="text-xs font-semibold underline disabled:opacity-40"
            style={{ color: palette.brand[700] }}
          >
            Save
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={onDelete}
          className="ml-3 text-xs underline ink-2 disabled:opacity-40"
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

function ExercisePicker({
  library,
  pending,
  onPick,
}: {
  library: LibraryExercise[];
  pending: boolean;
  onPick: (exerciseId: string) => void;
}) {
  const [value, setValue] = useState('');
  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className={`${input} max-w-xs`}
        style={inputStyle}
        aria-label="Add an exercise"
      >
        <option value="">Add an exercise…</option>
        {library.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
            {e.isMine ? ' (mine)' : ''}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={pending || !value}
        onClick={() => {
          onPick(value);
          setValue('');
        }}
        className="rounded-full px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-40"
        style={{ background: palette.brand[600] }}
      >
        Add
      </button>
    </div>
  );
}

function AddDayCard({
  week,
  existingDayNos,
  pending,
  onAdd,
}: {
  week: number;
  existingDayNos: number[];
  pending: boolean;
  onAdd: (dayNo: number, title: string, discipline: Discipline) => void;
}) {
  const free = [1, 2, 3, 4, 5, 6, 7].filter((n) => !existingDayNos.includes(n));
  const [dayNo, setDayNo] = useState(free[0] ?? 1);
  const [title, setTitle] = useState('');
  const [discipline, setDiscipline] = useState<Discipline>('strength');

  if (free.length === 0) {
    return (
      <Card>
        <p className="text-sm ink-2">Week {week} has all seven days filled.</p>
      </Card>
    );
  }

  return (
    <Card title={`Add a day to week ${week}`}>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-medium ink-2">
          Day
          <select
            value={dayNo}
            onChange={(e) => setDayNo(Number(e.target.value))}
            className={`${input} ml-2 w-16`}
            style={inputStyle}
          >
            {free.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Strength — lower body"
          className={`${input} min-w-56 flex-1`}
          style={inputStyle}
          aria-label="Day title"
        />
        <select
          value={discipline}
          onChange={(e) => setDiscipline(e.target.value as Discipline)}
          className={input}
          style={inputStyle}
          aria-label="Discipline"
        >
          {DISCIPLINES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            onAdd(dayNo, title, discipline);
            setTitle('');
          }}
          className="display-face rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: palette.brand[600] }}
        >
          Add day
        </button>
      </div>
    </Card>
  );
}

function AssignCard({
  clients,
  pending,
  onAssign,
}: {
  clients: { id: string; name: string }[];
  pending: boolean;
  onAssign: (clientId: string, startDate: string) => void;
}) {
  const [clientId, setClientId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  return (
    <Card title="Assign to a client">
      {clients.length === 0 ? (
        <p className="text-sm ink-2">
          No active clients yet. Invite one and she&apos;ll appear here.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className={`${input} min-w-48`}
              style={inputStyle}
              aria-label="Client"
            >
              <option value="">Choose a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <label className="text-xs font-medium ink-2">
              Starts
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`${input} ml-2`}
                style={inputStyle}
              />
            </label>
            <button
              type="button"
              disabled={pending || !clientId}
              onClick={() => onAssign(clientId, startDate)}
              className="display-face rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: palette.brand[600] }}
            >
              Assign
            </button>
          </div>
          <p className="mt-2 text-xs ink-3">
            Assigning replaces any live programme and clears her <em>future</em> scheduled
            sessions. Anything already completed stays — that is training history, not a
            draft.
          </p>
        </>
      )}
    </Card>
  );
}
