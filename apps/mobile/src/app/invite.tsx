import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { acceptInvite, peekInvite, type InvitePreview } from '@coachapp/api';
import { Body, Button, Card, Display, Pill, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';

type Stage = 'checking' | 'ready' | 'verifying' | 'accepting' | 'done' | 'error';

/**
 * Invite acceptance, reached by deep link from the invitation email:
 *   coachapp://invite?token_hash=…&type=invite&invite=…
 *
 * token_hash is GoTrue's one-time verifier. Exchanging it both signs the person in and
 * sets email_confirmed_at — the tap on that link IS the email verification. It works
 * without a locally-stored PKCE verifier, which matters because the coach started this
 * flow in a browser on a completely different device.
 *
 * Only then does the invite token get redeemed, and the database checks that the
 * now-verified address matches the one the invite was issued to.
 */
export default function InviteScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useSession();
  const params = useLocalSearchParams<{
    token_hash?: string;
    type?: string;
    invite?: string;
  }>();

  const [stage, setStage] = useState<Stage>('checking');
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inviteToken = params.invite ?? '';
  const tokenHash = params.token_hash ?? '';

  useEffect(() => {
    (async () => {
      if (!inviteToken) {
        setError('This link is missing its invitation code.');
        setStage('error');
        return;
      }
      const { preview: p, error: err } = await peekInvite(supabase, inviteToken);
      if (err || !p) {
        setError(err ?? 'Invitation not found.');
        setStage('error');
        return;
      }
      if (p.expired) {
        setError('This invitation has already been used or has expired.');
        setStage('error');
        return;
      }
      setPreview(p);
      setStage('ready');
    })();
  }, [inviteToken]);

  async function accept() {
    setError(null);

    if (tokenHash) {
      setStage('verifying');
      const { error: vErr } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'invite',
      });
      if (vErr) {
        setError(`Could not verify your email: ${vErr.message}`);
        setStage('error');
        return;
      }
    }

    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setError('That link has expired. Ask your physiotherapist to send a new invitation.');
      setStage('error');
      return;
    }

    setStage('accepting');
    const { error: aErr } = await acceptInvite(supabase, inviteToken);
    if (aErr) {
      setError(aErr);
      setStage('error');
      return;
    }

    await refresh();
    setStage('done');
    router.replace('/consent');
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: insets.top + t.space.xxl,
          gap: t.space.lg,
        }}
      >
        {stage === 'checking' && <Body color={t.textSecondary}>Checking your invitation…</Body>}

        {stage === 'error' && (
          <>
            <Display size={28}>Invitation problem</Display>
            <Card>
              <Body color={t.textSecondary}>{error}</Body>
            </Card>
            <Button label="Back" variant="secondary" onPress={() => router.replace('/sign-in')} />
          </>
        )}

        {(stage === 'ready' || stage === 'verifying' || stage === 'accepting') && preview && (
          <>
            <View>
              <Body size={14} color={t.textSecondary}>
                You&apos;ve been invited
              </Body>
              <Display size={32} style={{ marginTop: 4 }}>
                {preview.coachName}
              </Display>
              <Body size={14} color={t.textSecondary} style={{ marginTop: 2 }}>
                {preview.practiceName}
              </Body>
            </View>

            <Card>
              <Body size={14} color={t.textSecondary}>
                {preview.coachName} will send you your training programme and follow how
                you&apos;re getting on between sessions.
              </Body>
              <View style={{ marginTop: t.space.lg, gap: 8 }}>
                <Body size={12} color={t.textMuted}>
                  INVITATION SENT TO
                </Body>
                <Body size={15} weight="semibold">
                  {preview.email}
                </Body>
              </View>
              <View style={{ marginTop: t.space.md }}>
                <Pill tone="brand">Opening this link verifies your email</Pill>
              </View>
            </Card>

            <Button
              label={
                stage === 'verifying'
                  ? 'Verifying your email…'
                  : stage === 'accepting'
                    ? 'Setting up your account…'
                    : 'Accept invitation'
              }
              disabled={stage !== 'ready'}
              onPress={accept}
            />

            {error && (
              <Body size={13} color={t.status.critical}>
                {error}
              </Body>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
