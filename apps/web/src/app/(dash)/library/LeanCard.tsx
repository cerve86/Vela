'use client';

import { useState } from 'react';
import { GATE_LABEL, type LibraryExercise } from '@vela/api';
import { palette } from '@vela/shared/tokens';

/**
 * One movement as a lean card: name and video, one cue, one watch-for, the dose with its
 * load rule, and the L1–L4 ladder. The "why", the regression and the coach's notes open
 * behind a tap, so the card stays glanceable. Gates show as markers on the card itself.
 */
export function LeanCard({
  exercise: e,
  names,
  priority,
  picked,
  onPick,
  onEdit,
}: {
  exercise: LibraryExercise;
  /** id → name, to spell out a circuit's movements. */
  names: Map<string, string>;
  priority?: 'priority' | 'yes' | null;
  picked?: boolean;
  onPick?: () => void;
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const cue = e.cues[0] ?? null;
  return (
    <article
      className="flex flex-col rounded-[16px] p-3.5"
      style={{
        background: 'var(--surface)',
        border: `1px solid ${priority === 'priority' ? palette.brand[600] : 'var(--border)'}`,
      }}
    >
      <div className="flex items-start gap-2">
        {onPick && (
          <input
            type="checkbox"
            checked={picked ?? false}
            onChange={onPick}
            aria-label={`Add ${e.name} to a block`}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer"
            style={{ accentColor: palette.brand[600] }}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {e.code && (
              <span
                className="tnum rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ink-2"
                style={{ background: 'var(--ghost)' }}
              >
                {e.code}
              </span>
            )}
            {e.kind === 'block' && (
              <span
                className="rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold text-white"
                style={{ background: palette.brand[600] }}
              >
                Circuit
              </span>
            )}
            {e.movementType && <span className="text-[11px] ink-3">{e.movementType}</span>}
            {priority === 'priority' && (
              <span className="text-[10.5px] font-semibold" style={{ color: palette.brand[600] }}>
                PRIORITY
              </span>
            )}
          </div>
          <h3 className="mt-1 text-[14px] font-semibold leading-snug">{e.name}</h3>
        </div>
        {e.videoUrl && (
          <a
            href={e.videoUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ background: 'var(--ghost)' }}
            title={e.videoSource === 'own' ? 'Her own clip' : 'Stock clip'}
          >
            ▶ {e.videoSource === 'own' ? 'Her clip' : 'Video'}
          </a>
        )}
      </div>

      {e.gates.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {e.gates.map((g) => (
            <span
              key={g}
              className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
              style={{ background: 'rgba(196,24,74,0.10)', color: palette.status.critical }}
            >
              {GATE_LABEL[g]}
            </span>
          ))}
        </div>
      )}

      {e.kind === 'block' ? (
        <ul className="mt-2 space-y-0.5 text-[12.5px]">
          {e.blockItems.map((b, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">{names.get(b.exerciseId) ?? 'A movement'}</span>
              {b.dose && <span className="shrink-0 tnum ink-2">{b.dose}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <>
          {cue && <p className="mt-2 text-[12.5px]">“{cue}”</p>}
          {e.watchFor && (
            <p className="mt-1 text-[12px] ink-2">
              <b className="font-semibold">Watch for:</b> {e.watchFor}
            </p>
          )}
          {(e.dose || e.loadRule) && (
            <p className="mt-2 text-[12.5px]">
              {e.dose && <span className="tnum font-semibold">{e.dose}</span>}
              {e.dose && e.loadRule && ' · '}
              {e.loadRule && <span className="ink-2">{e.loadRule}</span>}
            </p>
          )}
          {e.ladder.length > 0 && (
            <ol className="mt-2 grid grid-cols-2 gap-1">
              {e.ladder.map((l, i) => (
                <li
                  key={i}
                  className="rounded-[8px] px-1.5 py-1 text-[10.5px] leading-tight"
                  style={{ background: 'var(--ghost)' }}
                  title={l}
                >
                  <b className="block text-[10px] ink-3">L{i + 1}</b>
                  <span>{l}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {(e.why || e.regression || e.phases.length > 0) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 self-start text-[11.5px] underline ink-2"
          aria-expanded={open}
        >
          {open ? 'Less' : 'Why this one'}
        </button>
      )}
      {open && (
        <div className="mt-1.5 space-y-1 text-[12px] ink-2">
          {e.why && <p>{e.why}</p>}
          {e.regression && (
            <p>
              <b className="font-semibold">Regression:</b> {e.regression}
            </p>
          )}
          {e.phases.length > 0 && (
            <p>
              <b className="font-semibold">Phases:</b> {e.phases.join(', ')}
            </p>
          )}
        </div>
      )}

      {onEdit && (
        <div className="mt-auto pt-2 text-right">
          <button type="button" onClick={onEdit} className="text-[11.5px] underline ink-2">
            Edit
          </button>
        </div>
      )}
    </article>
  );
}
