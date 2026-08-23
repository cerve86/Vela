import { useEffect, type ReactNode } from 'react';
import { Pressable, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { motion } from '@vela/shared/tokens';

/**
 * Motion primitives.
 *
 * All of it runs through Reanimated rather than the Animated API, and that is the whole
 * point: Reanimated drives these on the UI thread, so a press still feels instant while
 * JavaScript is busy re-rendering a session's worth of set rows. The same animations
 * written with `Animated` would stutter exactly when the app is doing something — which is
 * the only time anybody notices.
 *
 * Durations and easings come from the token file so the whole app rises, pulses and
 * presses at one speed. A card that animates 50ms differently from its neighbour reads as
 * a bug rather than a flourish.
 */

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** The design's press curve: cubic-bezier(.2,.7,.3,1). */
const PRESS = Easing.bezier(0.2, 0.7, 0.3, 1);
const SETTLE = Easing.bezier(0.2, 0.8, 0.25, 1);

/**
 * A pressable that scales on touch.
 *
 * Every tappable surface in the redesign does this, so it lives here once. Scaling on
 * `pressIn` rather than on `press` is deliberate — the feedback has to land while the
 * finger is still down, or it reads as lag rather than response.
 */
export function Tap({
  children,
  onPress,
  disabled = false,
  scale = motion.press.scale,
  style,
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
}: {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  scale?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'checkbox' | 'radio';
  accessibilityState?: { selected?: boolean; disabled?: boolean; checked?: boolean };
}) {
  const s = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={() => {
        s.value = withTiming(scale, { duration: motion.press.duration, easing: PRESS });
      }}
      onPressOut={() => {
        s.value = withTiming(1, { duration: motion.press.duration, easing: PRESS });
      }}
      onPress={onPress}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}

/**
 * Card entry: 10px up and a fade, 400ms.
 *
 * `delay` staggers a list. Keep the step small — 40ms or so — because a long stagger stops
 * feeling like the screen arriving and starts feeling like it is loading slowly.
 */
export function Rise({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: ViewStyle;
}) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withTiming(1, { duration: motion.rise.duration, easing: SETTLE });
    return () => cancelAnimation(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animated = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 10 }],
  }));

  // The delay is applied by holding the animation back rather than by a JS timer, so a
  // list that unmounts mid-stagger leaves no timers behind.
  useEffect(() => {
    if (!delay) return;
    p.value = 0;
    const id = setTimeout(() => {
      p.value = withTiming(1, { duration: motion.rise.duration, easing: SETTLE });
    }, delay);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay]);

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** The offline/outbox dot. Opacity 1 → .45 → 1, forever, on the UI thread. */
export function Pulse({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const o = useSharedValue(1);

  useEffect(() => {
    o.value = withRepeat(
      withSequence(
        withTiming(0.45, { duration: motion.pulse.duration / 2, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: motion.pulse.duration / 2, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(o);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animated = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/**
 * A one-shot pop, for the moment a set is ticked.
 *
 * Overshoots to 1.12 and settles. Short enough (260ms total) to keep up with someone
 * ticking four sets in a row without the animations queueing up behind them.
 */
export function usePop() {
  const s = useSharedValue(1);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));

  const pop = () => {
    s.value = withSequence(
      withTiming(1.12, { duration: 110, easing: PRESS }),
      withTiming(1, { duration: 150, easing: SETTLE }),
    );
  };

  return { style, pop };
}

export { Animated, SETTLE as SETTLE_EASING, PRESS as PRESS_EASING };
