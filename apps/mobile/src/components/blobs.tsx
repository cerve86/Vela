import { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path } from 'react-native-svg';
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { blobMotion } from '@vela/shared/tokens';
import type { MilestoneCharacter } from '@vela/shared';

/**
 * The blob cast, as specified in the design handoff's illustration system.
 *
 * One flat fill shape with no outline on the body, thin #12172B monoline features drawn on
 * top. Blue is reserved for buttons, so no character is ever blue: green trains, amber
 * feeds, violet recovers, and the colour is the fastest read on the tile.
 *
 * Animation runs on the wrapping view's transform rather than on SVG groups. It gets the
 * same result — `transformOrigin: 'center bottom'` is exactly the handoff's `46px 72px` on a
 * 92×72 stage — while keeping every frame on Reanimated's fast path instead of pushing
 * animated props through the SVG bridge. Nothing in these tiles needs the parts to move
 * independently of the body, which is the only thing that approach would buy.
 */

type BlobState =
  /** Earned, and recently. Hops, with motes. */
  | 'fresh'
  /** Earned a while ago. Drifts at full strength. */
  | 'earned'
  /** Not earned. Drifts slowly, dimmed — present but plainly not lit up. */
  | 'dormant';

const STAGE = { w: 92, h: 72 };

export function MilestoneBlob({
  character,
  state,
  index = 0,
  width = 86,
}: {
  character: MilestoneCharacter;
  state: BlobState;
  /** Position in the row, which sets the loop delay so tiles never move in lockstep. */
  index?: number;
  width?: number;
}) {
  const reduced = useReducedMotion();
  const height = Math.round((width * STAGE.h) / STAGE.w);

  // One driver, 0 → 1 → 0 for a float or 0 → 1 for a hop cycle, so translate, tilt and
  // squash all read off the same clock and cannot drift apart.
  const p = useSharedValue(0);
  const entry = useSharedValue(state === 'dormant' ? 1 : 0);

  const hopping = state === 'fresh';
  const delay = blobMotion.stagger[index % blobMotion.stagger.length] ?? 0;

  useEffect(() => {
    if (reduced) {
      p.value = 0;
      entry.value = 1;
      return;
    }

    /**
     * The pop is an entrance and hands off to the loop. It runs only for a milestone that
     * has actually been earned — popping a dormant tile into view would announce something
     * that has not happened.
     */
    if (state !== 'dormant') {
      entry.value = withDelay(
        delay,
        withTiming(1, { duration: blobMotion.pop.duration, easing: Easing.bezier(0.2, 0.9, 0.3, 1) }),
      );
    } else {
      entry.value = 1;
    }

    const duration = hopping
      ? blobMotion.hop.duration
      : state === 'dormant'
        ? blobMotion.dormant.duration
        : blobMotion.float.duration;

    p.value = 0;
    p.value = withDelay(
      delay,
      withRepeat(
        hopping
          ? // A hop is a full cycle of its own keyframe table, so it runs 0 → 1 and restarts.
            withTiming(1, { duration, easing: Easing.linear })
          : // A float is symmetric: out and back, eased at both ends.
            withSequence(
              withTiming(1, { duration: duration / 2, easing: Easing.inOut(Easing.ease) }),
              withTiming(0, { duration: duration / 2, easing: Easing.inOut(Easing.ease) }),
            ),
        -1,
        false,
      ),
    );

    return () => {
      cancelAnimation(p);
      cancelAnimation(entry);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, reduced, hopping, delay]);

  const animated = useAnimatedStyle(() => {
    if (hopping) {
      // The handoff's bHop table, verbatim: squash, rise, overshoot, settle.
      const stops = [0, 0.14, 0.44, 0.74, 0.88, 1];
      return {
        opacity: entry.value,
        transform: [
          { translateY: interpolate(p.value, stops, [0, 0, -blobMotion.hop.lift, 0, 0, 0]) },
          { scaleX: interpolate(p.value, stops, [1, 1.05, 0.97, 1.04, 1, 1]) },
          { scaleY: interpolate(p.value, stops, [1, 0.93, 1.05, 0.95, 1, 1]) },
        ],
      };
    }

    // bFloat, plus the pop's scale and rotation on the way in.
    const popScale = interpolate(entry.value, [0, 0.6, 1], [blobMotion.pop.from, blobMotion.pop.overshoot, 1]);
    const popTurn = interpolate(entry.value, [0, 0.6, 1], [blobMotion.pop.rotate, 4, 0]);

    return {
      opacity: entry.value * (state === 'dormant' ? blobMotion.dormant.opacity : 1),
      transform: [
        { translateY: -p.value * blobMotion.float.lift },
        {
          rotate: `${popTurn + interpolate(p.value, [0, 1], [-blobMotion.float.tilt, blobMotion.float.tilt])}deg`,
        },
        { scale: popScale },
      ],
    };
  });

  return (
    <View style={{ width, height, justifyContent: 'flex-end' }}>
      {state === 'fresh' && !reduced ? <Motes width={width} /> : null}

      <Animated.View style={[{ transformOrigin: 'center bottom' }, animated]}>
        <Svg width={width} height={height} viewBox={`0 0 ${STAGE.w} ${STAGE.h}`}>
          {character === 'athlete' && <Athlete id={`ms-a-${index}`} />}
          {character === 'star' && <Star id={`ms-s-${index}`} />}
          {character === 'cloud' && <Cloud id={`ms-c-${index}`} />}
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * Celebration motes — amber with one violet, rising and fading, staggered.
 *
 * Absolutely positioned views rather than SVG circles so they animate on the same fast path
 * as the character. They exist only in the `fresh` state; a mote on an unearned tile would
 * be confetti for nothing.
 */
function Motes({ width }: { width: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 40 }}>
      {[
        { x: 0.22, fill: '#E8A200', i: 0 },
        { x: 0.54, fill: '#7C3AED', i: 1 },
        { x: 0.78, fill: '#E8A200', i: 2 },
      ].map((m) => (
        <Mote key={m.i} left={m.x * width} fill={m.fill} delay={blobMotion.mote.stagger[m.i] ?? 0} />
      ))}
    </View>
  );
}

function Mote({ left, fill, delay }: { left: number; fill: string; delay: number }) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: blobMotion.mote.duration, easing: Easing.out(Easing.ease) }), -1, false),
    );
    return () => cancelAnimation(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delay]);

  const style = useAnimatedStyle(() => ({
    // Up and out: visible for the middle of its life, gone at both ends.
    opacity: interpolate(p.value, [0, 0.3, 1], [0, 1, 0]),
    transform: [
      { translateY: interpolate(p.value, [0, 1], [8, -blobMotion.mote.rise]) },
      { scale: interpolate(p.value, [0, 1], [0.5, 1]) },
    ],
  }));

  return (
    <Animated.View
      style={[
        { position: 'absolute', left, top: 22, width: 5.5, height: 5.5, borderRadius: 3, backgroundColor: fill },
        style,
      ]}
    />
  );
}

