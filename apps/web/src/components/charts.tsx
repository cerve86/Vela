'use client';

import { useId, useMemo, useSyncExternalStore, type ReactElement } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';

/**
 * The chart kit, on Recharts, wearing BoardUI's idiom.
 *
 * The public surface — `TimeSeriesPanels`, `Panel`, `Series`, `Point`, `Meter`, `Sparkline`,
 * `formatValue` — is unchanged from the hand-rolled version, so no page moved. What changed
 * is the drawing: no axis lines and no tick lines, `preserveStartEnd` ticks, monotone curves,
 * a gradient wash under areas, a dashed `4 4` cursor, and a halo ring on the active point.
 * That is the look of BoardUI's chart cards, whose free set does not include a line chart
 * and whose paid set would have brought a second design system into the portal; this is the
 * same rendering engine those cards use, driven by Vela's own tokens instead.
 *
 * The rules the old kit enforced by hand are kept, because a library does not enforce them
 * for you: one axis per panel and never two scales; bars anchored to zero; a null point is
 * a gap unless the series is sparse by nature; text in ink tokens, never in a series
 * colour; a legend for two or more series, none for one; an 8px marker on the latest value
 * ringed in the surface colour. One deliberate divergence from BoardUI's cards is kept in
 * plain sight: a recessive horizontal grid. Their revenue widget can go without gridlines;
 * a pain scale from 0 to 10 cannot, because the reader has to place a 6.
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
  /**
   * A reference, not a measurement — a target, a plan, last period's figure. Drawn dashed
   * with no markers, in whatever neutral the caller passes as `color`, so it never competes
   * with the data for a categorical slot and never needs to separate from one under colour
   * vision deficiency. BoardUI draws its "last year" line exactly this way.
   */
  dashed?: boolean;
};

/**
 * Declarative rather than a callback: panels are built in Server Components, and a
 * function cannot cross the server/client boundary. The client resolves the spec.
 */
