import { Tabs } from 'expo-router';
import { VelaTabBar } from '@/components/tab-bar';

/**
 * Four tabs, no more. The client opens this app to do one thing — today's session — so
 * everything else stays one tap away but visually secondary.
 *
 * The bar itself is `VelaTabBar`: a floating dark pill in which the selected tab expands
 * into a labelled white pill. It replaces the stock bar wholesale rather than being styled
 * through `screenOptions`, because the active item changes shape and the bar hovers clear of
 * the safe area — neither of which `screenOptions` can express.
 *
 * `sceneStyle` keeps the screens' own backgrounds; the bar floats over them, so every screen
 * pads its scroll content past the pill rather than the bar reserving space.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <VelaTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress' }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Fuel' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
