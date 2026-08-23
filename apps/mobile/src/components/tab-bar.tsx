import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  FadeIn,
  LinearTransition,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { motion } from '@vela/shared/tokens';
import { useTheme } from '@/theme';
import { useUnreadFromCoach } from '@/lib/unread';

/**
 * What the bar needs from the navigator, declared rather than imported.
 *
 * `BottomTabBarProps` lives at `expo-router/build/react-navigation/bottom-tabs`, and
 * expo-router publishes no subpath for it — importing through `build/` would bind this file
 * to the shape of somebody else's compiled output. Four fields is a small enough contract to
 * state outright, and stating it documents exactly how much of the navigator this bar
 * depends on.
 */
interface TabBarProps {
  state: {
    index: number;
    routes: { key: string; name: string }[];
  };
  navigation: {
    emit(event: {
      type: 'tabPress';
      target: string;
      canPreventDefault: true;
    }): { defaultPrevented: boolean };
    navigate(name: string): void;
  };
}

/**
 * The floating tab bar from the redesign.
 *
 * A dark pill hovering over the content rather than a bar welded to the bottom edge, and the
 * selected tab expands into a labelled white pill while the others stay as icons. That last
 * part is the idea: four labels at once is four words competing for attention on every
 * screen, and the only label anybody needs is the one naming where they already are.
 *
 * Built as a custom `tabBar` rather than through `screenOptions`, because none of this is
 * expressible there — the active item changes shape rather than just colour, and the bar
 * floats clear of the safe area instead of filling it.
 */
export function VelaTabBar({ state, navigation }: TabBarProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const unread = useUnreadFromCoach();

  return (
    <View
      // box-none so the gap either side of the pill does not swallow taps meant for the
      // content scrolling underneath it.
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: Math.max(insets.bottom, 10) + 16,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          padding: 6,
          borderRadius: 999,
          // The prototype blurs its backdrop. Rather than add expo-blur for one surface,
          // the fill carries itself: at 0.92 over scrolling content it reads as a solid
          // object, which is what the design's shadow and inset highlight assume anyway.
          backgroundColor: t.dark ? 'rgba(6,10,24,0.94)' : 'rgba(18,23,43,0.92)',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.14)',
          shadowColor: '#12172B',
          shadowOpacity: 0.28,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 12 },
          elevation: 12,
        }}
      >
        {state.routes.map((route, index) => {
          const spec = TABS[route.name];
          if (!spec) return null;

          return (
            <TabItem
              key={route.key}
              label={spec.label}
              glyph={spec.glyph}
              focused={state.index === index}
              badge={spec.glyph === 'profile' && unread > 0 ? 'unread' : undefined}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (state.index !== index && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

type GlyphName = 'today' | 'progress' | 'fuel' | 'profile';

/** Route name → what the bar shows. "Fuel" rather than "Nutrition", per the design. */
const TABS: Record<string, { label: string; glyph: GlyphName }> = {
  index: { label: 'Today', glyph: 'today' },
  progress: { label: 'Progress', glyph: 'progress' },
  nutrition: { label: 'Fuel', glyph: 'fuel' },
  profile: { label: 'Profile', glyph: 'profile' },
};

/** Badge tones, from the prototype: amber wants attention, blue is merely waiting. */
const BADGE_FILL: Record<string, string> = {
  attention: '#E8A200',
  unread: '#1B4FD8',
};

function TabItem({
  label,
  glyph,
  focused,
  badge,
  onPress,
}: {
  label: string;
  glyph: GlyphName;
  focused: boolean;
  badge?: 'attention' | 'unread';
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const f = useSharedValue(focused ? 1 : 0);
  const press = useSharedValue(1);

  useEffect(() => {
    f.value = withTiming(focused ? 1 : 0, {
      duration: reduced ? 0 : motion.tab.fill,
      easing: Easing.bezier(0.2, 0.8, 0.25, 1),
    });
    return () => cancelAnimation(f);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, reduced]);

  /**
   * Fill and padding animate together, so the pill opens around its label rather than
   * snapping to a new size. Padding is a layout property and costs a layout pass per frame,
   * which is affordable for one 44px row that only moves on a tab change.
   */
  const shell = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(f.value, [0, 1], ['rgba(255,255,255,0)', '#FFFFFF']),
    paddingLeft: interpolate(f.value, [0, 1], [12, 13]),
    paddingRight: interpolate(f.value, [0, 1], [12, 16]),
    transform: [{ scale: press.value }],
  }));

  const ink = focused ? '#1B4FD8' : 'rgba(255,255,255,0.72)';

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => {
        press.value = withTiming(reduced ? 1 : 0.94, {
          duration: motion.press.duration,
          easing: Easing.bezier(0.2, 0.7, 0.3, 1),
        });
      }}
      onPressOut={() => {
        press.value = withTiming(1, {
          duration: motion.press.duration,
          easing: Easing.bezier(0.2, 0.7, 0.3, 1),
        });
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      // The label is hidden on unfocused tabs, so it has to be spoken instead — otherwise
      // three of the four tabs announce themselves as an unnamed button.
      accessibilityLabel={badge === 'unread' ? `${label}, unread message` : label}
      layout={reduced ? undefined : LinearTransition.duration(motion.tab.pad)}
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 7, height: 44, borderRadius: 999 },
        shell,
      ]}
    >
      <View>
        <TabGlyph name={glyph} color={ink} weight={focused ? 2.6 : 2} />
        {badge ? (
          <View
            style={{
              position: 'absolute',
              top: -3,
              right: -4,
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: BADGE_FILL[badge],
            }}
          />
        ) : null}
      </View>

      {focused ? (
        <Animated.Text
          entering={reduced ? undefined : FadeIn.duration(160)}
          style={{ fontSize: 13.5, fontWeight: '500', color: ink }}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>
      ) : null}
    </AnimatedPressable>
  );
}

/**
 * Icons lifted path-for-path from the prototype rather than matched to the nearest Lucide
 * shape. Two of the four have no Lucide equivalent — the progress glyph is a bare mountain
 * polyline, the fuel glyph a battery with a bolt through it — and substituting approximations
 * is how an interface stops looking drawn on purpose.
 */
function TabGlyph({ name, color, weight }: { name: GlyphName; color: string; weight: number }) {
  const line = {
    stroke: color,
    strokeWidth: weight,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={21} height={21} viewBox="0 0 24 24">
      {name === 'today' && (
        <>
          <Path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" {...line} />
          <Path
            d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
            {...line}
          />
        </>
      )}
      {name === 'progress' && <Path d="M3 17 9 8l4 5 3-4 5 8" {...line} />}
      {name === 'fuel' && (
        <>
          <Rect x={2} y={7} width={17} height={10} rx={3} {...line} />
          <Path d="M22 11v2" {...line} />
          <Path d="M11 9.5 8.4 13h2.6l-.4 2.6L13.6 12H11l.6-2.5Z" {...line} />
        </>
      )}
      {name === 'profile' && (
        <>
          <Circle cx={12} cy={8.5} r={3.6} {...line} />
          <Path d="M5 20c1.2-3.4 4-5 7-5s5.8 1.6 7 5" {...line} />
        </>
      )}
    </Svg>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
