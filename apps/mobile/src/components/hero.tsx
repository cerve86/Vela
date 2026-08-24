import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useEffect } from 'react';
import Svg, { Circle, Defs, G, Line, Path, RadialGradient, Rect, Stop, LinearGradient } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/theme';
import { Body } from '@/components/kit';

/**
 * The Today band and the tiles beneath it.
 *
 * These live apart from `kit.tsx` because they are not primitives — each one is a specific
 * piece of the Today screen with its own composition rules, and putting them in the kit
 * would invite reuse somewhere the proportions do not hold.
 */

/* ─────────────────────────────────────────────────────────────
 * The illustrated band
 * ───────────────────────────────────────────────────────────── */

/**
 * Full-bleed band behind the greeting: concentric rings, three drifting waves, and a
 * radial glow that lifts the middle so the dial has something to sit on.
 *
 * The artwork is drawn on a fixed 402 × 300 stage and stretched to fill, which is why the
 * paths start at x = -30 and run past 402 — they have to survive the crop at any width
 * without a visible end. `preserveAspectRatio="xMidYMid slice"` does the cropping.
 *
 * The waves do not animate. The design drifts them over 14s, but an infinite loop on the
 * first screen of the app costs battery all day for motion nobody looks at twice, and it
 * cannot be stilled by Reduce Motion without extra plumbing. The frame it settles on is
 * the one the design shows at rest.
 */
