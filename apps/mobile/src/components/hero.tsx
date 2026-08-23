import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, RadialGradient, Rect, Stop, LinearGradient } from 'react-native-svg';
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
  tone,
}: {
  value: number;
  word: string;
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
            fontSize: 15,
            letterSpacing: -0.2,
            color: stroke,
          }}
        >
          {word}
        </Text>
      </View>
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

/** The pill under the greeting sentence — one fact, dot-coded by tone. */
export function HeroChip({ label, dot }: { label: string; dot: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', marginTop: 14 }}>
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
    </View>
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