export type NumberFormat =
  { style: 'fixed'; decimals: number } | { style: 'thousands' } | { style: 'compactK' };

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

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`;
}

/** The data key one series occupies in the shared row set. Panels can reuse series ids. */
const keyOf = (panelId: string, seriesId: string) => `${panelId}/${seriesId}`;

type Row = Record<string, string | number | null>;

/** Ink for the axis text — a text token, never a series colour. */
const TICK = { fontSize: 11, fill: 'var(--ink-muted)' } as const;

/**
 * BoardUI's active marker: a soft halo under a ringed core. Recharts clones this with the
 * point's `cx`/`cy`; the colour is passed in rather than read off the line, so a dashed
 * reference can decline a marker entirely.
 */
function ActiveDot({ cx, cy, color }: { cx?: number; cy?: number; color: string }) {
  if (cx === undefined || cy === undefined) return null;
  return (
    <g pointerEvents="none">
      <circle cx={cx} cy={cy} r={7} fill={color} opacity={0.25} />
      <circle cx={cx} cy={cy} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
    </g>
  );
}

/**
 * Which points get a resting marker.
 *
 * Always the latest reading, ringed in the surface colour so it survives crossing
 * anything. Every reading as well when the series is sparse — a pain score logged per
 * session, not per day — because then the dots are the sampling made visible. A dense
 * daily series gets no dots at all: fifty-six markers on a weight line is noise.
 */
function dotRenderer(
  s: Series,
): (props: { cx?: number; cy?: number; index?: number }) => ReactElement {
  if (s.dashed) {
    return function NoDot() {
      return <g />;
    };
  }

  const present = s.points.map((p) => p.y !== null);
  const lastIdx = present.lastIndexOf(true);
  const sparse =
    s.connectGaps === true && present.filter(Boolean).length / Math.max(present.length, 1) < 0.5;

  return function Dot({ cx, cy, index }) {
    if (cx === undefined || cy === undefined || index === undefined || !present[index])
      return <g />;
    if (index === lastIdx) {
      return (
        <circle
          key={index}
          cx={cx}
          cy={cy}
          r={4}
          fill={s.color}
          stroke="var(--surface)"
          strokeWidth={2}
        />
      );
    }
    if (sparse) {
      return (
        <circle
          key={index}
          cx={cx}
          cy={cy}
          r={3.5}
          fill={s.color}
          stroke="var(--surface)"
          strokeWidth={2}
        />
      );
    }
    return <g />;
  };
}

/**
 * Whether the reader has asked for less motion.
 *
 * Recharts reveals a line by animating its dash over 450ms — BoardUI's cards do the same
 * and it reads well — but it is motion nobody asked for, and the OS setting that asks for
 * less of it is honoured nowhere else on this site yet. It is honoured here.
 *
 * An external store rather than state set from an effect: the media query is the source
 * of truth and React only needs to subscribe to it. The server snapshot is "animate", so
 * the first client paint matches the markup the server sent and hydration has nothing to
 * reconcile; a reader who has asked for less motion gets it from the first client render.
 */
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

const readReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;
const readReducedMotionOnServer = () => false;

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, readReducedMotion, readReducedMotionOnServer);
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
  // One `syncId` across the stack: hovering any panel crosshairs all of them, which is
  // the whole reason they share an x-axis.
  const syncId = useId();
  const gradientBase = useId();
  const animate = !usePrefersReducedMotion();

  const rows = useMemo<Row[]>(
    () =>
      xLabels.map((x, i) => {
        const r: Row = { x };
        for (const p of panels)
          for (const s of p.series) r[keyOf(p.id, s.id)] = s.points[i]?.y ?? null;
        return r;
      }),
    [panels, xLabels],
  );

  /**
   * One tooltip for the whole stack, rendered by the first panel only.
   *
   * With a shared `syncId` every panel would otherwise show its own box, and three
   * floating cards for one hovered day is furniture. The first panel's box lists every
   * panel's series at that x, read straight from the shared rows rather than from its own
   * payload, which only knows its own lines.
   */
  // Typed on Recharts' defaults rather than <number, string>: `content` takes the wider
  // type, and a narrower parameter would not be assignable to it. Only `active` and
  // `label` are read, and the row lookup does the narrowing.
  const renderTooltip = (props: TooltipContentProps) => {
    if (!props.active || props.label === undefined) return null;
    const row = rows.find((r) => r.x === props.label);
    if (!row) return null;
    const lines = panels.flatMap((panel) =>
      panel.series.flatMap((s) => {
        const v = row[keyOf(panel.id, s.id)];
        if (typeof v !== 'number') return [];
        return [
          {
            key: `${panel.id}-${s.id}`,
            color: s.color,
            label: s.label,
            value: formatValue(v, panel.format),
          },
        ];
      }),
    );
    if (lines.length === 0) return null;
    return (
      <div
        className="rounded-lg px-2.5 py-2 text-xs shadow-lg"
        style={{ background: 'var(--raised)', border: '1px solid var(--border)', minWidth: 130 }}
      >
        <div className="mb-1 font-medium">{shortDate(String(props.label))}</div>
        {lines.map((l) => (
          <div key={l.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 ink-2">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: l.color }}
              />
              {l.label}
            </span>
            <span className="tnum font-medium">{l.value}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={className}>
      {panels.map((panel, pi) => {
        const height = panel.height ?? 160;
        const all = panel.series.flatMap((s) =>
          s.points.map((p) => p.y).filter((v): v is number => v !== null),
        );
        const hasBars = panel.series.some((s) => s.kind === 'bar');
        const [lo, hi] = niceDomain(all, panel.domain, hasBars);
        const ticks = [lo, lo + (hi - lo) / 2, hi];
        const fmt = (n: number) => formatValue(n, panel.format);
        const legend = panel.series.filter((s) => !s.dashed);

        return (
          <div key={panel.id} className="mb-1">
            <div className="flex items-baseline justify-between px-1">
              <span className="text-xs font-medium ink-2">{panel.label}</span>
              {/* A legend for two or more series, and never for one: with one series the
                  title already names it. Dot beside word — identity never rests on colour
                  alone. A dashed reference shows as a dash, which is what it is. */}
              {panel.series.length >= 2 && (
                <div className="flex gap-3">
                  {legend.map((s) => (
                    <span key={s.id} className="flex items-center gap-1.5 text-xs ink-3">
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: s.color }}
                      />
                      {s.label}
                    </span>
                  ))}
                  {panel.series
                    .filter((s) => s.dashed)
                    .map((s) => (
                      <span key={s.id} className="flex items-center gap-1.5 text-xs ink-3">
                        <span
                          aria-hidden
                          className="inline-block h-0 w-3"
                          style={{ borderTop: `2px dashed ${s.color}` }}
                        />
                        {s.label}
                      </span>
                    ))}
                </div>
              )}
            </div>

            <div role="img" aria-label={panel.label} style={{ width: '100%', height }}>
              {/*
                `initialDimension` draws the chart on the first paint instead of after the
                ResizeObserver's first report. Without it the panel is empty for a frame on
                every load, and empty for good in any tab the browser is not displaying —
                a background tab, a print preview — because a hidden document never
                delivers a resize. The observer still corrects the width the moment it can.
              */}
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 600, height }}
              >
                <ComposedChart
                  data={rows}
                  syncId={syncId}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                  barCategoryGap={2}
                >
                  <defs>
                    {panel.series
                      .filter((s) => s.kind === 'area')
                      .map((s) => (
                        <linearGradient
                          key={s.id}
                          id={`${gradientBase}-${panel.id}-${s.id}`}
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                        </linearGradient>
                      ))}
                  </defs>

                  <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />

                  <YAxis
                    width={44}
                    domain={[lo, hi]}
                    ticks={ticks}
                    tickFormatter={fmt}
                    tickLine={false}
                    axisLine={false}
                    tick={{ ...TICK, fontVariantNumeric: 'tabular-nums' } as never}
                  />
                  <XAxis
                    dataKey="x"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={10}
                    minTickGap={28}
                    interval="preserveStartEnd"
                    tickFormatter={shortDate}
                    tick={TICK as never}
                  />

                  <Tooltip
                    cursor={{ stroke: 'var(--axis)', strokeWidth: 1, strokeDasharray: '4 4' }}
                    content={pi === 0 ? renderTooltip : () => null}
                    isAnimationActive={false}
                    wrapperStyle={{ outline: 'none', zIndex: 10 }}
                  />

                  {panel.series.map((s) => {
                    const key = keyOf(panel.id, s.id);

                    if (s.kind === 'bar') {
                      return (
                        <Bar
                          key={s.id}
                          dataKey={key}
                          fill={s.color}
                          // Rounded only at the data end, square at the baseline.
                          radius={[4, 4, 0, 0]}
                          isAnimationActive={animate}
                          animationDuration={450}
                        />
                      );
                    }

                    return (
                      <g key={s.id}>
                        {s.kind === 'area' && (
                          <Area
                            dataKey={key}
                            type="monotone"
                            stroke="none"
                            fill={`url(#${gradientBase}-${panel.id}-${s.id})`}
                            connectNulls={s.connectGaps === true}
                            isAnimationActive={animate}
                            animationDuration={450}
                          />
                        )}
                        <Line
                          dataKey={key}
                          type="monotone"
                          stroke={s.color}
                          strokeWidth={2}
                          strokeDasharray={s.dashed ? '5 5' : undefined}
                          strokeLinecap="round"
                          // A sparse measure keeps its line running across the empty days;
                          // a dense one breaks, because a gap there means data is missing.
                          connectNulls={s.connectGaps === true}
                          dot={dotRenderer(s)}
                          activeDot={s.dashed ? false : <ActiveDot color={s.color} />}
                          isAnimationActive={animate}
                          animationDuration={450}
                        />
                      </g>
                    );
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
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
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const data = values.map((y, i) => ({ i, y }));
  return (
    <div aria-hidden style={{ width, height }}>
      <LineChart
        width={width}
        height={height}
        data={data}
        margin={{ top: 3, right: 2, bottom: 3, left: 2 }}
      >
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Line
          dataKey="y"
          type="monotone"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </div>
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
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: 'var(--ghost)' }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}

