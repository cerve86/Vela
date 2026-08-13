import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { Body, Button, Card, Display, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';

/**
 * Landing point for `vela://auth-callback`.
 *
 * The sign-in screen leads with a typed code, which is the flow that works when the
 * email is opened on a different device. This route exists for the other case: the link
 * in the same email, tapped on the same phone. Without it expo-router matched nothing
 * and the sign-in ended on "Unmatched Route" with the code sitting in the URL.
 *
 * The PKCE verifier lives in this app's storage, so the exchange only succeeds here —
 * which is exactly why the code alone is useless to anyone who intercepts the email.
 */
export default function AuthCallbackScreen() {
  const t = useTheme();
  const router = useRouter();
  const { refresh } = useSession();
  const params = useLocalSearchParams<{
    code?: string;
    error_description?: string;
    token_hash?: string;
    type?: string;
  }>();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (params.error_description) {
        setError(String(params.error_description));
        return;
      }

      if (params.code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          String(params.code),
        );
        if (cancelled) return;
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }
      } else if (params.token_hash) {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: String(params.token_hash),
          type: (params.type as 'magiclink') ?? 'magiclink',
        });
        if (cancelled) return;
        if (otpError) {
          setError(otpError.message);
          return;
        }
      } else {
        setError('That link is missing its sign-in code.');
        return;
      }

      // The root layout routes on session state, so refreshing is the whole navigation.
      await refresh();
      if (!cancelled) router.replace('/');
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.code, params.token_hash, params.error_description]);

  if (error) {
    return (
      <Screen>
        <View style={{ flex: 1, justifyContent: 'center', padding: t.space.lg, gap: t.space.md }}>
          <Display size={28}>That link didn&apos;t work</Display>
          <Card>
            <Body size={14} color={t.textSecondary} style={{ lineHeight: 20 }}>
              {error}
            </Body>
            <Body size={13} color={t.textMuted} style={{ marginTop: t.space.md, lineHeight: 19 }}>
              Sign-in links can only be used once, and expire after an hour. Ask for a new
              code and type the six digits instead — that works even when the email is on
              another device.
            </Body>
          </Card>
          <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: t.space.md }}>
        <ActivityIndicator color={t.brand[600]} />
        <Body size={14} color={t.textSecondary}>
          Signing you in…
        </Body>
      </View>
    </Screen>
  );
}
