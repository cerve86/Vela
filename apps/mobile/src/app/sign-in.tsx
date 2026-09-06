import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { requestPasswordReset, signInWithPassword } from '@vela/api';
import { Body, Button, Card, Display, Screen } from '@/components/kit';
import { VelaMark } from '@/components/VelaMark';
import { useTheme } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import { PORTAL_URL } from '@/lib/integrations';

/**
 * Sign in: email and password, nothing else.
 *
 * An account comes into being through an invitation email, whose link leads to a page
 * where the client chooses her password — so by the time she is here she has one. There
 * is no sign-up and no emailed code: codes typed back and forth between a mailbox and a
 * phone were the thing people got stuck on. "Forgot your password?" sends a link to the
 * same page the invitation did.
 */
export default function SignInScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { refresh } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'signing' | 'resetting' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function signIn() {
    setBusy('signing');
    setError(null);
    setNotice(null);

    const { error: err } = await signInWithPassword(supabase, email, password);
    if (err) {
      setError(
        'That email and password did not match. Check them, or use “Forgot your password?”.',
      );
      setBusy(null);
      return;
    }

    // A valid password is not the same as a way in: the gate also needs a client row, and
    // the session loader accepts a pending invitation on the way. If there is neither,
    // say so here rather than leaving the button spinning.
    const next = await refresh();
    if (!next.client) {
      setBusy(null);
      setError(
        next.acceptError
          ? `Those details worked, but joining your physiotherapist's practice failed: ${next.acceptError}`
          : 'Those details worked, but there is no invitation waiting for this address. Ask your physiotherapist to invite you.',
      );
    }
  }

  async function forgot() {
    if (email.length < 5) {
      setError('Enter your email address first.');
      return;
    }
    setBusy('resetting');
    setError(null);
    const { error: err } = await requestPasswordReset(supabase, email, `${PORTAL_URL}/welcome`);
    setBusy(null);
    if (err) setError(err);
    else
      setNotice(
        `We emailed ${email.trim()} a link to choose a new password. Open it, then come back here.`,
      );
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
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: insets.top + 32,
          paddingHorizontal: t.space.xl,
          paddingBottom: 40,
          gap: 14,
        }}
      >
        <VelaMark size={44} radius={14} />
        <Display size={32} style={{ marginTop: 20 }}>
          Welcome back
        </Display>
        <Body size={14.5} color={t.textSecondary} style={{ marginTop: -6 }}>
          Sign in with the email your physiotherapist invited and the password you chose.
        </Body>

        <Card style={{ borderRadius: 22 }}>
          <Body size={11} weight="medium" color={t.textSecondary} style={{ letterSpacing: 0.5 }}>
            EMAIL ADDRESS
          </Body>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={t.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            style={[inputStyle, { marginTop: 8 }]}
          />
          <Body
            size={11}
            weight="medium"
            color={t.textSecondary}
            style={{ letterSpacing: 0.5, marginTop: 16 }}
          >
            PASSWORD
          </Body>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={t.textMuted}
            secureTextEntry
            textContentType="password"
            autoComplete="password"
            onSubmitEditing={signIn}
            style={[inputStyle, { marginTop: 8 }]}
          />
          {error && (
            <Body size={13.5} color={t.status.critical} style={{ marginTop: 12, lineHeight: 19 }}>
              {error}
            </Body>
          )}
          {notice && (
            <Body size={13.5} color={t.textSecondary} style={{ marginTop: 12, lineHeight: 19 }}>
              {notice}
            </Body>
          )}
        </Card>

        <Button
          label={busy === 'signing' ? 'Signing in…' : 'Sign in'}
          disabled={email.length < 5 || password.length < 8 || busy !== null}
          onPress={signIn}
        />
        <Button
          label={busy === 'resetting' ? 'Sending…' : 'Forgot your password?'}
          variant="secondary"
          disabled={busy !== null}
          onPress={forgot}
        />

        <Body
          size={12}
          color={t.textMuted}
          style={{ textAlign: 'center', marginTop: 8, lineHeight: 17 }}
        >
          New to Vela? Your physiotherapist sends the invitation; the link in it is where you choose
          your password. Vela supports your treatment — it is not a medical device and does not
          provide diagnosis.
        </Body>
      </ScrollView>
    </Screen>
  );
}
