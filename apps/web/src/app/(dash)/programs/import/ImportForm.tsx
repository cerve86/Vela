'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { palette } from '@vela/shared/tokens';
import { Card, StatusPill } from '@/components/ui';
import { commitImportAction, previewImportAction, type ImportPreview } from './actions';

const field = 'rounded-[14px] px-3.5 py-2.5 text-sm outline-none';
const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

/**
 * Two steps: read the file and show what it would make; then make it.
 *
 * Nothing is created until the second button. The preview lists every day and movement
 * as the parser understood them, names any exercise the library does not know, and shows
 * row-numbered errors the way Excel numbers them — so the fix happens in the spreadsheet,
 * where the coach is comfortable, rather than in a half-built programme.
 */
export function ImportForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);

  const blocked = preview?.ok === true && preview.unmatched.length > 0;

  return (
    <div className="space-y-4">
      <Card title="Import from a spreadsheet">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setCommitError(null);
            startTransition(async () => {
              setPreview(await previewImportAction(fd));
            });
          }}
          className="space-y-3"
        >
          <p className="text-sm ink-2">
            One row per movement: week, day, exercise, sets, reps, and optionally title,
            discipline, block, load, RPE, tempo, rest and notes. Leave week and day blank to
            repeat the row above.{' '}
            <a href="/programme-template.csv" download className="underline">
              Download the template
            </a>
            . Exercise names must match your{' '}
            <Link href="/library" className="underline">
              library
            </Link>
            .
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label htmlFor="file" className="mb-1.5 block text-xs font-medium ink-2">
                Spreadsheet (.xlsx or .csv)
              </label>
              <input
                id="file"
                name="file"
                type="file"
                required
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className={`${field} w-full`}
                style={fieldStyle}
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="name" className="mb-1.5 block text-xs font-medium ink-2">
                Programme name <span className="ink-3">(defaults to the file name)</span>
              </label>
              <input id="name" name="name" placeholder="Return to running — weeks 12-18" className={`${field} w-full`} style={fieldStyle} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm ink-2">
                <input type="checkbox" name="isTemplate" /> Save as template
              </label>
            </div>
            <div className="sm:col-span-3">
              <label htmlFor="description" className="mb-1.5 block text-xs font-medium ink-2">
                Description
              </label>
              <input id="description" name="description" placeholder="Graded walk-run with posterior chain strength" className={`${field} w-full`} style={fieldStyle} />
            </div>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="display-face rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: palette.brand[600] }}
          >
            {pending && !preview ? 'Reading…' : 'Preview'}
          </button>
        </form>
      </Card>

      {preview && !preview.ok && (
        <Card title="Fix these in the spreadsheet, then preview again">
          <ul className="space-y-1.5 text-sm">
            {preview.errors.map((e, i) => (
              <li key={i} className="flex gap-3">
                <span className="tnum w-16 shrink-0 ink-3">{e.row > 0 ? `Row ${e.row}` : '—'}</span>
                <span>{e.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {preview?.ok && (
        <Card title={`Preview — ${preview.program.name}`}>
          <p className="text-sm ink-2">
            {preview.summary.weeks} week{preview.summary.weeks === 1 ? '' : 's'} · {preview.summary.days} day
            {preview.summary.days === 1 ? '' : 's'} · {preview.summary.items} movement
            {preview.summary.items === 1 ? '' : 's'} · {preview.summary.exercises} distinct exercise
            {preview.summary.exercises === 1 ? '' : 's'}
            {preview.program.isTemplate ? ' · template' : ''}
          </p>

          {blocked && (
            <div className="mt-3 rounded-[14px] p-3 text-sm" style={{ background: 'var(--tint-cream)' }}>
              <div className="font-medium">Not in your library — nothing has been created</div>
              <ul className="mt-1 list-disc pl-5 ink-2">
                {preview.unmatched.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p className="mt-2 ink-2">
                Rename them in the file to match, or{' '}
                <Link href="/library" className="underline">
                  add them to the library
                </Link>{' '}
                first, then preview again. Spelling has to match; case, spaces and hyphens do not.
              </p>
            </div>
          )}

          <div className="mt-4 space-y-4">
            {preview.program.days.map((d) => (
              <div key={`${d.weekNo}-${d.dayNo}`}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="tnum ink-3">
                    W{d.weekNo} · D{d.dayNo}
                  </span>
                  <span className="font-medium">{d.title}</span>
                  <StatusPill tone="neutral">{d.discipline}</StatusPill>
                </div>
                <table className="mt-1.5 w-full text-xs">
                  <tbody>
                    {d.items.map((it, i) => {
                      const missing = preview.unmatched.some((u) => u.toLowerCase() === it.exercise.toLowerCase());
                      return (
                        <tr key={i} className="border-b last:border-0" style={{ borderColor: 'var(--border)' }}>
                          <td className="tnum w-8 py-1.5 ink-3">{it.block}</td>
                          <td className="py-1.5 font-medium" style={missing ? { color: palette.status.critical } : undefined}>
                            {it.exercise}
                          </td>
                          <td className="tnum py-1.5 ink-2">
                            {it.sets} × {it.reps}
                            {it.loadKg !== null ? ` · ${it.loadKg} kg` : ''}
                            {it.rpe !== null ? ` · RPE ${it.rpe}` : ''}
                            {it.tempo ? ` · ${it.tempo}` : ''} · rest {it.restSec}s
                          </td>
                          <td className="py-1.5 ink-3">{it.notes}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {commitError && (
            <p className="mt-3 text-sm" style={{ color: palette.status.critical }}>
              {commitError}
            </p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              disabled={pending || blocked}
              onClick={() => {
                setCommitError(null);
                startTransition(async () => {
                  const res = await commitImportAction(preview.program);
                  if (!res.ok) setCommitError(res.error ?? 'Could not create the programme.');
                  else router.push(`/programs/${res.id}`);
                });
              }}
              className="display-face rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: palette.brand[600] }}
            >
              {pending ? 'Creating…' : 'Create programme'}
            </button>
            <span className="text-xs ink-3">Opens in the builder, where every day can still be edited.</span>
          </div>
        </Card>
      )}
    </div>
  );
}
