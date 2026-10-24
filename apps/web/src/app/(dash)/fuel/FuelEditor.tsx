'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FuelCard, FuelLines } from '@vela/shared';
import { palette } from '@vela/shared/tokens';
import { Card, StatusPill } from '@/components/ui';
import { resetFuelCardAction, saveFuelCardAction } from './actions';

const field = 'w-full rounded-[10px] px-2.5 py-1.5 text-sm outline-none';
const fieldStyle = { background: 'var(--ghost)', color: 'var(--ink-primary)' };

const SECTIONS: { kind: FuelCard['kind']; title: string; hint: string }[] = [
  {
    kind: 'session',
    title: 'Session cards',
    hint: 'Before, during and after, chosen by the session.',
  },
  {
    kind: 'cue',
    title: 'Cues',
    hint: 'The plate reminder on easy days; heat and pre-dawn on long runs.',
  },
  {
    kind: 'supplement',
    title: 'Supplements',
    hint: 'Name, one plain cue, an evidence pill and a one-word context. Never a dose — doses stay with you.',
  },
];

export function FuelEditor({ cards, own }: { cards: FuelCard[]; own: string[] }) {
  return (
    <div className="space-y-6">
      {SECTIONS.map((s) => (
        <section key={s.kind}>
          <h2 className="display-face text-[17px] font-bold">{s.title}</h2>
          <p className="mb-2 text-xs ink-2">{s.hint}</p>
          <div className="grid gap-3">
            {cards
              .filter((c) => c.kind === s.kind)
              .map((c) => (
                <CardEditor key={c.key} card={c} isMine={own.includes(c.key)} />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function CardEditor({ card, isMine }: { card: FuelCard; isMine: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<FuelCard>(card);
  const [error, setError] = useState<string | null>(null);
  const lines: (keyof FuelLines)[] =
    card.kind === 'session' ? ['before', 'during', 'after'] : ['cue'];

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Could not save.');
      else {
        setOpen(false);
        router.refresh();
      }
    });

  const setLine = (which: 'face' | 'detail', k: keyof FuelLines, v: string) =>
    setDraft((d) => ({ ...d, [which]: { ...d[which], [k]: v } }));

  return (
    <Card
      title={card.title}
      action={
        <span className="flex items-center gap-2">
          {card.kind === 'supplement' && card.tag && (
            <span className="text-xs ink-3">{card.tag}</span>
          )}
          {card.evidence && (
            <StatusPill tone={card.evidence === 'strong' ? 'good' : 'neutral'}>
              {card.evidence === 'strong' ? 'Strong evidence' : 'Moderate / emerging'}
            </StatusPill>
          )}
          <StatusPill tone={card.published ? 'good' : 'warning'}>
            {card.published ? 'Shown to clients' : 'Draft'}
          </StatusPill>
          {!isMine && <span className="text-xs ink-3">Vela default</span>}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-xs underline ink-2"
          >
            {open ? 'Close' : 'Edit'}
          </button>
        </span>
      }
    >
      {!open ? (
        <ul className="space-y-1 text-sm">
          {lines.map((k) => (
            <li key={k}>
              {lines.length > 1 && <b className="mr-1 font-semibold capitalize">{k}:</b>}
              {card.face[k] ?? <span className="ink-3">—</span>}
              {card.detail[k] && <span className="ml-1 text-xs ink-3">· {card.detail[k]}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="grid gap-2.5">
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className={field}
            style={fieldStyle}
            aria-label="Title"
          />
          {lines.map((k) => (
            <div key={k} className="grid gap-1.5 sm:grid-cols-2">
              <div>
                <label className="mb-0.5 block text-[11px] font-medium ink-2 capitalize">
                  {lines.length > 1 ? `${k} — on the card` : 'On the card'}
                </label>
                <input
                  value={draft.face[k] ?? ''}
                  onChange={(e) => setLine('face', k, e.target.value)}
                  className={field}
                  style={fieldStyle}
                  aria-label={`${k} on the card`}
                />
              </div>
              {card.kind !== 'supplement' && (
                <div>
                  <label className="mb-0.5 block text-[11px] font-medium ink-2">
                    Amounts, behind the tap
                  </label>
                  <input
                    value={draft.detail[k] ?? ''}
                    onChange={(e) => setLine('detail', k, e.target.value)}
                    className={field}
                    style={fieldStyle}
                    aria-label={`${k} amounts`}
                  />
                </div>
              )}
            </div>
          ))}
          {card.kind !== 'supplement' && (
            <div>
              <label className="mb-0.5 block text-[11px] font-medium ink-2">
                Why, behind the tap
              </label>
              <input
                value={draft.why ?? ''}
                onChange={(e) => setDraft({ ...draft, why: e.target.value })}
                className={field}
                style={fieldStyle}
                aria-label="Why"
              />
            </div>
          )}
          {card.kind === 'supplement' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={draft.tag ?? ''}
                onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
                placeholder="Context, e.g. Test first"
                className={field}
                style={fieldStyle}
                aria-label="Context tag"
              />
              <select
                value={draft.evidence ?? ''}
                onChange={(e) =>
                  setDraft({ ...draft, evidence: (e.target.value || null) as FuelCard['evidence'] })
                }
                className={field}
                style={fieldStyle}
                aria-label="Evidence"
              >
                <option value="">No evidence pill</option>
                <option value="strong">Strong (green)</option>
                <option value="moderate">Moderate / emerging (blue)</option>
              </select>
            </div>
          )}
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.published}
              onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
              style={{ accentColor: palette.brand[600] }}
            />
            Show to clients
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => saveFuelCardAction(draft))}
              className="display-face rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: palette.brand[600] }}
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            {isMine && (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => resetFuelCardAction(card.key))}
                className="rounded-full px-4 py-2 text-sm"
                style={{ background: 'var(--ghost)' }}
              >
                Back to Vela&rsquo;s wording
              </button>
            )}
          </div>
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs" style={{ color: palette.status.critical }}>
          {error}
        </p>
      )}
    </Card>
  );
}
