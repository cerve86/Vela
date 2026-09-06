import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Image, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { VideoView, useVideoPlayer, type VideoSource } from 'expo-video';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/theme';
import { onCelebrate, recentCelebration, type CheerKind } from '@/lib/mascot';

export type MascotMood = 'greeting' | 'sleep' | 'celebration' | 'healthy' | 'sit';

/**
 * The scenes. Each is a short square clip cut from the mascot films, and a still of the
 * same pose for when motion is reduced. Both live in assets/vela-mascot-poses. `sleep` is
 * the panda curled up asleep, for a day trending below the mark; `sit` is the panda
 * settled and content, for a session done.
 */
const CLIPS: Record<MascotMood, VideoSource> = {
  greeting: require('../../assets/vela-mascot-poses/greeting.mp4'),
  sleep: require('../../assets/vela-mascot-poses/sleep.mp4'),
  celebration: require('../../assets/vela-mascot-poses/celebration.mp4'),
  healthy: require('../../assets/vela-mascot-poses/healthy.mp4'),
  sit: require('../../assets/vela-mascot-poses/sit.mp4'),
};
const STILLS: Record<MascotMood, number> = {
  greeting: require('../../assets/vela-mascot-poses/greeting.png'),
  sleep: require('../../assets/vela-mascot-poses/sleep.png'),
  celebration: require('../../assets/vela-mascot-poses/celebration.png'),
  healthy: require('../../assets/vela-mascot-poses/healthy.png'),
  sit: require('../../assets/vela-mascot-poses/sit.png'),
};

const IDLE_STIR_MS = 24_000;
/** How long a cheer stays up, whatever its clip's length: enough to be seen, never a loop. */
const CHEER_HOLD_MS = 2_500;

const CHEER_POSE: Record<CheerKind, MascotMood> = {
  food: 'healthy',
  session: 'sit',
  read: 'celebration',
  strava: 'sit',
};

/**
 * The mascot: a short film of the pose the day calls for, looping quietly in a round
 * window, and a different scene when something happens.
 *
 * `mood` is the idle scene — waving by default, asleep when the day is trending below the
 * mark. A cheer from anywhere in the app plays that moment's scene once and hands back to
 * the idle scene when it ends: an apple for a meal logged, arms up for a read given, and
 * the panda settling down, content, for a training done (logged here or imported from
 * Strava). A few seconds, then calm. With Reduce Motion on, the still of the same pose is
 * shown instead.
 */
