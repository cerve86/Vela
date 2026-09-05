import { Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Body } from '@/components/kit';
import { useTheme } from '@/theme';

/**
 * Charts for Progress.
 *
 * The register is "mono": one ink, one line, one mean. The vitals line is drawn in the
 * text colour rather than in the metric's own hue, which is not a shortcut — it is what
 * makes the form safe. Four vitals identity colours cannot all be told apart (HRV purple
 * and weight blue sit below the normal-vision separation floor), and a chart showing one
 * metric at a time has no need of them. The colour lives on the metric's row in the list,
 * beside its name, where nothing has to be distinguished from anything.
 *
 * Everything here follows the same mark spec: 2px round-capped lines, an end marker of at
 * least 8px carrying a surface ring so it stays legible where it crosses anything, an area
 * wash rather than a saturated block, hairline solid gridlines, and labels in ink tokens —
 * never in a series colour.
 */

/* ─────────────────────────────────────────────────────────────
 * Mono chart — one measure over time
 * ───────────────────────────────────────────────────────────── */

const W = 300;
const H = 112;
const PAD_X = 10;
const TOP = 22;
const BASE = 100;

export interface MonoPoint {
  value: number;
}

/**
 * A single measure over time: line, area wash, and the period mean as a dashed rule.
 *
 * The mean is dashed and the gridlines are solid, which is the right way round — a dashed
 * line reads as a reference rather than as data, and dashing the grid instead would make
 * the furniture compete with the measurement.
 *
 * No legend. With one series the title already names what is plotted, and a box holding a
 * single swatch restates it while taking space the chart could use.
 */
export function MonoChart({
  values,
  goodDown,
}: {
  values: number[];
  /** Whether a falling line is the good direction, for the delta's colour. */
  goodDown: boolean;
}) {
  const t = useTheme();

  if (values.length < 2) {
    return (
      <View style={{ height: 118, alignItems: 'center', justifyContent: 'center' }}>
        <Body size={12.5} color={t.textMuted}>
          Two readings are needed before a trend means anything.
        </Body>
      </View>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const x = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / (values.length - 1);
  const y = (v: number) => BASE - ((v - min) / span) * (BASE - TOP);

  const pts = values.map((v, i) => ({ x: x(i), y: y(v) }));
  const line = monotonePath(pts);
  const area = `${line} L${(W - PAD_X).toFixed(1)} ${BASE} L${PAD_X} ${BASE} Z`;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const meanY = y(mean);

  const lastX = x(values.length - 1);
  const lastY = y(values[values.length - 1]!);

  return (
    <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 118 }}>
      <Defs>
        {/* The wash fades to nothing, so it reads as a shadow under the line rather than a
            block of colour — the same gradient the portal's panels use. */}
        <LinearGradient id="mono-wash" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={t.brand[600]} stopOpacity={t.dark ? 0.32 : 0.28} />
          <Stop offset="1" stopColor={t.brand[600]} stopOpacity={0} />
        </LinearGradient>
      </Defs>

      {/* Three recessive rules — floor, middle, ceiling — and no axis lines. The ceiling
          used to be drawn in a tint that read as a second baseline; a grid step is what
          it is. */}
      {[BASE, (BASE + TOP) / 2, TOP].map((gy) => (
        <Line key={gy} x1={PAD_X} y1={gy} x2={W - PAD_X} y2={gy} stroke={t.grid} strokeWidth={1} />
      ))}

      {/* The period mean, dashed so it reads as reference rather than measurement. */}
      <Line
        x1={PAD_X}
        y1={meanY}
        x2={W - PAD_X}
        y2={meanY}
        stroke={t.axis}
        strokeWidth={1}
        strokeDasharray="5 5"
      />

      <Path d={area} fill="url(#mono-wash)" />
      <Path
        d={line}
        stroke={t.textPrimary}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* End marker: a soft halo under a ringed core, so it stays legible over the wash
          and survives crossing the mean rule. */}
      <Circle cx={lastX} cy={lastY} r={7} fill={t.textPrimary} fillOpacity={0.18} />
      <Circle cx={lastX} cy={lastY} r={4} fill={t.textPrimary} stroke={t.surface} strokeWidth={2} />
    </Svg>
  );
}

