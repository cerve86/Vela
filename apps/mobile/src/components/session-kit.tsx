import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Check } from 'lucide-react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Body, DosePill } from '@/components/kit';
import { Tap, usePop } from '@/components/motion';
import { useTheme } from '@/theme';

/**
 * The pieces of a logged session.
 *
 * Everything that moves here is driven by Reanimated shared values rather than React
 * state. Ticking a set re-renders a card; if the ring and the pop were animating in JS
 * they would hitch on exactly that render, which is the one frame the person is looking at.
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SETTLE = Easing.bezier(0.2, 0.8, 0.25, 1);

/* ─────────────────────────────────────────────────────────────
 * Progress ring
 * ───────────────────────────────────────────────────────────── */

const RING_R = 19;
const RING_C = 2 * Math.PI * RING_R; // ≈ 119.4, the design's dasharray

/** Sets-done ring for the session header. `value` is 0–1. */
export function ProgressRing({ value, size = 46 }: { value: number; size?: number }) {
  const t = useTheme();
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withTiming(Math.max(0, Math.min(1, value)), { duration: 900, easing: SETTLE });
    return () => cancelAnimation(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_C * (1 - p.value),
  }));

  return (
    <Svg width={size} height={size} viewBox="0 0 46 46">
      <Circle cx={23} cy={23} r={RING_R} fill="none" stroke={t.grid} strokeWidth={5} />
      <AnimatedCircle
        cx={23}
        cy={23}
        r={RING_R}
        fill="none"
        stroke={t.brand[600]}
        strokeWidth={5}
        strokeLinecap="round"
        transform="rotate(-90 23 23)"
        strokeDasharray={RING_C}
        animatedProps={animatedProps}
      />
    </Svg>
  );
}

/* ─────────────────────────────────────────────────────────────
 * One set
 * ───────────────────────────────────────────────────────────── */

/**
 * A single set, ticked by tapping the row.
 *
 * The whole row is the target rather than just the circle — at 26px the dot is under the
 * 44pt minimum, and asking someone mid-session to hit a small circle with a shaking hand
 * is the wrong kind of precision. The circle only shows state.
 */
export function SetTickRow({
  n,
  load,
  done,
  onToggle,
}: {
  n: number;
  load: string;
  done: boolean;
  onToggle: () => void;
}) {
  const t = useTheme();
  const { style: popStyle, pop } = usePop();

  return (
    <Tap
      onPress={() => {
        // Pop only on the way in. Popping on un-tick would celebrate a correction.
        if (!done) pop();
        onToggle();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={`Set ${n}, ${load}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: t.radius.md,
        paddingVertical: 12,
        paddingHorizontal: 14,
        minHeight: 52,
        backgroundColor: done ? (t.dark ? 'rgba(92,135,247,0.16)' : t.brand[50]) : t.softFill,
      }}
    >
      <Animated.View
        style={[
          {
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: done ? t.brand[600] : 'transparent',
            borderWidth: 2,
            borderColor: done ? t.brand[600] : t.axis,
          },
          popStyle,
        ]}
      >
        {done ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
      </Animated.View>

      <Body size={15} weight="medium" color={done ? t.textPrimary : t.textSecondary} style={{ flex: 1 }}>
        Set {n}
      </Body>

      <DosePill>{load}</DosePill>
    </Tap>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Rest
 * ───────────────────────────────────────────────────────────── */

/**
 * The rest countdown, docked to the bottom of the session.
 *
 * The bar is animated in one shot — set to full, then told to run to zero over the whole
 * rest period — so it is smooth regardless of what JavaScript is doing. `remaining` only
 * drives the digits, which change once a second and cost nothing.
 *
 * `runId` restarts it. Comparing seconds would not do: ticking two sets with the same rest
 * would leave the bar mid-flight from the first.
 */
export function RestBar({
  runId,
  remaining,
  total,
  nextLabel,
  onSkip,
}: {
  runId: number;
  remaining: number;
  total: number;
  nextLabel: string;
  onSkip: () => void;
}) {
  const t = useTheme();
  const p = useSharedValue(1);
  const enter = useSharedValue(0);

  useEffect(() => {
    p.value = 1;
    p.value = withTiming(0, { duration: Math.max(1, total) * 1000, easing: Easing.linear });
    enter.value = withTiming(1, { duration: 260, easing: SETTLE });
    return () => {
      cancelAnimation(p);
      cancelAnimation(enter);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, total]);

  const bar = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  const slide = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ translateY: (1 - enter.value) * 16 }],
  }));

  const mm = Math.floor(remaining / 60);
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: t.space.lg,
          right: t.space.lg,
          bottom: 26,
        },
        slide,
      ]}
    >
      <View
        style={{
          backgroundColor: t.dark ? t.brand[900] : '#12172B',
          borderRadius: t.radius.tile,
          paddingVertical: 16,
          paddingHorizontal: 20,
          overflow: 'hidden',
        }}
      >
        {/* The bar sits behind the content, draining left to right. */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              backgroundColor: 'rgba(143,174,255,0.16)',
            },
            bar,
          ]}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Text
            style={{
              fontFamily: t.font.displaySemi,
              fontSize: 24,
              color: '#FFFFFF',
              fontVariant: ['tabular-nums'],
            }}
          >
            {mm}:{ss}
          </Text>
          <View style={{ flex: 1 }}>
            <Body size={12.5} weight="medium" color="#FFFFFF">
              Rest
            </Body>
            <Body size={11} color={t.brand[300]} numberOfLines={1}>
              {nextLabel}
            </Body>
          </View>
          <Tap
            onPress={onSkip}
            accessibilityLabel="Skip rest"
            style={{
              paddingVertical: 9,
              paddingHorizontal: 15,
              borderRadius: t.radius.pill,
              backgroundColor: 'rgba(255,255,255,0.14)',
            }}
          >
            <Body size={12.5} weight="medium" color="#FFFFFF">
              Skip
            </Body>
          </Tap>
        </View>
      </View>
    </Animated.View>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Celebration
 * ───────────────────────────────────────────────────────────── */

/**
 * Shown only when every set is ticked.
 *
 * Partial completion gets a plain summary instead, and that restraint is the point — a
 * celebration that fires whatever happened is worth nothing the second time. This is the
 * one place the app raises its voice.
 */
export function CelebrationCard({ message }: { message: string }) {
  const t = useTheme();
  const s = useSharedValue(0);

  useEffect(() => {
    s.value = withTiming(1, { duration: 520, easing: SETTLE });
    return () => cancelAnimation(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animated = useAnimatedStyle(() => ({
    opacity: s.value,
    transform: [{ scale: 0.94 + s.value * 0.06 }],
  }));

  return (
    <Animated.View
      style={[
        {
          backgroundColor: t.dark ? 'rgba(14,159,110,0.14)' : t.tint.mint,
          borderWidth: 1.5,
          borderColor: t.status.goodFill,
          borderRadius: 22,
          padding: 22,
          alignItems: 'center',
          gap: 10,
        },
        animated,
      ]}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          backgroundColor: t.status.goodFill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Check size={24} color="#FFFFFF" strokeWidth={3} />
      </View>
      <Text
        style={{
          fontFamily: t.font.displaySemi,
          fontSize: 24,
          letterSpacing: -0.6,
          color: t.textPrimary,
          textAlign: 'center',
        }}
      >
        Every set, done
      </Text>
      <Body size={13.5} color={t.textSecondary} style={{ textAlign: 'center', lineHeight: 19 }}>
        {message}
      </Body>
    </Animated.View>
  );
}