/* ─────────────────────────────────────────────────────────────
 * The cast. Geometry lifted from the handoff at 92 × 72.
 *
 * Every clipPath id is suffixed per instance: the prototypes reuse fixed ids, and three
 * characters on one screen sharing an id means the last one defined wins and two of the
 * three lose their headbands.
 * ───────────────────────────────────────────────────────────── */

const INK = '#12172B';

/** Training. Headband blob with one raised arm and a mitten hand. */
function Athlete({ id }: { id: string }) {
  return (
    <>
      <Defs>
        <ClipPath id={id}>
          <Ellipse cx={46} cy={42} rx={28} ry={31} />
        </ClipPath>
      </Defs>

      <G stroke={INK} strokeWidth={1.5} strokeLinecap="round" fill="none">
        <Path d="M18 40 q-12 -3 -15 -12" />
        <Path d="M3 26 q-4 -3 -6 -1 q-1 2 2 3 q-4 1 -3 2 q1 2 4 1 q3 -1 3 -5Z" fill="#fff" />
      </G>

      <Ellipse cx={46} cy={42} rx={28} ry={31} fill="#0E9F6E" />

      <G clipPath={`url(#${id})`} stroke={INK} strokeWidth={1.7} strokeLinecap="round" fill="none">
        <Path d="M14 22 q32 -9 66 -2" />
        <Path d="M14 29 q32 -9 66 -2" />
      </G>

      <G stroke={INK} strokeWidth={1.8} strokeLinecap="round" fill="none">
        <Path d="M36 44 q3.5 -4 7 0" />
        <Path d="M51 44 q3.5 -4 7 0" />
        <Path d="M41 53 q5 6 10 0" />
      </G>
    </>
  );
}

