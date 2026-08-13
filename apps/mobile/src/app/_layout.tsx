import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Outfit_600SemiBold, Outfit_700Bold, Outfit_800ExtraBold } from '@expo-google-fonts/outfit';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { SessionProvider, useSession } from '@/lib/session';
import { palette } from '@vela/shared/tokens';

SplashScreen.preventAutoHideAsync();

/**
 * Routing gate. Three states, in order:
 *   no session            → sign-in (or the invite screen, which is public by design)
 *   session, no consent   → consent
 *   session and consent   → the app
 */
function Gate() {
  const { loading, session, client, hasConsent } = useSession();
  const segments = useSegments();
  const router = useRouter();

  const route = segments[0] ?? '';
  const onInvite = route === 'invite';
  const onSignIn = route === 'sign-in';
  const onConsent = route === 'consent';
  const onAuthCallback = route === 'auth-callback';

  useEffect(() => {
    if (loading) return;

    // The invite screen must stay reachable while signed out — it is how an account
    // comes into existence in the first place.
    if (onInvite) return;

    // Likewise the deep-link callback: it arrives with no session precisely because it
    // is the thing that creates one. Redirecting to sign-in here would throw away the
    // one-time code before it could be exchanged.
    if (onAuthCallback) return;

    if (!session) {
      if (!onSignIn) router.replace('/sign-in');
      return;
    }

    // Signed in but no client row means the invite was never redeemed.
    if (!client) {
      if (!onSignIn) router.replace('/sign-in');
      return;
    }

    if (!hasConsent) {
      if (!onConsent) router.replace('/consent');
      return;
    }

    if (onSignIn || onConsent) router.replace('/');
  }, [loading, session, client, hasConsent, onInvite, onSignIn, onConsent, onAuthCallback, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={palette.brand[600]} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="auth-callback" />
      <Stack.Screen name="invite" />
      <Stack.Screen name="consent" />
      <Stack.Screen name="readiness" options={{ presentation: 'modal' }} />
      <Stack.Screen name="health" options={{ presentation: 'modal' }} />
      <Stack.Screen name="session/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="food/add" options={{ presentation: 'modal' }} />
      <Stack.Screen name="food/scan" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();

  const [loaded] = useFonts({
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