/** The figures that sit above a mono chart — current value, and the change across it. */
export function MonoHeader({
  label,
  values,
  unit,
  goodDown,
}: {
  label: string;
  values: number[];
  unit: string;
  goodDown: boolean;
}) {
  const t = useTheme();
  const now = values[values.length - 1] ?? 0;
  const first = values[0] ?? 0;
  const delta = now - first;
  const improving = goodDown ? delta < 0 : delta > 0;
  const flat = Math.abs(delta) < 0.05;

  const deltaColor = flat ? t.textSecondary : improving ? t.status.good : t.status.serious;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <View>
        <Body size={11} weight="medium" color={t.textSecondary} style={{ letterSpacing: 0.5 }}>
          {label.toUpperCase()} · {values.length} READINGS
        </Body>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 5 }}>
          <Text
            style={{
              fontFamily: t.font.displaySemi,
              fontSize: 32,
              letterSpacing: -1.1,
              color: t.textPrimary,
              fontVariant: ['tabular-nums'],
            }}
          >
            {trim(now)}
          </Text>
          {unit ? (
            <Body size={13.5} color={t.textSecondary}>
              {unit}
            </Body>
          ) : null}
        </View>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text
          style={{
            fontFamily: t.font.medium,
            fontSize: 12.5,
            color: deltaColor,
            fontVariant: ['tabular-nums'],
          }}
        >
          {flat ? 'no change' : `${delta > 0 ? '+' : ''}${trim(delta)}`}
        </Text>
        <Body size={11} color={t.textSecondary} style={{ marginTop: 2 }}>
          {flat ? 'holding' : improving ? 'going the right way' : 'worth a look'}
        </Body>
      </View>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Attendance heatmap
 * ───────────────────────────────────────────────────────────── */

export type CellState = 'full' | 'partial' | 'missed' | 'rest' | 'today';

/**
 * Weeks of attendance, one column per week and one cell per day.
 *
 * Ships with a labelled legend rather than relying on colour: amber on white sits at
 * 2.13:1, which the palette checker flags as needing relief. The legend is that relief,
 * and it also covers the reader who cannot separate the green from the amber at all.
 */
export function Heatmap({ weeks }: { weeks: CellState[][] }) {
  const t = useTheme();

  const fill = (s: CellState) => {
    if (s === 'full') return t.heatmapFull;
    if (s === 'partial') return t.heatmapPartial;
    if (s === 'missed') return t.heatmapMissed;
    return t.softFill;
  };

  const CELL = 9;
  const GAP = 3;
  const width = weeks.length * (CELL + GAP) - GAP;
  const height = 7 * (CELL + GAP) - GAP;

  return (
    <View>
      <Svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: height * 1.6 }}>
        {weeks.map((week, wi) =>
          week.map((state, di) => (
            <Rect
              key={`${wi}-${di}`}
              x={wi * (CELL + GAP)}
              y={di * (CELL + GAP)}
              width={CELL}
              height={CELL}
              rx={2.5}
              fill={fill(state)}
              stroke={state === 'today' ? t.brand[600] : undefined}
              strokeWidth={state === 'today' ? 1.5 : undefined}
            />
          )),
        )}
      </Svg>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 }}>
        <LegendKey color={t.heatmapFull} label="All sets" />
        <LegendKey color={t.heatmapPartial} label="Some" />
        <LegendKey color={t.heatmapMissed} label="Missed" />
        <LegendKey color={t.softFill} label="Rest" />
      </View>
    </View>
  );
}

/** A swatch and its name. The text stays in ink; only the swatch carries the colour. */
export function LegendKey({ color, label }: { color: string; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 9, height: 9, borderRadius: 2.5, backgroundColor: color }} />
      <Body size={11} color={t.textSecondary}>
        {label}
      </Body>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Two-series trend
 * ───────────────────────────────────────────────────────────── */

/**
 * Adherence against soreness over the same weeks.
 *
 * Two series, so a legend is mandatory — identity is never left to colour-matching. Both
 * are normalised to 0–1 and share one axis: two measures of different scale get two lines
 * on a common base, never a second y-axis.
 */
