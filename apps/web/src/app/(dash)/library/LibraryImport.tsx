'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { LibraryImportSummary } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Card } from '@/components/ui';
import { importLibraryAction } from './actions';

/**
 * Her library workbook in, previewed first. The preview names what will be created,
 * updated and selected, which clients' priorities it found, and anything in the sheet it
 * could not read; nothing is written until she imports.
 */
export function LibraryImport({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState<LibraryImportSummary | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = (dryRun: boolean) => {
    const file = input.current?.files?.[0];
    if (!file) {
      setError('Choose the workbook first.');
      return;
    }
    const fd = new FormData();
    fd.set('file', file);
    if (dryRun) fd.set('dryRun', '1');
    startTransition(async () => {
      setError(null);
      const res = await importLibraryAction(fd);
      if (!res.ok || !res.summary) setError(res.error ?? 'Could not read that file.');
      else {
        setSummary(res.summary);
        // A preview after an import is a preview again: it says "This will", not "Imported".
        setDone(!dryRun);
        if (!dryRun) router.refresh();
      }
    });
  };

  const btn = 'display-face rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40';

  return (
    <Card title="Import her library sheet">
      <p className="text-sm ink-2">
        The workbook with a <b>Library</b> tab (code, domain, movement, type, dose, load rule,
        L1–L4, regression, why), and optionally <b>Domains</b>, <b>Assignment</b> (each
        client&rsquo;s movements, PRIORITY or x) and a <b>Vela selection</b> tab. Movements are
        matched by code, then by name; anything new becomes yours. Vela&rsquo;s shipped exercises
        are never changed.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          onChange={() => {
            setSummary(null);
            setDone(false);
          }}
          className="text-sm"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => send(true)}
          className={btn}
          style={{ background: 'var(--ghost)' }}
        >
          {pending && !summary ? 'Reading…' : 'Preview'}
        </button>
        {summary && !done && (
          <button
            type="button"
            disabled={pending}
            onClick={() => send(false)}
            className={btn}
            style={{ background: palette.brand[600], color: '#fff' }}
          >
            {pending ? 'Importing…' : 'Import'}
          </button>
        )}
        <button type="button" onClick={onClose} className="ml-auto text-sm underline ink-2">
          Close
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm" style={{ color: palette.status.critical }}>
          {error}
        </p>
      )}

      {summary && (
        <div className="mt-3 space-y-2 text-sm">
          <p className="font-semibold">
            {done ? 'Imported.' : 'This will:'} {summary.created.length} new ·{' '}
            {summary.updated.length} updated · {summary.merged.length} onto her own exercises ·{' '}
            {summary.selected} in her library · {summary.domains} domains · {summary.priorities}{' '}
            client priorities
          </p>
          {summary.merged.length > 0 && (
            <details className="text-xs ink-2">
              <summary className="cursor-pointer">
                Onto her own exercises ({summary.merged.length})
                {summary.archived.length > 0 &&
                  ` · ${summary.archived.length} earlier copies archived`}
              </summary>
              <p className="mt-1">{summary.merged.join(' · ')}</p>
            </details>
          )}
          {summary.clientsMatched.length > 0 && (
            <p className="ink-2">Priorities for {summary.clientsMatched.join(', ')}.</p>
          )}
          {summary.clientsUnmatched.length > 0 && (
            <p style={{ color: palette.status.warning }}>
              No single client named {summary.clientsUnmatched.join(', ')} — their priorities are
              skipped.
            </p>
          )}
          {summary.warnings.length > 0 && (
            <ul className="list-disc pl-5 text-xs ink-2">
              {summary.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
          {summary.created.length > 0 && (
            <details className="text-xs ink-2">
              <summary className="cursor-pointer">New movements</summary>
              <p className="mt-1">{summary.created.join(' · ')}</p>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
