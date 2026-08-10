import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { coach } from '@coachapp/shared';
import { Card, Pill, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { me } from '@/lib/today';

/**
 * Account deletion and data export appear here from Phase 1, not at the end of the
 * build: Apple requires in-app deletion (5.1.1(v)) and GDPR requires export, and
 * retrofitting cascading deletes across twenty tables later is miserable.
 */
export default function ProfileScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const rows = [
    { label: 'Condition', value: me.condition },
    { label: 'Goal', value: me.goal },
    { label: 'Height', value: me.heightCm ? `${me.heightCm} cm` : '—' },
    { label: 'Started', value: me.startedOn },
  ];

  const settings = [
    { label: 'Apple Health', value: 'Connected', tone: 'good' as const },
    { label: 'Notifications', value: 'Session reminders on', tone: 'good' as const },
    { label: 'Units', value: 'Metric (kg, cm)', tone: 'neutral' as const },
  ];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: insets.top + t.space.md,
          paddingBottom: t.space.xxl,
          gap: t.space.md,
        }}
      >
        <Text style={{ color: t.textPrimary, fontSize: 28, fontWeight: '700' }}>Profile</Text>

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
              <Text style={{ color: t.brand[800], fontSize: 20, fontWeight: '700' }}>
                {me.firstName[0]}
                {me.lastName[0]}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.textPrimary, fontSize: 18, fontWeight: '600' }}>
                {me.firstName} {me.lastName}
              </Text>
              <Text style={{ color: t.textSecondary, fontSize: 13 }}>{me.email}</Text>
            </View>
          </View>
        </Card>

        <Card title="Your programme">
          <View style={{ gap: 10 }}>
            {rows.map((r) => (
              <View key={r.label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ color: t.textSecondary, fontSize: 13 }}>{r.label}</Text>
                <Text
                  style={{ color: t.textPrimary, fontSize: 13, flex: 1, textAlign: 'right' }}
                  numberOfLines={2}
                >
                  {r.value}
                </Text>
              </View>
            ))}
          </View>
          <View style={{ marginTop: t.space.lg, borderTopWidth: 1, borderTopColor: t.border, paddingTop: t.space.md }}>
            <Text style={{ color: t.textSecondary, fontSize: 13 }}>Your physiotherapist</Text>
            <Text style={{ color: t.textPrimary, fontSize: 15, fontWeight: '600', marginTop: 2 }}>
              {coach.name}
            </Text>
            <Text style={{ color: t.textMuted, fontSize: 12 }}>{coach.practice}</Text>
          </View>
        </Card>

        <Card title="Settings">
          <View style={{ gap: t.space.md }}>
            {settings.map((s) => (
              <View
                key={s.label}
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <Text style={{ color: t.textPrimary, fontSize: 14 }}>{s.label}</Text>
                <Pill tone={s.tone}>{s.value}</Pill>
              </View>
            ))}
          </View>
        </Card>

        <Card title="Your data">
          <View style={{ gap: t.space.md }}>
            <View>
              <Text style={{ color: t.textPrimary, fontSize: 14 }}>Export my data</Text>
              <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 2 }}>
                Download everything recorded about you as JSON and CSV.
              </Text>
            </View>
            <View>
              <Text style={{ color: t.status.critical, fontSize: 14 }}>Delete my account</Text>
              <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 2 }}>
                Permanently erases your account and all training, nutrition and health data.
              </Text>
            </View>
          </View>
        </Card>

        <Text style={{ color: t.textMuted, fontSize: 11, textAlign: 'center', lineHeight: 16 }}>
          CoachApp supports your treatment — it is not a medical device and does not provide
          diagnosis. Always follow the guidance of your physiotherapist.
        </Text>
      </ScrollView>
    </Screen>
  );
}
