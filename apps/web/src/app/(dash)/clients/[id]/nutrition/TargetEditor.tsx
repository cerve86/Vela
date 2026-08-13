'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { targetConcerns, type NutritionTarget } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Card, StatusPill } from '@/components/ui';
import { deleteTargetAction, setTargetAction } from './actions';

const input = 'rounded-[10px] px-2.5 py-1.5 text-sm outline-none';
const inputStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

function Field({
  label,
  name,
  value,
  onChange,
  unit,
  width = 'w-24',
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  unit?: string;
  width?: string;
}) {
  return (
    <label className="text-xs font-medium ink-2">
      <span className="block pb-1">
        {label}
        {unit && <span className="ink-3"> ({unit})</span>}
      </span>
      <input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        className={`${input} ${width} tnum`}
        style={inputStyle}
      />
    </label>
  );
}

export function TargetEditor({
  clientId,
  current,
  history,
  breastfeeding,
  today,
}: {
  clientId: string;
  current: NutritionTarget | null;
  history: NutritionTarget[];
  breastfeeding: boolean;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kcal, setKcal] = useState(String(current?.kcal ?? 2200));
  const [proteinG, setProteinG] = useState(String(current?.proteinG ?? 120));
  const [carbsG, setCarbsG] = useState(String(current?.carbsG ?? 250));
  const [fatG, setFatG] = useState(String(current?.fatG ?? 75));
  const [effectiveFrom, setEffectiveFrom] = useState(today);
  const [note, setNote] = useState('');

  const n = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  // Both checks run as she types rather than on submit. A coach should see the arithmetic
  // disagree while she can still fix the number that is wrong, not after a round trip.
  const fromMacros = n(proteinG) * 4 + n(carbsG) * 4 + n(fatG) * 9;
  const drift = n(kcal) > 0 ? Math.abs(fromMacros - n(kcal)) / n(kcal) : 0;
  const concerns = useMemo(
    () => targetConcerns(n(kcal), { breastfeeding }),
    [kcal, breastfeeding],
  );

  function save() {
    setError(null);
    const form = new FormData();
    form.set('kcal', kcal);
    form.set('proteinG', proteinG);
    form.set('carbsG', carbsG);
    form.set('fatG', fatG);
    form.set('effectiveFrom', effectiveFrom);
    form.set('note', note);

    startTransition(async () => {
      const res = await setTargetAction(clientId, form);
      if (!res.ok) setError(res.error ?? 'Could not save.');
      else {
        setOpen(false);
        setNote('');
        router.refresh();
      }
    });
  }

  return (
    <Card
      title="Macro target"
      action={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-white"
          style={{ background: palette.brand[600] }}
        >
          {open ? 'Cancel' : current ? 'Change target' : 'Set a target'}
        </button>
      }
    >
      {current ? (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="tnum text-2xl font-extrabold">
            {current.kcal.toLocaleString('en-GB')}
            <span className="ml-1 text-sm font-normal ink-3">kcal</span>
          </span>
          <span className="text-sm ink-2">
            <span className="tnum font-semibold">{current.proteinG}</span> g protein ·{' '}
            <span className="tnum font-semibold">{current.carbsG}</span> g carbs ·{' '}
            <span className="tnum font-semibold">{current.fatG}</span> g fat
          </span>
          <span className="text-xs ink-3">
            in force since{' '}
            {new Date(`${current.effectiveFrom}T00:00:00Z`).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
            })}
          </span>
        </div>
      ) : (
        <p className="text-sm ink-2">
          No target set. Her app shows what she logged without a goal attached to it,
          which is a reasonable place to start.
        </p>
      )}

      {current?.note && <p className="mt-2 text-sm ink-2">{current.note}</p>}

      {open && (
        <div className="mt-4 border-t pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Energy" name="kcal" unit="kcal" value={kcal} onChange={setKcal} />
            <Field label="Protein" name="proteinG" unit="g" value={proteinG} onChange={setProteinG} />
            <Field label="Carbs" name="carbsG" unit="g" value={carbsG} onChange={setCarbsG} />
            <Field label="Fat" name="fatG" unit="g" value={fatG} onChange={setFatG} />
            <label className="text-xs font-medium ink-2">
              <span className="block pb-1">In force from</span>
              <input
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                className={`${input} w-40`}
                style={inputStyle}
              />
            </label>
          </div>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why this target — she sees this in the app."
            rows={2}
            className={`${input} mt-3 w-full`}
            style={inputStyle}
          />

          <p className="mt-2 text-xs ink-3">
            Those macros come to{' '}
            <span className={`tnum font-semibold ${drift > 0.1 ? 'text-[var(--status-warning)]' : ''}`}>
              {Math.round(fromMacros).toLocaleString('en-GB')} kcal
            </span>
            {drift > 0.1 && ' — more than 10% from the energy target, so it will not save.'}
          </p>

          {concerns.map((c) => (
            <p key={c} className="mt-2 text-sm" style={{ color: palette.status.warning }}>
              {c}
            </p>
          ))}

          {error && (
            <p className="mt-2 text-sm" style={{ color: palette.status.critical }}>
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="mt-3 rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: palette.brand[600] }}
          >
            {pending ? 'Saving…' : 'Save target'}
          </button>

          {history.length > 0 && (
            <div className="mt-5">
              <div className="mb-1.5 text-xs font-medium ink-3">Earlier targets</div>
              <ul className="divide-y text-sm">
                {history.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-1.5">
                    <span className="tnum w-28 ink-2">
                      {new Date(`${t.effectiveFrom}T00:00:00Z`).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'UTC',
                      })}
                    </span>
                    <span className="tnum flex-1">
                      {t.kcal} kcal · {t.proteinG}/{t.carbsG}/{t.fatG} g
                    </span>
                    {t.id === current?.id ? (
                      <StatusPill tone="good">In force</StatusPill>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          startTransition(async () => {
                            await deleteTargetAction(clientId, t.id);
                            router.refresh();
                          })
                        }
                        className="text-xs ink-3 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs ink-3">
                Removing a past target changes what her logged days were measured against.
                The entries themselves never move.
              </p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