export function Mascot({ mood, size = 168 }: { mood: MascotMood; size?: number }) {
  const reduced = useReducedMotion();
  const [cheer, setCheer] = useState<CheerKind | null>(null);
  const cheerStartedAt = useRef(0);
  const pose: MascotMood = cheer ? CHEER_POSE[cheer] : mood;

  // One player for the life of the mascot. expo-video builds a new player whenever the
  // source it was given changes, and a mood change landing in the same moment as a cheer
  // then replaced the cheering player with an idle one, mid-cheer. So the player is made
  // once, with the scene the mascot first appeared in, and every change after that goes
  // through `replaceAsync` below.
  const [firstScene] = useState<MascotMood>(() => mood);
  const player = useVideoPlayer(CLIPS[firstScene], (p) => {
    p.loop = false;
    p.muted = true;
    p.play();
  });

  // Scene changes. Every scene plays once and rests on its last frame — a film on a loop
  // is a fidget, and the mascot is company, not a screensaver. The idle scene stirs again
  // on its own every so often. The source is only replaced when the scene actually
  // changes; replacing it with itself restarts the load and parks the player on frame one.
  const current = useRef<MascotMood>(firstScene);
  useEffect(() => {
    player.loop = false;
    if (current.current === pose) {
      player.replay();
      return;
    }
    current.current = pose;
    let cancelled = false;
    void player.replaceAsync(CLIPS[pose]).then(() => {
      if (!cancelled) player.play();
    });
    return () => {
      cancelled = true;
    };
  }, [player, pose]);

  useEffect(() => {
    if (cheer !== null) return;
    const stir = setInterval(() => player.replay(), IDLE_STIR_MS);
    return () => clearInterval(stir);
  }, [player, cheer]);

  // Play when ready, whatever the timing of play() against the load; a cheer hands back
  // to the idle scene when its clip ends — resting on its last frame first if the clip was
  // shorter than a cheer should be, so a moment is a moment and not a flicker.
  useEffect(() => {
    const ready = player.addListener('statusChange', ({ status }) => {
      if (status === 'readyToPlay' && !player.playing) player.play();
    });
    let hold: ReturnType<typeof setTimeout> | null = null;
    const ended = player.addListener('playToEnd', () => {
      if (cheer === null) return;
      const left = CHEER_HOLD_MS - (Date.now() - cheerStartedAt.current);
      hold = setTimeout(() => setCheer(null), Math.max(0, left));
    });
    return () => {
      ready.remove();
      ended.remove();
      if (hold) clearTimeout(hold);
    };
  }, [player, cheer]);

  const startCheer = (kind: CheerKind) => {
    cheerStartedAt.current = Date.now();
    setCheer(kind);
  };
  useEffect(() => {
    const recent = recentCelebration();
    if (recent) startCheer(recent);
    return onCelebrate(startCheer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const label =
    pose === 'celebration'
      ? 'Vela cheering'
      : pose === 'healthy'
        ? 'Vela with an apple'
        : pose === 'sit'
          ? 'Vela sitting down, pleased'
          : pose === 'sleep'
            ? 'Vela asleep'
            : 'Vela waving';

  if (reduced) {
    return (
      <Image
        source={STILLS[pose]}
        accessibilityLabel={label}
        style={{ width: size, height: size }}
        resizeMode="contain"
      />
    );
  }

  return (
    <View
      accessibilityLabel={label}
      style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}
    >
      <VideoView
        player={player}
        style={{ width: size, height: size }}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
    </View>
  );
}

/**
 * The trend gauge: one arc over the mascot, from eight o'clock over the top to four, with
 * a mark at the top. The fill runs to where the day sits; above the mark it is green and
 * the mascot is up for it, below it is orange and the mascot is asleep. Only the filled
 * part is drawn: the arc is how far the day has come, not a scale with an end. Nothing
 * read yet: a knob at the start and no arc. No words on it — the sentence underneath does
 * the explaining.
 */
const GAUGE_START = 150;
const GAUGE_SWEEP = 240;
const GAP = 4; // degrees either side of the top mark

export function TrendGauge({
  value,
  tone,
  size = 250,
  stroke = 10,
  children,
}: {
  /** 0–1, or null before anything is known. */
  value: number | null;
  tone: string;
  size?: number;
  stroke?: number;
  children: ReactNode;
}) {
  const t = useTheme();
  const r = size / 2 - stroke;
  const c = size / 2;
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  const mid = GAUGE_START + GAUGE_SWEEP / 2; // the top

  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: c + r * Math.cos(rad), y: c + r * Math.sin(rad) };
  };
  const arc = (from: number, to: number) => {
    if (to - from < 0.5) return '';
    const a = point(from);
    const b = point(to);
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
  };
  const end = GAUGE_START + GAUGE_SWEEP * v;
  const knob = point(end);
  const segments = (from: number, to: number) =>
    to <= mid - GAP
      ? [[from, to]]
      : from >= mid + GAP
        ? [[from, to]]
        : [
            [from, Math.min(to, mid - GAP)],
            [Math.max(from, mid + GAP), to],
          ];

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {v > 0.005 &&
          segments(GAUGE_START, end).map(([f, to]) => (
            <Path
              key={`f${f}`}
              d={arc(f, to)}
              stroke={tone}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
            />
          ))}
        <Circle
          cx={knob.x}
          cy={knob.y}
          r={stroke * 1.1}
          fill={t.surface}
          stroke={value === null ? t.textMuted : tone}
          strokeWidth={stroke * 0.6}
        />
      </Svg>
      {children}
    </View>
  );
}