export function HeroBand({ children }: { children: ReactNode }) {
  const t = useTheme();

  return (
    <View
      style={{
        marginHorizontal: -t.space.lg,
        backgroundColor: t.bandFill,
        borderBottomWidth: 1,
        borderBottomColor: t.bandLine,
        paddingHorizontal: 20,
        paddingBottom: 26,
        overflow: 'hidden',
      }}
    >
      <Svg
        viewBox="0 0 402 300"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        <Defs>
          <RadialGradient id="heroGlow" cx="50%" cy="28%" r="62%">
            <Stop offset="0%" stopColor={t.dark ? '#243056' : '#FFFFFF'} stopOpacity="0.95" />
            <Stop offset="100%" stopColor={t.bandFill} stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={t.brand[600]} stopOpacity={t.dark ? '0.30' : '0.10'} />
            <Stop offset="100%" stopColor={t.brand[600]} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {/* Concentric rings, fading downward so the band bottom stays quiet. */}
        <G stroke="url(#heroFade)" strokeWidth={1.1} fill="none">
          {[188, 162, 136, 110, 84].map((r) => (
            <Circle key={r} cx={201} cy={150} r={r} />
          ))}
        </G>

        {/* Three waves along the bottom edge. */}
        <G
          stroke={t.brand[600]}
          strokeOpacity={t.dark ? 0.16 : 0.07}
          strokeWidth={1.4}
          strokeLinecap="round"
          fill="none"
        >
          <Path d="M-30 232 q50 -20 100 0 t100 0 t100 0 t100 0" />
          <Path d="M-30 258 q50 -18 100 0 t100 0 t100 0 t100 0" />
          <Path d="M-30 284 q50 -16 100 0 t100 0 t100 0 t100 0" />
        </G>

        {/* Glow last, so it sits over the line-art and softens it toward the centre. */}
        <Rect width={402} height={300} fill="url(#heroGlow)" />
      </Svg>

      {children}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Readiness dial
 * ───────────────────────────────────────────────────────────── */

const DIAL_BOX = 176;
const DIAL_R = 70;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_R; // ≈ 439.8, the design's 440

/**
 * The readiness dial: a full ring with a knob at the current position.
 *
 * `value` is 0–1. The ring is drawn rotated -90° so zero starts at twelve o'clock, and the
 * knob is a separate un-rotated layer rotated by angle — two SVGs rather than one, because
 * nesting a counter-rotation inside the rotated group puts the knob's own centre in the
 * wrong place.
 */
export function ReadinessDial({
  value,
  word,
  sub,
  tone,
}: {
  value: number;
  word: string;
  /** The score behind the word, e.g. "2 of 5". Omitted when nothing is logged. */
  sub?: string;
  tone?: string;
}) {
  const t = useTheme();
  const clamped = Math.max(0, Math.min(1, value));
  const stroke = tone ?? t.brand[600];

  return (
    <View style={{ width: DIAL_BOX, height: DIAL_BOX }}>
      <Svg
        width={DIAL_BOX}
        height={DIAL_BOX}
        viewBox={`0 0 ${DIAL_BOX} ${DIAL_BOX}`}
        style={{ transform: [{ rotate: '-90deg' }] }}
      >
        <Circle cx={88} cy={88} r={DIAL_R} fill="none" stroke={t.dialTrack} strokeWidth={9} />
        {/* Inner dotted ring — texture only, no value meaning. */}
        <Circle
          cx={88}
          cy={88}
          r={54}
          fill="none"
          stroke={t.dialTicks}
          strokeWidth={13}
          strokeDasharray="1.6 7.4"
        />
        <Circle
          cx={88}
          cy={88}
          r={DIAL_R}
          fill="none"
          stroke={stroke}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={DIAL_CIRCUMFERENCE}
          strokeDashoffset={DIAL_CIRCUMFERENCE * (1 - clamped)}
        />
      </Svg>

      <Svg
        width={DIAL_BOX}
        height={DIAL_BOX}
        viewBox={`0 0 ${DIAL_BOX} ${DIAL_BOX}`}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <G transform={`rotate(${clamped * 360} 88 88)`}>
          <Circle cx={88} cy={18} r={6.5} fill={stroke} />
          <Circle cx={88} cy={18} r={2.6} fill={t.dark ? t.bandFill : '#FFFFFF'} />
        </G>
      </Svg>

      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: t.font.displaySemi,
            fontSize: sub ? 19 : 15,
            letterSpacing: -0.3,
            color: stroke,
          }}
        >
          {word}
        </Text>
        {sub ? (
          <Body
            size={11}
            weight="medium"
            color={t.textSecondary}
            style={{ marginTop: 2, letterSpacing: 0.2 }}
          >
            {sub}
          </Body>
        ) : null}
      </View>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────
 * The dual dial: recovery on the left, strain on the right
 * ───────────────────────────────────────────────────────────── */

const RING_BOX = 188;
const RING_R = 74;
const RING_C = 2 * Math.PI * RING_R;
const TICKS = 44;

/**
 * Two arcs on one dial, plus a tick ring behind them.
 *
 * The outer arc is recovery and the inner marker is the strain target, which is the whole
 * point of putting them on one instrument: the question a person actually has in the morning
 * is not "what are my numbers" but "is what I am about to do more than what I have". Two
 * separate gauges make that a subtraction the reader has to do.
 *
 * Both arcs start at twelve o'clock, drawn on a rotated layer. The knob is a second,
 * un-rotated SVG rotated by its own angle — nesting a counter-rotation inside the rotated
 * group puts the knob's centre in the wrong place.
 */
export function DualDial({
  recovery,
  strain,
  strainTarget,
  tone,
  toneSoft,
}: {
  /** 0–100, or null when nothing has been logged or synced yet. */
  recovery: number | null;
  strain: number;
  /** Where today's plan sits on the strain scale. Null on a rest day. */
  strainTarget: number | null;
  tone: string;
  /** The lighter end of the arc's gradient. Falls back to `tone` for a flat stroke. */
  toneSoft?: string;
}) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const rec = recovery === null ? 0 : Math.max(0, Math.min(100, recovery)) / 100;
  const str = Math.max(0, Math.min(100, strain)) / 100;

  /**
   * The travelling highlight.
   *
   * A sheen that runs along the drawn part of the arc and starts again — the "flow" the
   * design asks for, without a loop that could be mistaken for a value changing. It is a
   * rotated layer rather than an animated gradient because rotating a view stays on
   * Reanimated's fast path, where animating SVG gradient stops does not.
   *
   * It travels only as far as the arc does, so it never appears over empty track and cannot
   * imply a recovery figure higher than the real one.
   */
  const sweep = useSharedValue(0);

  useEffect(() => {
    if (reduced || recovery === null) return;
    sweep.value = 0;
    sweep.value = withRepeat(
      withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.ease) }),
      -1,
      false,
    );
    return () => cancelAnimation(sweep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, recovery]);

  const sheen = useAnimatedStyle(() => ({
    // Fades in and out at the ends so it arrives and leaves rather than blinking.
    opacity: interpolate(sweep.value, [0, 0.15, 0.85, 1], [0, 0.9, 0.9, 0]),
    transform: [{ rotate: `${sweep.value * rec * 360}deg` }],
  }));

  return (
    <View style={{ width: RING_BOX, height: RING_BOX }}>
      <Svg
        width={RING_BOX}
        height={RING_BOX}
        viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
        style={{ transform: [{ rotate: '-90deg' }] }}
      >
        {/* The tick ring. Texture, and a scale to read the arcs against. */}
        <G>
          {Array.from({ length: TICKS }, (_, i) => {
            const angle = (i / TICKS) * 2 * Math.PI;
            const inner = 46;
            const outer = i % 11 === 0 ? 60 : 57;
            const cx = RING_BOX / 2;
            return (
              <Line
                key={i}
                x1={cx + Math.cos(angle) * inner}
                y1={cx + Math.sin(angle) * inner}
                x2={cx + Math.cos(angle) * outer}
                y2={cx + Math.sin(angle) * outer}
                stroke={i / TICKS <= str ? t.brand[300] : t.dialTicks}
                strokeWidth={i / TICKS <= str ? 2.4 : 1.8}
                strokeLinecap="round"
              />
            );
          })}
        </G>

        <Defs>
          {/* Two shades of the band's own blue, so the arc has depth rather than one flat ink. */}
          <LinearGradient id="recArc" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={toneSoft ?? tone} />
            <Stop offset="100%" stopColor={tone} />
          </LinearGradient>
        </Defs>

        <Circle cx={94} cy={94} r={RING_R} fill="none" stroke={t.dialTrack} strokeWidth={10} />

        {/* Recovery, the outer arc. */}
        <Circle
          cx={94}
          cy={94}
          r={RING_R}
          fill="none"
          stroke={recovery === null ? t.dialTrack : 'url(#recArc)'}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - rec)}
        />
      </Svg>

      {/* The sheen, on its own rotated layer. */}
      {recovery !== null && !reduced && (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', top: 0, left: 0 }, sheen]}
        >
          <Svg
            width={RING_BOX}
            height={RING_BOX}
            viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
            style={{ transform: [{ rotate: '-90deg' }] }}
          >
            <Circle
              cx={94}
              cy={94}
              r={RING_R}
              fill="none"
              stroke={toneSoft ?? tone}
              strokeWidth={10}
              strokeLinecap="round"
              // A short bright segment, not a second arc: 20 units drawn, the rest gap.
              strokeDasharray={`20 ${RING_C}`}
            />
          </Svg>
        </Animated.View>
      )}

      {/* The strain target, as a notch on the tick ring rather than a third arc. */}
      {strainTarget !== null && (
        <Svg
          width={RING_BOX}
          height={RING_BOX}
          viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <G transform={`rotate(${(strainTarget / 100) * 360} 94 94)`}>
            <Line x1={94} y1={30} x2={94} y2={48} stroke={t.textSecondary} strokeWidth={2.6} strokeLinecap="round" />
          </G>
        </Svg>
      )}

      {/* The recovery knob. */}
      {recovery !== null && (
        <Svg
          width={RING_BOX}
          height={RING_BOX}
          viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <G transform={`rotate(${rec * 360} 94 94)`}>
            <Circle cx={94} cy={20} r={7} fill={tone} />
            <Circle cx={94} cy={20} r={2.8} fill={t.dark ? t.bandFill : '#FFFFFF'} />
          </G>
        </Svg>
      )}
    </View>
  );
}

