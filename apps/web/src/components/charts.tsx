'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Small hand-rolled SVG chart kit.
 *
 * Hand-rolled rather than pulled from a library so the mark specs hold exactly:
 * 2px lines, 8px markers, 4px rounded bar ends anchored to the baseline, a 2px
 * surface gap between adjacent bars, recessive grid, and text in ink tokens rather
 * than series colors.
 *
 * Deliberately NO dual-axis support. Two measures of different scale render as
 * stacked panels sharing one x-axis — see TimeSeriesPanels.
 */

export type Point = { x: string; y: number | null };

export type Series = {
  id: string;
  label: string;
  /** CSS var name, e.g. 'var(--series-1)' — colour follows the entity, never its rank */
  color: string;
  kind: 'line' | 'bar' | 'area';
  points: Point[];
  /**
   * For measures sampled only on some days (pain is recorded per session, not daily):
   * join consecutive readings across the empty days instead of drawing disconnected
   * stubs, and mark each actual reading so the sampling stays visible.
   */
  connectGaps?: boolean;
};

/**
 * Declarative rather than a callback: panels are built in Server Components, and a
 * function cannot cross the server/client boundary. The client resolves the spec.
 */
export type NumberFormat =
  | { style: 'fixed'; decimals: number }
  | { style: 'thousands' }
  | { style: 'compactK' };

export function formatValue(n: number, fmt?: NumberFormat): string {
  if (!fmt) return String(Math.round(n));
  switch (fmt.style) {
    case 'fixed':
      return n.toFixed(fmt.decimals);
    case 'thousands':
      return Math.round(n).toLocaleString('en-GB');
    case 'compactK':
      return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
  }
}

export type Panel = {
  id: string;
  label: string;
  series: Series[];
  format?: NumberFormat;
  /** Force a y domain, e.g. [0, 10] for the pain scale */
  domain?: [number, number];
  height?: number;
};

function useMeasure<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

const PAD = { top: 12, right: 16, bottom: 22, left: 44 };

/**
 * `anchorZero` is set whenever the panel contains bars: the length of a bar encodes its
 * value, so a truncated baseline makes a 5% difference look like a 300% one. Lines may
 * float, bars may not.
 */
function niceDomain(
  values: number[],
  forced?: [number, number],
  anchorZero = false,
): [number, number] {
  if (forced) return forced;
  if (values.length === 0) return [0, 1];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const lo = anchorZero ? Math.min(0, min) : min - span * 0.12;
  return [lo, max + span * 0.12];
}

