import { useEffect } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Screen } from '@/components/kit';

/**
 * Landing point for `vela://strava`, where the portal sends the phone after Strava.
 *
 * The connect flow already reads the result from the auth session it opened; this
 * route exists so the same URL, arriving as a plain deep link, lands somewhere sensible
 * rather than on "Unmatched Route". Profile is where the connection is shown.
 */
export default function StravaReturn() {
  const router = useRouter();
  const params = useLocalSearchParams<{ connected?: string; error?: string }>();
  useEffect(() => {
    router.replace({
      pathname: '/profile',
      params: { strava: params.error ? `error:${params.error}` : 'connected' },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    </Screen>
  );
}
