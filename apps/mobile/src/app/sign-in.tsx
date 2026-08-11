import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendMagicLink, verifyEmailOtp } from '@vela/api';
import { Body, Button, Card, Display, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';

/**
 * Returning-client sign in.
 *
 * A six-digit code rather than a tapped link: on a phone, a link can open in whichever
 * browser the OS prefers, which strands the PKCE verifier in the app and fails. Typing
 * the code keeps the whole exchange inside the app, on one device.
 */
export default function SignInScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useSession();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code' | 'sending' | 'verifying'>('email');
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setStage('sending');
    setError(null);
    // shouldCreateUser: false — an account only ever comes into being by accepting an
    // invitation, never by typing an address into this screen.
    const { error: err } = await sendMagicLink(supabase, email, {
      redirectTo: 'vela://auth-callback',
      shouldCreateUser: false,
    });
    if (err) {
      setError(err);
      setStage('email');
    } else {
      setStage('code');
    }
  }

  async function verify() {
    setStage('verifying');
    setError(null);
    const { error: err } = await verifyEmailOtp(supabase, email, code);
    if (err) {
      setError(err);
      setStage('code');
      return;
    }
    await refresh();
  }

  const inputStyle = {
    backgroundColor: t.inputFill,
    borderRadius: t.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: t.textPrimary,
    fontSize: 16,
    fontFamily: t.font.medium,
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: insets.top + t.space.xxl,
          gap: t.space.lg,
        }}
      >
        <View>
          <Display size={32}>Welcome back</Display>
          <Body size={14} color={t.textSecondary} style={{ marginTop: 4 }}>
            {stage === 'code' || stage === 'verifying'
              ? `We sent a six-digit code to ${email}`
              : 'Sign in with the email your physiotherapist invited'}
          </Body>
        </View>

        <Card>
          {stage === 'code' || stage === 'verifying' ? (
            <>
              <Body size={12} color={t.textMuted} style={{ marginBottom: 8 }}>
                VERIFICATION CODE
              </Body>
              <TextInput
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                textContentType="oneTimeCode"
                accessibilityLabel="Six digit verification code"
                style={[inputStyle, { fontSize: 24, letterSpacing: 8, textAlign: 'center' }]}
              />
            </>
          ) : (
            <>
              <Body size={12} color={t.textMuted} style={{ marginBottom: 8 }}>
                EMAIL ADDRESS
              </Body>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholder="you@example.com"
                placeholderTextColor={t.textMuted}
                accessibilityLabel="Email address"
                style={inputStyle}
              />
            </>
          )}

          {error && (
            <Body size={13} color={t.status.critical} style={{ marginTop: 12 }}>
              {error}
            </Body>
          )}
        </Card>

        {stage === 'code' || stage === 'verifying' ? (
          <>
            <Button
              label={stage === 'verifying' ? 'Verifying…' : 'Sign in'}
              disabled={code.length < 6 || stage === 'verifying'}
              onPress={verify}
            />
            <Button
              label="Use a different email"
              variant="secondary"
              onPress={() => {
                setStage('email');
                setCode('');
              }}
            />
          </>
        ) : (
          <Button
            label={stage === 'sending' ? 'Sending…' : 'Email me a code'}
            disabled={email.length < 5 || stage === 'sending'}
            onPress={send}
          />
        )}

        <Button
          label="I have an invitation"
          variant="secondary"
          onPress={() => router.replace('/invite')}
        />

        <Body size={11} color={t.textMuted} style={{ textAlign: 'center', lineHeight: 16 }}>
          Vela supports your treatment — it is not a medical device and does not
          provide diagnosis.
        </Body>
      </ScrollView>
    </Screen>
  );
}