/** Rounded only at the data end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, Math.max(h, 0));
  if (h <= 0) return '';
  return [
    `M${x},${y + h}`,
    `L${x},${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `L${x + w - rr},${y}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
}

export function TimeSeriesPanels({
  panels,
  xLabels,
  className,
}: {
  panels: Panel[];
  /** Full ordered x domain shared by every panel */
  xLabels: string[];
  className?: string;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const innerW = Math.max(width - PAD.left - PAD.right, 10);
  const xAt = useCallback(
    (i: number) => PAD.left + (xLabels.length <= 1 ? innerW / 2 : (i / (xLabels.length - 1)) * innerW),
    [innerW, xLabels.length],
  );

  const onMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const rel = e.clientX - rect.left - PAD.left;
      const i = Math.round((rel / innerW) * (xLabels.length - 1));
      setHoverIdx(Math.max(0, Math.min(xLabels.length - 1, i)));
    },
    [innerW, xLabels.length],
  );

  const tickIdx = useMemo(() => {
    const n = Math.min(6, xLabels.length);
    if (n <= 1) return [0];
    return Array.from({ length: n }, (_, k) => Math.round((k / (n - 1)) * (xLabels.length - 1)));
  }, [xLabels.length]);

  return (
    <div
      ref={ref}
      className={`relative ${className ?? ''}`}
      onMouseMove={onMove}
      onMouseLeave={() => setHoverIdx(null)}
    >
      {panels.map((panel) => {
        const height = panel.height ?? 160;
        const innerH = height - PAD.top - PAD.bottom;
        const all = panel.series.flatMap((s) =>
          s.points.map((p) => p.y).filter((v): v is number => v !== null),
        );
        const hasBars = panel.series.some((s) => s.kind === 'bar');
        const [lo, hi] = niceDomain(all, panel.domain, hasBars);
        const yAt = (v: number) => PAD.top + innerH - ((v - lo) / (hi - lo)) * innerH;
        const fmt = (n: number) => formatValue(n, panel.format);
        const ticks = [lo, lo + (hi - lo) / 2, hi];

        return (
          <div key={panel.id} className="mb-1">
            <div className="flex items-baseline justify-between px-1">
              <span className="text-xs font-medium ink-2">{panel.label}</span>
              {panel.series.length >= 2 && (
                <div className="flex gap-3">
                  {panel.series.map((s) => (
                    <span key={s.id} className="flex items-center gap-1.5 text-xs ink-3">
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: s.color }}
                      />
                      {s.label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {width > 0 && (
              <svg width={width} height={height} role="img" aria-label={panel.label}>
                {/* recessive gridlines */}
                {ticks.map((t, i) => (
                  <g key={i}>
                    <line
                      x1={PAD.left}
                      x2={width - PAD.right}
                      y1={yAt(t)}
                      y2={yAt(t)}
                      stroke="var(--grid)"
                      strokeWidth={1}
                    />
                    <text
                      x={PAD.left - 8}
                      y={yAt(t) + 4}
                      textAnchor="end"
                      fontSize={10}
                      fill="var(--ink-muted)"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {fmt(t)}
                    </text>
                  </g>
                ))}

                {panel.series.map((s) => {
                  if (s.kind === 'bar') {
                    const slot = innerW / Math.max(s.points.length, 1);
                    const bw = Math.max(slot - 2, 1); // 2px surface gap between bars
                    const base = yAt(Math.max(lo, 0));
                    return (
                      <g key={s.id}>
                        {s.points.map((p, i) =>
                          p.y === null ? null : (
                            <path
                              key={i}
                              d={barPath(xAt(i) - bw / 2, yAt(p.y), bw, base - yAt(p.y), 4)}
                              fill={s.color}
                              opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.45}
                            />
                          ),
                        )}
                      </g>
                    );
                  }

                  const segs: string[] = [];
                  let open = false;
                  s.points.forEach((p, i) => {
                    if (p.y === null) {
                      // A sparse measure keeps its line running across the empty days;
                      // a dense one breaks, because a gap there means data is missing.
                      if (!s.connectGaps) open = false;
                      return;
                    }
                    segs.push(`${open ? 'L' : 'M'}${xAt(i)},${yAt(p.y)}`);
                    open = true;
                  });
                  const d = segs.join(' ');

                  // Both are -1 when every reading is null, which is an ordinary state:
                  // a pain series before her first logged session, a weight series for a
                  // client who has not weighed herself. Deriving `last` by arithmetic on
                  // findIndex's -1 produced `points.length` — an index one past the end,
                  // whose `?.y` is undefined rather than null, so the marker guard below
                  // let it through and then dereferenced nothing.
                  const first = s.points.findIndex((p) => p.y !== null);
                  const lastFromEnd = [...s.points].reverse().findIndex((p) => p.y !== null);
                  const last = lastFromEnd === -1 ? -1 : s.points.length - 1 - lastFromEnd;

                  return (
                    <g key={s.id}>
                      {s.kind === 'area' && d && first >= 0 && (
                        <path
                          d={`${d} L${xAt(last)},${yAt(lo)} L${xAt(first)},${yAt(lo)} Z`}
                          fill={s.color}
                          opacity={0.1}
                        />
                      )}
                      <path
                        d={d}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Mark every reading only when they are sparse enough to stay legible —
                          a daily series would otherwise become 56 dots of noise. */}
                      {s.connectGaps &&
                        s.points.filter((p) => p.y !== null).length / Math.max(s.points.length, 1) <
                          0.5 &&
                        s.points.map((p, i) =>
                          p.y === null ? null : (
                            <circle
                              key={i}
                              cx={xAt(i)}
                              cy={yAt(p.y)}
                              r={3.5}
                              fill={s.color}
                              stroke="var(--surface)"
                              strokeWidth={2}
                            />
                          ),
                        )}
                      {/* 8px marker on the latest value, ringed in the surface colour */}
                      {last >= 0 && s.points[last]?.y != null && (
                        <circle
                          cx={xAt(last)}
                          cy={yAt(s.points[last]!.y as number)}
                          r={4}
                          fill={s.color}
                          stroke="var(--surface)"
                          strokeWidth={2}
                        />
                      )}
                    </g>
                  );
                })}

                {/* crosshair */}
                {hoverIdx !== null && (
                  <g pointerEvents="none">
                    <line
                      x1={xAt(hoverIdx)}
                      x2={xAt(hoverIdx)}
                      y1={PAD.top}
                      y2={PAD.top + innerH}
                      stroke="var(--axis)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    {panel.series.map((s) => {
                      const p = s.points[hoverIdx];
                      if (!p || p.y === null) return null;
                      return (
                        <circle
                          key={s.id}
                          cx={xAt(hoverIdx)}
                          cy={yAt(p.y)}
                          r={4.5}
                          fill={s.color}
                          stroke="var(--surface)"
                          strokeWidth={2}
                        />
                      );
                    })}
                  </g>
                )}

                <line
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={PAD.top + innerH}
                  y2={PAD.top + innerH}
                  stroke="var(--axis)"
                  strokeWidth={1}
                />

                {tickIdx.map((i) => (
                  <text
                    key={i}
                    x={xAt(i)}
                    y={height - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fill="var(--ink-muted)"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {shortDate(xLabels[i] ?? '')}
                  </text>
                ))}
              </svg>
            )}
          </div>
        );
      })}

      {hoverIdx !== null && width > 0 && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-lg px-2.5 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(Math.max(xAt(hoverIdx) - 60, 0), Math.max(width - 150, 0)),
            background: 'var(--raised)',
            border: '1px solid var(--border)',
            minWidth: 130,
          }}
        >
          <div className="mb-1 font-medium">{shortDate(xLabels[hoverIdx] ?? '')}</div>
          {panels.flatMap((panel) =>
            panel.series.map((s) => {
              const p = s.points[hoverIdx];
              if (!p || p.y === null) return null;
              return (
                <div key={`${panel.id}-${s.id}`} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 ink-2">
                    <span
                      aria-hidden
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: s.color }}
                    />
                    {s.label}
                  </span>
                  <span className="tnum font-medium">{formatValue(p.y, panel.format)}</span>
                </div>
              );
            }),
          )}
        </div>
      )}
    </div>
  );
}

/** Compact inline trend line for table rows — no axes, no interaction. */
export function Sparkline({
  values,
  color = 'var(--series-1)',
  width = 72,
  height = 24,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * (width - 4) + 2;
      const y = height - 3 - ((v - min) / span) * (height - 6);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Horizontal progress meter used for adherence and macro rings' flat cousin. */
export function Meter({
  value,
  max = 1,
  color,
  label,
  valueLabel,
}: {
  value: number;
  max?: number;
  color: string;
  label: string;
  valueLabel: string;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs ink-2">{label}</span>
        <span className="tnum text-xs font-medium">{valueLabel}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: 'var(--ghost)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
    </div>
  );
}