export function TrendChart({
  adherence,
  soreness,
}: {
  adherence: number[];
  soreness: number[];
}) {
  const t = useTheme();
  const n = Math.max(adherence.length, soreness.length);

  if (n < 2) {
    return (
      <Body size={12.5} color={t.textMuted}>
        A few more weeks and this starts to show a shape.
      </Body>
    );
  }

  const w = 300;
  const h = 120;
  const top = 12;
  const base = 100;
  const padX = 6;

  const x = (i: number) => padX + (i * (w - padX * 2)) / (n - 1);
  const y = (v: number) => base - Math.max(0, Math.min(1, v)) * (base - top);
  const path = (vals: number[]) => monotonePath(vals.map((v, i) => ({ x: x(i), y: y(v) })));

  const areaPath = `${path(adherence)} L${x(adherence.length - 1).toFixed(1)} ${base} L${padX} ${base} Z`;

  const marker = (cx: number, cy: number, color: string) => (
    <>
      <Circle cx={cx} cy={cy} r={7} fill={color} fillOpacity={0.22} />
      <Circle cx={cx} cy={cy} r={4} fill={color} stroke={t.surface} strokeWidth={2} />
    </>
  );

  return (
    <View>
      <Svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 132 }}>
        <Defs>
          <LinearGradient id="trend-wash" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.chartAdherence} stopOpacity={0.28} />
            <Stop offset="1" stopColor={t.chartAdherence} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {[top, (top + base) / 2, base].map((gy) => (
          <Line key={gy} x1={padX} y1={gy} x2={w - padX} y2={gy} stroke={t.grid} strokeWidth={1} />
        ))}

        <Path d={areaPath} fill="url(#trend-wash)" />
        <Path
          d={path(adherence)}
          stroke={t.chartAdherence}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Path
          d={path(soreness)}
          stroke={t.chartSoreness}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {marker(x(adherence.length - 1), y(adherence[adherence.length - 1]!), t.chartAdherence)}
        {marker(x(soreness.length - 1), y(soreness[soreness.length - 1]!), t.chartSoreness)}
      </Svg>

      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
        <LegendKey color={t.chartAdherence} label="Sessions kept" />
        <LegendKey color={t.chartSoreness} label="Soreness" />
      </View>
    </View>
  );
}

/** Drops a trailing .0 so 66.0 reads as 66 while 65.5 keeps its half. */
function trim(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/* ─────────────────────────────────────────────────────────────
 * Curves
 * ───────────────────────────────────────────────────────────── */

/**
 * A monotone cubic path through the points — the same curve the portal's charts draw.
 *
 * "Monotone" is the property that makes a smoothed line honest: between two readings the
 * curve never rises above the higher one or dips below the lower, so it cannot invent a
 * peak that was not measured. A plain Catmull-Rom or Bézier spline can, and on a pain or
 * weight series an invented peak is a lie the eye reads as data. This is d3's monotoneX,
 * transcribed, for a strictly increasing x.
 */
export function monotonePath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  const f = (n: number) => n.toFixed(1);
  const first = pts[0]!;
  let d = `M${f(first.x)} ${f(first.y)}`;
  if (pts.length === 1) return d;
  if (pts.length === 2) return `${d} L${f(pts[1]!.x)} ${f(pts[1]!.y)}`;

  let t0: number | undefined;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1]!;
    const p1 = pts[i]!;
    const t1 =
      i < pts.length - 1 ? slope3(p0, p1, pts[i + 1]!) : slope2(p0, p1, t0 as number);
    if (t0 === undefined) t0 = slope2(p0, p1, t1);
    const dx = (p1.x - p0.x) / 3;
    d += ` C${f(p0.x + dx)} ${f(p0.y + dx * t0)} ${f(p1.x - dx)} ${f(p1.y - dx * t1)} ${f(p1.x)} ${f(p1.y)}`;
    t0 = t1;
  }
  return d;
}

type Pt = { x: number; y: number };

/** Tangent at the middle of three points, limited so the curve stays between them. */
function slope3(p0: Pt, p1: Pt, p2: Pt): number {
  const h0 = p1.x - p0.x;
  const h1 = p2.x - p1.x;
  if (!(h0 > 0) || !(h1 > 0)) return 0;
  const s0 = (p1.y - p0.y) / h0;
  const s1 = (p2.y - p1.y) / h1;
  const p = (s0 * h1 + s1 * h0) / (h0 + h1);
  return (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p)) || 0;
}

/** Tangent at an end point, given the tangent at its neighbour. */
function slope2(p0: Pt, p1: Pt, t: number): number {
  const h = p1.x - p0.x;
  return h > 0 ? (3 * (p1.y - p0.y)) / h - t : t;
}

