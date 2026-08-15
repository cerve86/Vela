import type { ReactNode } from 'react';
import { Circle, CircleCheck, OctagonAlert, TriangleAlert } from 'lucide-react';
import { palette } from '@vela/shared/tokens';

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`surface rounded-[20px] p-5 ${className ?? ''}`}
      style={{ background: 'var(--surface)' }}
    >
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between">
          {title && <h2 className="display-face text-[15px] font-semibold">{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  unit,
  delta,
  deltaGood,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  /** Whether the delta direction is desirable — colour never carries this alone, the arrow does */
  deltaGood?: boolean;
  hint?: string;
}) {
  return (
    <div className="surface rounded-[20px] p-5" style={{ background: 'var(--surface)' }}>
      <div className="text-xs ink-2">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="display-face text-[26px] font-bold">{value}</span>
        {unit && <span className="text-sm ink-3">{unit}</span>}
      </div>
      {delta && (
        <div
          className="tnum mt-1 text-xs font-medium"
          style={{ color: deltaGood ? 'var(--success-text)' : 'var(--ink-secondary)' }}
        >
          {delta}
        </div>
      )}
      {hint && <div className="mt-1 text-xs ink-3">{hint}</div>}
    </div>
  );
}

/** Status is never colour alone — every pill carries an icon and a word. */
export function StatusPill({
  tone,
  children,
}: {
  tone: 'good' | 'warning' | 'serious' | 'critical' | 'neutral';
  children: ReactNode;
}) {
  const map = {
    good: { color: palette.status.good, Icon: CircleCheck },
    warning: { color: palette.status.warning, Icon: TriangleAlert },
    serious: { color: palette.status.serious, Icon: TriangleAlert },
    critical: { color: palette.status.critical, Icon: OctagonAlert },
    neutral: { color: 'var(--ink-muted)', Icon: Circle },
  } as const;
  const { color, Icon } = map[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: 'var(--ghost)', color: 'var(--ink-primary)' }}
    >
      <Icon size={12} strokeWidth={2.5} style={{ color }} aria-hidden />
      {children}
    </span>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        background: palette.brand[100],
        color: palette.brand[800],
        fontSize: size * 0.36,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function PainDot({ score }: { score: number | null }) {
  if (score === null) return <span className="ink-3 text-xs">—</span>;
  const color =
    score <= 2
      ? palette.status.good
      : score <= 5
        ? palette.status.warning
        : score <= 7
          ? palette.status.serious
          : palette.status.critical;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="tnum text-sm">{score}/10</span>
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="surface rounded-[20px] p-10 text-center" style={{ background: 'var(--surface)' }}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm ink-2">{body}</p>
    </div>
  );
}