/**
 * The markers on a MiniTrend. Recharts clones this element with `cx`, `cy`, `index` and
 * the point's `payload` for every point. A rehab client trains two or three times a week,
 * so a month of scores is a sparse series: each recorded value gets a small dot, or a
 * single session in the window would draw nothing but the line's absence. The latest
 * value gets the halo.
 */
function TrendDot(props: {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: { y: number | null };
  lastIndex: number;
  color: string;
}) {
  if (
    props.cx === undefined ||
    props.cy === undefined ||
    props.payload?.y === null ||
    props.payload?.y === undefined
  )
    return <g />;
  if (props.index === props.lastIndex) {
    return (
      <g>
        <circle cx={props.cx} cy={props.cy} r={6} fill="var(--surface)" />
        <circle cx={props.cx} cy={props.cy} r={3.5} fill={props.color} />
      </g>
    );
  }
  return <circle cx={props.cx} cy={props.cy} r={2.5} fill={props.color} />;
}

/**
 * A card-sized trend: the area wash and monotone line of the big panels, with no axes,
 * no grid and no tooltip, plus the latest value ringed in the surface colour so the eye
 * lands where the reading is. For a roster card, where the question is "which way is
 * this going", not "what was it on the 14th".
 */
export function MiniTrend({
  points,
  color = 'var(--series-1)',
  domain,
  height = 64,
}: {
  points: Point[];
  color?: string;
  domain?: [number, number];
  height?: number;
}) {
  const gradientId = useId();
  const data = points.map((p, i) => ({ i, x: p.x, y: p.y }));
  const lastIndex = data.reduce((last, d) => (d.y !== null ? d.i : last), -1);
  if (lastIndex < 0) return null;

  return (
    <div aria-hidden style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 420, height }}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 4, left: 8 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.26} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={domain ?? ['dataMin', 'dataMax']} />
          <Area
            dataKey="y"
            type="monotone"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            fill={`url(#${gradientId})`}
            connectNulls
            dot={<TrendDot lastIndex={lastIndex} color={color} />}
            activeDot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