/**
 * One of the two figures flanking the dial: a big percentage, a label, and a qualifier.
 *
 * The qualifier line is what stops these being two decorative numbers — "moderate" and
 * "target 59%" are the parts that say whether the figure above is good news.
 */
export function DialStat({
  value,
  label,
  sub,
  align,
  tone,
}: {
  value: string;
  label: string;
  sub: string;
  align: 'left' | 'right';
  tone?: string;
}) {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      {/*
        One line, always. At 34px "100%" is wider than the column the flanking stats get, so
        strain wrapped to "100" over "%" the first time anybody trained hard — the one value
        a person is most pleased to see, broken across two lines. Shrinking to fit is the
        right trade here: the figure stays whole and the layout stays put.
      */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={{
          fontFamily: t.font.displaySemi,
          fontSize: 34,
          letterSpacing: -1.4,
          lineHeight: 36,
          color: tone ?? t.textPrimary,
          textAlign: align,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
      <Body
        size={11}
        weight="medium"
        color={t.textSecondary}
        style={{ marginTop: 5, letterSpacing: 0.8, textAlign: align }}
      >
        {label}
      </Body>
      <Body size={11} color={t.textSecondary} style={{ marginTop: 2, letterSpacing: 0.6, textAlign: align }}>
        {sub}
      </Body>
    </View>
  );
}

/** One of the two figures flanking the dial. Right-aligned on the left, and vice versa. */
export function HeroStat({
  value,
  label,
  sub,
  align,
}: {
  value: string;
  label: string;
  sub?: string;
  align: 'left' | 'right';
}) {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text
        style={{
          fontFamily: t.font.displaySemi,
          fontSize: 32,
          letterSpacing: -1.2,
          lineHeight: 32,
          color: t.textPrimary,
          textAlign: align,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
      <Body
        size={11}
        weight="medium"
        color={t.textSecondary}
        style={{ marginTop: 5, letterSpacing: 0.7, textAlign: align }}
      >
        {label}
      </Body>
      {sub ? (
        <Body
          size={11}
          color={t.textSecondary}
          style={{ marginTop: 2, letterSpacing: 0.7, textAlign: align }}
        >
          {sub}
        </Body>
      ) : null}
    </View>
  );
}

/**
 * The pill under the greeting sentence — one fact, dot-coded by tone.
 *
 * Tappable when given `onPress`, which is how the unlogged state becomes an invitation
 * rather than a notice: "no read yet" is the one thing on this screen a person can fix in
 * one tap, so the chip saying it should be the thing that takes them there.
 */
export function HeroChip({
  label,
  dot,
  onPress,
}: {
  label: string;
  dot: string;
  onPress?: () => void;
}) {
  const t = useTheme();

  const body = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 7,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.dark ? t.border : 'rgba(27,79,216,0.14)',
        borderRadius: t.radius.pill,
        paddingVertical: 7,
        paddingHorizontal: 14,
      }}
    >
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: dot }} />
      <Body size={11} color={t.textSecondary}>
        {label}
      </Body>
    </View>
  );

  if (!onPress) {
    return <View style={{ alignItems: 'center', marginTop: 14 }}>{body}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        alignItems: 'center',
        marginTop: 14,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      {body}
    </Pressable>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Tiles
 * ───────────────────────────────────────────────────────────── */

/**
 * One of the two tiles under the band.
 *
 * The chart strip bleeds to the tile's edges, which is why padding is applied on three
 * sides only and the strip pulls itself back out with negative margins. `marginTop: 'auto'`
 * pins it to the bottom regardless of how much copy sits above it, so two tiles side by
 * side always align along their baselines.
 */
export function Tile({
  icon,
  title,
  value,
  unit,
  pill,
  pillBg,
  pillFg,
  meta,
  strip,
  onPress,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  unit?: string;
  pill: string;
  pillBg: string;
  pillFg: string;
  meta?: string;
  strip?: ReactNode;
  onPress?: () => void;
}) {
  const t = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 150,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.dark ? t.border : 'rgba(27,79,216,0.12)',
        borderRadius: t.radius.md,
        paddingTop: 15,
        paddingHorizontal: 15,
        overflow: 'hidden',
        transform: [{ scale: pressed ? 0.975 : 1 }],
      })}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${title}, ${value}${unit ? ' ' + unit : ''}, ${pill}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        {icon}
        <Body size={12.5} weight="medium" style={{ flex: 1 }}>
          {title}
        </Body>
        {onPress ? <ChevronRight size={13} color={t.textSecondary} strokeWidth={2.4} /> : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 8 }}>
        <Text
          style={{
            fontFamily: t.font.displaySemi,
            fontSize: 32,
            letterSpacing: -1.2,
            lineHeight: 32,
            color: t.textPrimary,
            fontVariant: ['tabular-nums'],
          }}
        >
          {value}
        </Text>
        {unit ? (
          <Body size={12.5} color={t.textSecondary}>
            {unit}
          </Body>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 }}>
        <View
          style={{
            borderRadius: t.radius.pill,
            paddingVertical: 4,
            paddingHorizontal: 9,
            backgroundColor: pillBg,
          }}
        >
          <Body size={11} weight="medium" color={pillFg}>
            {pill}
          </Body>
        </View>
        {meta ? (
          <Body size={11} color={t.textSecondary} style={{ flex: 1 }} numberOfLines={1}>
            {meta}
          </Body>
        ) : null}
      </View>

      <View style={{ marginTop: 'auto', marginHorizontal: -15, height: 38 }}>{strip}</View>
    </Pressable>
  );
}

/**
 * The bar strip in the mood tile: recent readiness reads, most recent last.
 *
 * Heights come from `tide[].barH` so the strip and the readiness battery cannot disagree
 * about what "Low" looks like.
 */
export function TideBars({ values }: { values: (number | null)[] }) {
  const t = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 3,
        height: 38,
        paddingHorizontal: 15,
      }}
    >
      {values.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: v === null ? 4 : t.tide[v]?.barH ?? 8,
            borderTopLeftRadius: 3,
            borderTopRightRadius: 3,
            backgroundColor: v === null ? t.grid : t.tide[v]?.tone ?? t.grid,
          }}
        />
      ))}
    </View>
  );
}

/** The segment strip in the fuel tile: one segment per meal slot, dimmed until logged. */
export function SlotStrip({ logged }: { logged: Record<string, boolean> }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 3, height: 38 }}>
      {t.mealSlots.map((s) => (
        <View
          key={s.key}
          style={{
            flex: 1,
            backgroundColor: s.color,
            opacity: logged[s.key] ? 1 : 0.18,
          }}
        />
      ))}
    </View>
  );
}