const STAR_PATH =
  'M46 8 L54.5 30.3 L78.3 31.5 L59.8 46.5 L66 69.5 L46 56.5 L26 69.5 L32.2 46.5 L13.7 31.5 L37.5 30.3 Z';

/** Fuel. Ten-point star with speed lines — eyes and mouth only, no limbs. */
function Star({ id }: { id: string }) {
  return (
    <>
      <Defs>
        <ClipPath id={id}>
          <Path d={STAR_PATH} />
        </ClipPath>
      </Defs>

      <Path d={STAR_PATH} fill="#E8A200" />

      <G clipPath={`url(#${id})`} stroke={INK} strokeWidth={1.6} strokeLinecap="round" fill="none">
        <Path d="M20 31 q26 -6 54 -1" />
        <Path d="M20 35.5 q26 -6 54 -1" />
      </G>

      <G>
        <Circle cx={39} cy={43} r={2.4} fill={INK} />
        <Circle cx={53} cy={43} r={2.4} fill={INK} />
        <Path d="M41 50 q5 5 10 0" stroke={INK} strokeWidth={1.7} strokeLinecap="round" fill="none" />
      </G>

      <G stroke="#E8A200" strokeWidth={2} strokeLinecap="round" opacity={0.55}>
        <Path d="M6 44 H14" />
        <Path d="M2 51 H11" />
        <Path d="M7 58 H14" />
      </G>
    </>
  );
}

const CLOUD_PATH =
  'M32 20 q6 -13 18 -7 q10 -9 18 2 q13 -2 11 11 q11 6 4 16 q5 11 -8 13 q-4 11 -15 5 q-10 8 -17 -2 q-13 2 -11 -11 q-11 -6 -4 -15 q-6 -10 5 -12Z';

/** Symptoms and recovery. Lumpy cloud with a pale crescent highlight. */
function Cloud({ id }: { id: string }) {
  return (
    <>
      <Defs>
        <ClipPath id={id}>
          <Path d={CLOUD_PATH} />
        </ClipPath>
      </Defs>

      <Path d={CLOUD_PATH} fill="#7C3AED" />

      <G clipPath={`url(#${id})`}>
        <G stroke={INK} strokeWidth={1.6} strokeLinecap="round" fill="none">
          <Path d="M22 28 q26 -6 54 -1" />
          <Path d="M22 32.5 q26 -6 54 -1" />
        </G>
        <Path
          d="M62 36 q11 -3 14 4 q3 8 -3 14 q-4 4 -8 1 q5 -8 2 -13 q-2 -4 -5 -6Z"
          fill="#EDF1FB"
          stroke={INK}
          strokeWidth={1.4}
          strokeLinejoin="round"
        />
        <Path d="M66 42 q5 4 3 11" stroke="#8FAEFF" strokeWidth={1.3} fill="none" strokeLinecap="round" />
      </G>

      <G stroke={INK} strokeWidth={1.7} strokeLinecap="round" fill="none">
        <Path d="M35 41 q3.5 -4 7 0" />
        <Path d="M48 41 q3.5 -4 7 0" />
        <Path d="M39 50 q5 5 10 0" />
      </G>
    </>
  );
}
