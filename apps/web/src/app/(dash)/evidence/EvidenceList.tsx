'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { EvidenceRef } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Card } from '@/components/ui';
import { deleteEvidenceAction, saveEvidenceAction } from './actions';

const TOPICS = [
  'Freshness and load',
  'HRV',
  'Fuelling',
  'Supplements',
  'Power and plyometrics',
  'Pelvic floor',
  'Other',
];

/**
 * What the build spec names as sources, as starting points. Names only: the full
 * reference — authors, year, journal, link — is hers to add, so nothing here is a guessed
 * citation.
 */
const FROM_THE_SPEC: { topic: string; title: string }[] = [
  { topic: 'Freshness and load', title: 'Foster — session RPE (RPE × minutes)' },
  {
    topic: 'Freshness and load',
    title:
      'Acute:chronic workload ratio — methodological critique (ratio artefacts, mathematical coupling)',
  },
  { topic: 'HRV', title: 'Laborde, Altini, Plews — HRV-guided training decision tree' },
  { topic: 'Fuelling', title: 'Periodised Nutrition booklet (v4)' },
  {
    topic: 'Fuelling',
    title: 'Consensus reference ranges: carbohydrate and protein around exercise',
  },
  { topic: 'Supplements', title: 'Supplements — suggestions & evidence strength' },
];

const field = 'w-full rounded-[10px] px-2.5 py-1.5 text-sm outline-none';
const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

type Draft = Omit<EvidenceRef, 'id'> & { id?: string };
const blank = (topic = TOPICS[0]!): Draft => ({
  topic,
  title: '',
  authors: null,
  year: null,
  source: null,
  url: null,
  note: null,
});

export function EvidenceList({ refs }: { refs: EvidenceRef[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Could not save.');
      else {
        setDraft(null);
        router.refresh();
      }
    });

  const topics = [...new Set([...TOPICS, ...refs.map((r) => r.topic)])];
  const suggestions = FROM_THE_SPEC.filter((s) => !refs.some((r) => r.title === s.title));

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setDraft(blank())}
        className="display-face rounded-full px-4 py-2 text-sm font-semibold text-white"
        style={{ background: palette.brand[600] }}
      >
        Add a reference
      </button>

      {draft && (
        <Card title={draft.id ? 'Edit reference' : 'New reference'}>
          <div className="grid gap-2">
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
              <select
                value={draft.topic}
                onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
                className={field}
                style={fieldStyle}
                aria-label="Topic"
              >
                {topics.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Title"
                className={field}
                style={fieldStyle}
                aria-label="Title"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr_2fr]">
              <input
                value={draft.authors ?? ''}
                onChange={(e) => setDraft({ ...draft, authors: e.target.value })}
                placeholder="Authors"
                className={field}
                style={fieldStyle}
                aria-label="Authors"
              />
              <input
                value={draft.year ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, year: e.target.value ? Number(e.target.value) : null })
                }
                placeholder="Year"
                inputMode="numeric"
                className={field}
                style={fieldStyle}
                aria-label="Year"
              />
              <input
                value={draft.source ?? ''}
                onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                placeholder="Journal or source"
                className={field}
                style={fieldStyle}
                aria-label="Source"
              />
            </div>
            <input
              value={draft.url ?? ''}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              placeholder="Link (DOI or URL)"
              className={field}
              style={fieldStyle}
              aria-label="Link"
            />
            <input
              value={draft.note ?? ''}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="What it supports in Vela (optional)"
              className={field}
              style={fieldStyle}
              aria-label="Note"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => saveEvidenceAction(draft))}
                className="display-face rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: palette.brand[600] }}
              >
                {pending ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-full px-4 py-2 text-sm"
                style={{ background: 'var(--ghost)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}
      {error && (
        <p className="text-sm" style={{ color: palette.status.critical }}>
          {error}
        </p>
      )}

      {topics
        .filter((t) => refs.some((r) => r.topic === t))
        .map((t) => (
          <Card key={t} title={t}>
            <ul className="divide-y text-sm" style={{ borderColor: 'var(--border)' }}>
              {refs
                .filter((r) => r.topic === t)
                .map((r) => (
                  <li key={r.id} className="flex items-start gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">
                        {r.url ? (
                          <a
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {r.title}
                          </a>
                        ) : (
                          r.title
                        )}
                      </div>
                      <div className="text-xs ink-2">
                        {[r.authors, r.year, r.source].filter(Boolean).join(' · ') ||
                          'Add the full reference'}
                      </div>
                      {r.note && <div className="mt-0.5 text-xs ink-3">{r.note}</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setDraft({ ...r })}
                      className="text-xs underline ink-2"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => deleteEvidenceAction(r.id))}
                      className="text-xs underline ink-2 disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </li>
                ))}
            </ul>
          </Card>
        ))}

      {suggestions.length > 0 && (
        <Card title="Named in your build spec">
          <p className="mb-2 text-xs ink-2">
            Sources the spec refers to, by name only. Add one, then fill in the full reference.
          </p>
          <ul className="space-y-1.5 text-sm">
            {suggestions.map((s) => (
              <li key={s.title} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-xs ink-3">{s.topic}</span>
                <span className="min-w-0 flex-1">{s.title}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() => saveEvidenceAction({ ...blank(s.topic), title: s.title }))
                  }
                  className="text-xs underline ink-2 disabled:opacity-40"
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
