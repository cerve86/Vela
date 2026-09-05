import Link from 'next/link';
import type { ReactNode } from 'react';
import { MiniTrend, type Point } from './charts';

/**
 * A reading: one number a clinician acts on, with the context that makes it safe to.
 *
 * The idiom is the parameter card — label, value and unit, a bar showing where the value
 * sits or how much of the target it covers, a caption in words, and where there is a
 * history, a card-sized trend. Colour never carries the meaning alone: the caption always
 * says the word the colour means, and an absence says why it is absent.
 *
 * Two sizes. `compact` is the tile inside a roster card; `full` is a card of its own on a
 * client's page, with the trend and a link into the tab that explains it.
 */
export function Reading({
  label,
  value,
  unit,
  bar,
  caption,
  captionColor,
  trend,
  href,
  linkLabel = 'See in detail',
  size = 'compact',
}: {
  label: string;
  value: string;
  unit?: string;
  bar?: ReactNode;
  caption: string;
  captionColor?: string;
  trend?: { points: Point[]; color: string; domain?: [number, number] };
  href?: string;
  linkLabel?: string;
  size?: 'compact' | 'full';
}) {
  if (size === 'compact') {
    return (
      <div className="rounded-[14px] px-3 py-2.5" style={{ background: 'var(--ghost)' }}>
        <div className="text-[11px] ink-2">{label}</div>
        <div className="mt-0.5 flex items-baseline gap-1">
          <span className="display-face tnum text-[20px] font-bold leading-tight">{value}</span>
          {unit && <span className="text-[11px] ink-3">{unit}</span>}
        </div>
        <div className="mt-2 h-1.5">{bar}</div>
        <div
          className="mt-1.5 truncate text-[11px]"
          style={{ color: captionColor ?? 'var(--ink-muted)' }}
        >
          {caption}
        </div>
      </div>
    );
  }

  const hasTrend = trend !== undefined && trend.points.some((p) => p.y !== null);
  return (
    <div
      className="surface flex flex-col rounded-[20px] p-4"
      style={{ background: 'var(--surface)' }}
    >
      <div className="text-xs ink-2">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="display-face tnum text-[24px] font-bold leading-tight">{value}</span>
        {unit && <span className="text-xs ink-3">{unit}</span>}
      </div>
      {bar && <div className="mt-3">{bar}</div>}
      <div className="mt-1.5 text-[11px]" style={{ color: captionColor ?? 'var(--ink-muted)' }}>
        {caption}
      </div>
      <div className="mt-2 flex-1">
        {hasTrend ? (
          <MiniTrend points={trend.points} color={trend.color} domain={trend.domain} height={48} />
        ) : (
          <div className="h-12" />
        )}
      </div>
      {href && (
        <div className="mt-2 border-t pt-2 text-center" style={{ borderColor: 'var(--border)' }}>
          <Link href={href} className="text-[11px] ink-3 hover:underline">
            {linkLabel}
          </Link>
        </div>
      )}
    </div>
  );
}

/** A filled proportion of the track: how much of the target is covered. */
export function FillBar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: 'var(--border)' }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`,
          background: color,
        }}
      />
    </div>
  );
}

/** A marker on a scale: where the reading sits, not how much of something there is. */
export function ScaleBar({ ratio, color }: { ratio: number; color: string }) {
  const left = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <div className="relative h-1.5 w-full rounded-full" style={{ background: 'var(--border)' }}>
      <span
        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${left}%`, background: color, boxShadow: '0 0 0 2px var(--surface)' }}
      />
    </div>
  );
}

/** A section of readings on a client's page: a heading and a four-up grid. */
export function ReadingGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between">
        <h2 className="display-face text-[15px] font-semibold">{title}</h2>
        {hint && <span className="text-xs ink-3">{hint}</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}
