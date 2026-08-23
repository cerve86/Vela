import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
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

  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${(W - PAD_X).toFixed(1)} ${BASE} L${PAD_X} ${BASE} Z`;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const meanY = y(mean);

  const lastX = x(values.length - 1);
  const lastY = y(values[values.length - 1]!);

  return (
    <Svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 118 }}>
      {/* Baseline and ceiling: hairline, solid, one step off the surface. */}
      <Line x1={PAD_X} y1={BASE} x2={W - PAD_X} y2={BASE} stroke={t.grid} strokeWidth={1} />
      <Line x1={PAD_X} y1={TOP} x2={W - PAD_X} y2={TOP} stroke={t.tint.cream} strokeWidth={1} />

      {/* The period mean, dashed so it reads as reference rather than measurement. */}
      <Line
        x1={PAD_X}
        y1={meanY}
        x2={W - PAD_X}
        y2={meanY}
        stroke={t.axis}
        strokeWidth={1}
        strokeDasharray="3 6"
      />

      <Path d={area} fill={t.brand[600]} fillOpacity={t.dark ? 0.14 : 0.08} />
      <Path
        d={line}
        stroke={t.textPrimary}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* End marker: 9px across, with a 2px surface ring so it survives any background. */}
      <Circle cx={lastX} cy={lastY} r={6.5} fill={t.surface} />
      <Circle cx={lastX} cy={lastY} r={4.5} fill={t.textPrimary} />
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
  const path = (vals: number[]) =>
    vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');

  const areaPath = `${path(adherence)} L${x(adherence.length - 1).toFixed(1)} ${base} L${padX} ${base} Z`;

  return (
    <View>
      <Svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 132 }}>
        {[top, 34, 56, 78, base].map((gy) => (
          <Line key={gy} x1={padX} y1={gy} x2={w - padX} y2={gy} stroke={t.softFill} strokeWidth={1} />
        ))}

        <Path d={areaPath} fill={t.chartAdherence} fillOpacity={0.07} />
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

        <Circle cx={x(adherence.length - 1)} cy={y(adherence[adherence.length - 1]!)} r={6} fill={t.surface} />
        <Circle cx={x(adherence.length - 1)} cy={y(adherence[adherence.length - 1]!)} r={4} fill={t.chartAdherence} />
        <Circle cx={x(soreness.length - 1)} cy={y(soreness[soreness.length - 1]!)} r={6} fill={t.surface} />
        <Circle cx={x(soreness.length - 1)} cy={y(soreness[soreness.length - 1]!)} r={4} fill={t.chartSoreness} />
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
