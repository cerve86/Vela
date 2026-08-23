import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendMagicLink, verifyEmailOtp } from '@vela/api';
import { Body, Button, Card, Display, Screen } from '@/components/kit';
import { VelaMark } from '@/components/VelaMark';
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
  /** Whether an email actually went out, so the copy on the code step can stay truthful. */
  const [sent, setSent] = useState(false);

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
      // Failing the send used to strand anyone who already had a code: the field for it
      // only appeared on success, so a working code had nowhere to be typed. Show the
      // error, and leave the way through open.
      setError(err);
      setStage('email');
    } else {
      setSent(true);
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

    /**
     * A correct code is not the same as a way in.
     *
     * The routing gate also requires a client row, and an address whose invitation was
     * never redeemed has none. In that case the gate redirects to sign-in — the screen
     * already on display — so nothing moves, and this function used to return leaving the
     * button reading "Verifying…" for ever, with no error and no way back. Waiting on the
     * refreshed value rather than a re-render is what lets us tell the two apart.
     */
    const next = await refresh();
    if (!next.client) {
      setStage('code');
      setError(
        'That code was right, but this address is not set up as a client yet. Accept your invitation first, or ask your physiotherapist to send a new one.',
      );
    }
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
          <VelaMark size={44} radius={15} />
          <Display size={32} style={{ marginTop: t.space.lg }}>
            Welcome back
          </Display>
          <Body size={14} color={t.textSecondary} style={{ marginTop: 4 }}>
            {stage === 'code' || stage === 'verifying'
              ? // Only claim to have sent something when we actually did. Arriving here via
                // "I already have a code" means no email went out on this attempt.
                sent
                ? `We sent a six-digit code to ${email}`
                : `Enter the six-digit code for ${email}`
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
                setSent(false);
                setError(null);
              }}
            />
          </>
        ) : (
          <>
            <Button
              label={stage === 'sending' ? 'Sending…' : 'Email me a code'}
              disabled={email.length < 5 || stage === 'sending'}
              onPress={send}
            />
            {/*
              The way in for anyone already holding a code — from an earlier email, or read
              out to them. Without it, a client whose send fails is locked out even with a
              perfectly valid code in front of her, because the field never appears.
            */}
            <Button
              label="I already have a code"
              variant="secondary"
              disabled={email.length < 5}
              onPress={() => {
                setError(null);
                setStage('code');
              }}
            />
          </>
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
