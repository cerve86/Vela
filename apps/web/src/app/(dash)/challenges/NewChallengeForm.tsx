'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CHALLENGE_METRICS, type ChallengeMetric } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { createChallengeAction } from './actions';

const field = 'w-full rounded-[14px] px-3.5 py-2.5 text-sm outline-none';
const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

/**
 * Creating a challenge.
 *
 * The participant picker comes first because the head count is what the target is built
 * from: two people at four a week for four weeks is thirty-two, and a coach should see that
 * number move as she ticks names rather than discovering it afterwards.
 */
export function NewChallengeForm({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [metric, setMetric] = useState<ChallengeMetric>('sessions_completed');
  const [weeks, setWeeks] = useState(4);
  const [weeklyTarget, setWeeklyTarget] = useState(4);
  const [startsOn, setStartsOn] = useState(nextMonday());
  const [picked, setPicked] = useState<string[]>([]);

  const groupTarget = picked.length * weeks * weeklyTarget;

  function save() {
    setError(null);
    const form = new FormData();
    form.set('name', name);
    form.set('summary', summary);
    form.set('metric', metric);
    form.set('weeks', String(weeks));
    form.set('weeklyTarget', String(weeklyTarget));
    form.set('startsOn', startsOn);
    form.set('clientIds', JSON.stringify(picked));

    startTransition(async () => {
      const result = await createChallengeAction(form);
      if (!result.ok) {
        setError(result.error ?? 'Could not save.');
        return;
      }
      setOpen(false);
      setName('');
      setSummary('');
      setPicked([]);
      if (result.id) router.push(`/challenges/${result.id}`);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="display-face rounded-full px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-px"
        style={{ background: palette.brand[600] }}
      >
        New challenge
      </button>
    );
  }

  return (
    <div
      className="rounded-[22px] p-7"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-start justify-between gap-4">
        <h2 className="display-face text-xl font-semibold">New challenge</h2>
        <button type="button" onClick={() => setOpen(false)} className="text-sm underline ink-2">
          Cancel
        </button>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <label className="col-span-2 block">
          <span className="text-xs ink-2">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Four weeks, four sessions"
            className={`${field} mt-1`}
            style={fieldStyle}
          />
        </label>

        <label className="col-span-2 block">
          <span className="text-xs ink-2">What it is, in her words</span>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Everyone logs four sessions a week. Group total, not a race."
            className={`${field} mt-1`}
            style={fieldStyle}
          />
        </label>

        <div className="col-span-2">
          <span className="text-xs ink-2">What it counts</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {CHALLENGE_METRICS.map((m) => {
              const on = m.value === metric;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMetric(m.value)}
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
          <p className="mt-2 text-[11px] ink-3">
            Pain, weight and load are not offered. A group board ranking those is not
            something this app will do.
          </p>
        </div>

        <label className="block">
          <span className="text-xs ink-2">Weeks</span>
          <input
            type="number"
            min={1}
            max={26}
            value={weeks}
            onChange={(e) => setWeeks(Math.max(1, Math.min(26, Number(e.target.value) || 1)))}
            className={`${field} mt-1 tnum`}
            style={fieldStyle}
          />
        </label>

        <label className="block">
          <span className="text-xs ink-2">Each person, per week</span>
          <input
            type="number"
            min={1}
            max={28}
            value={weeklyTarget}
            onChange={(e) => setWeeklyTarget(Math.max(1, Math.min(28, Number(e.target.value) || 1)))}
            className={`${field} mt-1 tnum`}
            style={fieldStyle}
          />
        </label>

        <label className="col-span-2 block">
          <span className="text-xs ink-2">Starting</span>
          <input
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className={`${field} mt-1 tnum`}
            style={fieldStyle}
          />
        </label>

        <div className="col-span-2">
          <span className="text-xs ink-2">Who is in it</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {clients.map((c) => {
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
                  className="rounded-full px-3.5 py-2 text-xs font-medium"
                  style={{
                    background: on ? palette.brand[600] : 'var(--ghost)',
                    color: on ? '#fff' : 'var(--ink-primary)',
                  }}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
          {clients.length === 0 && (
            <p className="mt-2 text-[11px] ink-3">
              No active clients yet. A challenge needs at least two people.
            </p>
          )}
        </div>
      </div>

      {/* The commitment, before it is made. */}
      {picked.length > 0 && (
        <div className="mt-5 rounded-[16px] p-4" style={{ background: 'var(--ghost)' }}>
          <div className="text-sm font-medium">
            {groupTarget} {metric === 'fuel_days' ? 'days' : 'sessions'} between{' '}
            {picked.length} {picked.length === 1 ? 'person' : 'people'}
          </div>
          <div className="mt-1 text-[11px] ink-3">
            {weeklyTarget} each per week across {weeks} {weeks === 1 ? 'week' : 'weeks'}. Adding
            somebody later raises the group target rather than making it easier to clear.
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm" style={{ color: palette.status.critical }}>
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !name.trim() || picked.length < 2}
          className="display-face rounded-full px-5 py-2.5 text-sm font-medium text-white transition-transform enabled:hover:-translate-y-px disabled:opacity-50"
          style={{ background: palette.brand[600] }}
        >
          {pending ? 'Saving…' : 'Start challenge'}
        </button>
        <span className="text-xs ink-2">
          {picked.length < 2
            ? 'Pick at least two people — a group of one is just her own total.'
            : 'Everyone in it sees the group total and their own share.'}
        </span>
      </div>
    </div>
  );
}

/** Challenges almost always start on a Monday, so offer the next one. */
function nextMonday(): string {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return d.toISOString().slice(0, 10);
}
