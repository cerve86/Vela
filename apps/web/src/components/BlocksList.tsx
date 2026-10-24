import Link from 'next/link';
import type { Block } from '@vela/api';

const short = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });

/** Where a block stands, in a word: running, ahead, finished, replaced or taken off. */
function standing(b: Block, today: string): { label: string; tone: string } {
  if (b.status === 'replaced') return { label: 'Replaced', tone: 'var(--ink-secondary)' };
  if (b.status === 'cancelled') return { label: 'Taken off', tone: 'var(--ink-secondary)' };
  if (b.status === 'completed' || today > b.endDate)
    return { label: 'Finished', tone: 'var(--ink-secondary)' };
  if (today < b.firstDay) return { label: 'Starts soon', tone: 'var(--ink-primary)' };
  return { label: 'Running', tone: 'var(--ink-primary)' };
}

/**
 * Every block a client has had, newest first. Starting a new block never hides an old
 * one: what she did under it, and how much was moved, stays readable here.
 */
export function BlocksList({ blocks, today }: { blocks: Block[]; today: string }) {
  if (blocks.length === 0)
    return <p className="text-sm ink-2">No programme has been assigned yet.</p>;
  return (
    <ul className="grid gap-1.5">
      {blocks.map((b) => {
        const st = standing(b, today);
        return (
          <li
            key={b.assignmentId}
            className="flex items-center gap-3 rounded-[12px] px-3 py-2"
            style={{ background: 'var(--ghost)' }}
          >
            <div className="min-w-0 flex-1">
              <Link
                href={`/programs/${b.programId}`}
                className="block truncate text-[13px] font-semibold hover:underline"
              >
                {b.programName}
              </Link>
              <span className="block text-[11.5px] ink-2 tnum">
                {short(b.firstDay)} – {short(b.endDate)}
                {b.programKind === 'structured' && ` · ${b.done} of ${b.planned} done`}
                {b.moved > 0 && ` · ${b.moved} moved`}
              </span>
            </div>
            <span className="shrink-0 text-[11px] font-semibold" style={{ color: st.tone }}>
              {st.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
