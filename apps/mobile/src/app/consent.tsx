import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { recordConsent, type ConsentType } from '@vela/api';
import { Body, Button, Card, Display, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';

/** Bump when the wording changes — consent is recorded against a version, so an old
 *  grant never silently covers new processing. */
const POLICY_VERSION = '2026-08-01';

const ITEMS: { type: ConsentType; title: string; body: string; required: boolean }[] = [
  {
    type: 'health_data_processing',
    title: 'Processing my health data',
    body: 'I agree that Vela may store the pain scores, training logs, body measurements and Apple Health readings I record, and share them with my physiotherapist so they can adjust my treatment.',
    required: true,
  },
  {
    type: 'privacy',
    title: 'Privacy policy',
    body: 'I have read how my data is stored, how long it is kept, and how to export or delete it at any time.',
    required: true,
  },
  {
    type: 'tos',
    title: 'Terms of use',
    body: 'I understand Vela supports my treatment and is not a medical device, and does not provide diagnosis.',
    required: true,
  },
];

/**
 * Explicit consent capture. Health data is GDPR Article 9 special-category data, so
 * this cannot be a pre-ticked box buried in onboarding: each item is opted into
 * separately, stored with its policy version, and revocable later from Profile.
 */
export default function ConsentScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useSession();

  const [granted, setGranted] = useState<Record<ConsentType, boolean>>({
    health_data_processing: false,
    privacy: false,
    tos: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allRequired = ITEMS.filter((i) => i.required).every((i) => granted[i.type]);

  async function submit() {
    setSaving(true);
    setError(null);
    const types = ITEMS.filter((i) => granted[i.type]).map((i) => i.type);
    const { error: err } = await recordConsent(supabase, types, POLICY_VERSION);
    if (err) {
      setError(err);
      setSaving(false);
      return;
    }
    await refresh();
    router.replace('/');
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: insets.top + t.space.xl,
          paddingBottom: t.space.xxl,
          gap: t.space.lg,
        }}
      >
        <View>
          <Display size={30}>Before we begin</Display>
          <Body size={14} color={t.textSecondary} style={{ marginTop: 4 }}>
            Your health data is sensitive, so we ask permission for each thing separately.
            You can withdraw any of these later from your profile.
          </Body>
        </View>

        {ITEMS.map((item) => {
          const on = granted[item.type];
          return (
            <Pressable
              key={item.type}
              onPress={() => setGranted((g) => ({ ...g, [item.type]: !g[item.type] }))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={item.title}
            >
              <Card style={on ? { borderColor: t.brand[400], borderWidth: 1.5 } : undefined}>
                <View style={{ flexDirection: 'row', gap: t.space.md }}>
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      borderWidth: on ? 0 : 1.5,
                      borderColor: t.axis,
                      backgroundColor: on ? t.brand[600] : 'transparent',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: 2,
                    }}
                  >
                    {on && <Check size={14} color="#fff" strokeWidth={3} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Body size={15} weight="semibold">
                      {item.title}
                    </Body>
                    <Body size={13} color={t.textSecondary} style={{ marginTop: 4, lineHeight: 19 }}>
                      {item.body}
                    </Body>
                  </View>
                </View>
              </Card>
            </Pressable>
          );
        })}

        {error && (
          <Body size={13} color={t.status.critical}>
            {error}
          </Body>
        )}

        <Button
          label={saving ? 'Saving…' : 'Agree and continue'}
          disabled={!allRequired || saving}
          onPress={submit}
        />

        <Body size={11} color={t.textMuted} style={{ textAlign: 'center', lineHeight: 16 }}>
          Recorded against policy version {POLICY_VERSION}. You can export or delete
          everything we hold about you at any time from your profile.
        </Body>
      </ScrollView>
    </Screen>
  );
}
