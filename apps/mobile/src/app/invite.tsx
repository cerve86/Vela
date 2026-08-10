import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { acceptMyInvite, verifyInviteCode } from '@coachapp/api';
import { Body, Button, Card, Display, Pill, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';

type Stage = 'entry' | 'verifying' | 'accepting';

/**
 * Invitation acceptance.
 *
 * The client types the six-digit code from their invitation email. That single step
 * does three jobs: it proves they control the mailbox, it sets email_confirmed_at, and
 * it signs them in. Acceptance then links the account to the client row their coach
 * created — keyed on the verified address, so nothing secret needs to travel.
 *
 * Deliberately not a tapped link: the coach starts this in a browser and the client
 * finishes on a phone, and a link cannot carry a PKCE verifier across devices.
 */
export default function InviteScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useSession();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<Stage>('entry');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setStage('verifying');

    const { error: vErr } = await verifyInviteCode(supabase, email, code);
    if (vErr) {
      setError(
        vErr.toLowerCase().includes('expired') || vErr.toLowerCase().includes('invalid')
          ? 'That code is not valid or has expired. Ask your physiotherapist to send a new invitation.'
          : vErr,
      );
      setStage('entry');
      return;
    }

    setStage('accepting');
    const { error: aErr } = await acceptMyInvite(supabase);
    if (aErr) {
      setError(aErr);
      setStage('entry');
      return;
    }

    await refresh();
    router.replace('/consent');
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

  const busy = stage !== 'entry';

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: insets.top + t.space.xxl,
          gap: t.space.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Display size={32}>You&apos;ve been invited</Display>
          <Body size={14} color={t.textSecondary} style={{ marginTop: 4 }}>
            Enter the email your physiotherapist invited, and the six-digit code from
            your invitation email.
          </Body>
        </View>

        <Card>
          <Body size={12} color={t.textMuted} style={{ marginBottom: 8 }}>
            EMAIL ADDRESS
          </Body>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!busy}
            placeholder="you@example.com"
            placeholderTextColor={t.textMuted}
            accessibilityLabel="Email address"
            style={inputStyle}
          />

          <Body size={12} color={t.textMuted} style={{ marginTop: t.space.lg, marginBottom: 8 }}>
            INVITATION CODE
          </Body>
          <TextInput
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            editable={!busy}
            textContentType="oneTimeCode"
            accessibilityLabel="Six digit invitation code"
            style={[inputStyle, { fontSize: 26, letterSpacing: 10, textAlign: 'center' }]}
          />

          <View style={{ marginTop: t.space.md }}>
            <Pill tone="brand">Entering this code verifies your email</Pill>
          </View>

          {error && (
            <Body size={13} color={t.status.critical} style={{ marginTop: 12 }}>
              {error}
            </Body>
          )}
        </Card>

        <Button
          label={
            stage === 'verifying'
              ? 'Verifying…'
              : stage === 'accepting'
                ? 'Setting up your account…'
                : 'Accept invitation'
          }
          disabled={busy || code.length < 6 || email.length < 5}
          onPress={submit}
        />

        <Button label="Back to sign in" variant="secondary" onPress={() => router.replace('/sign-in')} />

        <Body size={11} color={t.textMuted} style={{ textAlign: 'center', lineHeight: 16 }}>
          CoachApp supports your treatment — it is not a medical device and does not
          provide diagnosis.
        </Body>
      </ScrollView>
    </Screen>
  );
}
