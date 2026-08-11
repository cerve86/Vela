import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { deleteMyAccount, exportMyData, signOut } from '@vela/api';
import { Body, Card, Display, Pill, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';

/**
 * Account deletion and data export are here from Phase 1, not bolted on at the end:
 * Apple requires in-app deletion (5.1.1(v)) and GDPR requires both export (Art. 15/20)
 * and erasure (Art. 17). Retrofitting cascading deletes across twenty tables later is
 * miserable, and a "delete" that merely hides the data is not erasure.
 */
export default function ProfileScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { session, client, refresh } = useSession();

  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const email = session?.user.email ?? '';
  const name = email.split('@')[0] ?? 'You';

  async function handleExport() {
    setExporting(true);
    try {
      const data = await exportMyData(supabase);
      const file = new File(Paths.cache, `vela-export-${Date.now()}.json`);
      file.create({ overwrite: true });
      file.write(JSON.stringify(data, null, 2));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Your Vela data',
          UTI: 'public.json',
        });
      } else {
        Alert.alert('Export ready', `Saved to ${file.uri}`);
      }
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setExporting(false);
    }
  }

  /**
   * Confirmation is an inline typed challenge rather than two stacked alerts.
   *
   * The nested-alert version was not reliably two-step: presenting an Alert from inside
   * another Alert's action handler races the first one's dismissal, and a single tap was
   * observed deleting an account outright. For an irreversible erasure of someone's
   * clinical history, the confirmation has to be deterministic — so the user types the
   * word, and the button cannot fire until they have.
   */
  const canDelete = confirmText.trim().toUpperCase() === 'DELETE';

  async function doDelete() {
    setDeleting(true);
    const { error } = await deleteMyAccount(supabase);
    if (error) {
      setDeleting(false);
      Alert.alert('Could not delete your account', error);
      return;
    }
    // The auth row is gone; clearing the local session sends the gate back to sign-in.
    await signOut(supabase);
    await refresh();
  }

  const rows = [
    { label: 'Condition', value: client?.condition ?? '—' },
    { label: 'Goal', value: client?.goal ?? '—' },
    { label: 'Status', value: client?.status ?? '—' },
  ];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: insets.top + t.space.md,
          paddingBottom: t.space.xxl * 2,
          gap: t.space.md,
        }}
      >
        <Display size={30}>Profile</Display>

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.lg }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: t.brand[100],
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: t.brand[800], fontSize: 20, fontFamily: t.font.displayBold }}>
                {name.slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Body size={18} weight="semibold">
                {name}
              </Body>
              <Body size={13} color={t.textSecondary}>
                {email}
              </Body>
              <View style={{ marginTop: 6 }}>
                <Pill tone="good">Email verified</Pill>
              </View>
            </View>
          </View>
        </Card>

        <Card title="Your programme">
          <View style={{ gap: 10 }}>
            {rows.map((r) => (
              <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Body size={13} color={t.textSecondary}>
                  {r.label}
                </Body>
                <Body size={13} weight="medium" style={{ flex: 1, textAlign: 'right' }}>
                  {r.value}
                </Body>
              </View>
            ))}
          </View>
        </Card>

        <Card title="Your data">
          <Pressable
            onPress={handleExport}
            disabled={exporting}
            accessibilityRole="button"
            accessibilityLabel="Export my data"
            style={{ opacity: exporting ? 0.5 : 1 }}
          >
            <View style={{ paddingVertical: 4 }}>
              <Body size={15} weight="semibold">
                {exporting ? 'Preparing your export…' : 'Export my data'}
              </Body>
              <Body size={12} color={t.textMuted} style={{ marginTop: 2 }}>
                Download everything recorded about you as a JSON file.
              </Body>
            </View>
          </Pressable>

          <View style={{ height: 1, backgroundColor: t.border, marginVertical: t.space.md }} />

          {!confirmOpen ? (
            <Pressable
              onPress={() => setConfirmOpen(true)}
              disabled={deleting}
              accessibilityRole="button"
              accessibilityLabel="Delete my account"
              style={{ opacity: deleting ? 0.5 : 1 }}
            >
              <View style={{ paddingVertical: 4 }}>
                <Body size={15} weight="semibold" color={t.status.critical}>
                  Delete my account
                </Body>
                <Body size={12} color={t.textMuted} style={{ marginTop: 2 }}>
                  Permanently erases your account and all training, nutrition and health
                  data. This cannot be undone.
                </Body>
              </View>
            </Pressable>
          ) : (
            <View style={{ paddingVertical: 4, gap: t.space.md }}>
              <Body size={15} weight="semibold" color={t.status.critical}>
                This erases everything, permanently
              </Body>
              <Body size={13} color={t.textSecondary} style={{ lineHeight: 19 }}>
                Your account, training history, pain scores, nutrition logs and health
                readings will be deleted. Your physiotherapist will no longer be able to
                see any of it, and it cannot be recovered.
              </Body>
              <Body size={12} color={t.textMuted}>
                Type DELETE to confirm
              </Body>
              <TextInput
                value={confirmText}
                onChangeText={setConfirmText}
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!deleting}
                accessibilityLabel="Type DELETE to confirm account deletion"
                style={{
                  backgroundColor: t.inputFill,
                  borderRadius: t.radius.md,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  color: t.textPrimary,
                  fontSize: 16,
                  fontFamily: t.font.medium,
                  letterSpacing: 2,
                }}
              />
              <Pressable
                onPress={doDelete}
                disabled={!canDelete || deleting}
                accessibilityRole="button"
                accessibilityLabel="Permanently delete my account"
                style={{
                  backgroundColor: t.status.critical,
                  borderRadius: t.radius.pill,
                  paddingVertical: 15,
                  alignItems: 'center',
                  opacity: !canDelete || deleting ? 0.35 : 1,
                }}
              >
                <Body size={15} weight="bold" color="#fff">
                  {deleting ? 'Deleting…' : 'Delete my account permanently'}
                </Body>
              </Pressable>
              <Pressable
                onPress={() => {
                  setConfirmOpen(false);
                  setConfirmText('');
                }}
                disabled={deleting}
                accessibilityRole="button"
              >
                <Body size={14} weight="semibold" style={{ textAlign: 'center' }}>
                  Keep my account
                </Body>
              </Pressable>
            </View>
          )}
        </Card>

        <Card title="Session">
          <Pressable
            onPress={async () => {
              await signOut(supabase);
              await refresh();
            }}
            accessibilityRole="button"
          >
            <Body size={15} weight="semibold">
              Sign out
            </Body>
          </Pressable>
        </Card>

        <Body size={11} color={t.textMuted} style={{ textAlign: 'center', lineHeight: 16 }}>
          Vela supports your treatment — it is not a medical device and does not
          provide diagnosis. Always follow the guidance of your physiotherapist.
        </Body>
      </ScrollView>
    </Screen>
  );
}
