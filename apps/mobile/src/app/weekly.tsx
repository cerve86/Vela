import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { Body, Screen } from '@/components/kit';
import { Prose } from '@/components/prose';
import { useTheme } from '@/theme';
import { useWeeklyPlan } from '@/lib/data';

/** This week's plan from the physiotherapist, read through. */
export default function WeeklyPlanScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const plan = useWeeklyPlan();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.space.lg,
          paddingTop: insets.top + t.space.md,
          paddingBottom: t.space.xxl * 2,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to Today"
            style={({ pressed }) => ({
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.border,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.965 : 1 }],
            })}
          >
            <ChevronLeft size={16} color={t.textPrimary} strokeWidth={2.5} />
          </Pressable>
          {plan.data ? (
            <Body size={12.5} weight="medium" color={t.textSecondary}>
              Week of {friendly(plan.data.weekStart)}
            </Body>
          ) : null}
        </View>

        <Text
          style={{
            fontFamily: t.font.displaySemi,
            fontSize: 30,
            letterSpacing: -1,
            lineHeight: 34,
            color: t.textPrimary,
            marginTop: 6,
          }}
        >
          This week
        </Text>

        {plan.data ? (
          <>
            <Prose body={plan.data.body} />
            <Body size={12.5} color={t.textMuted} style={{ textAlign: 'center', marginTop: 8 }}>
              {plan.data.via === 'assistant'
                ? 'From your physio — drafted with her assistant and sent by her. If anything is unclear, or feels heavy or dragging, tell her in Messages.'
                : 'From your physio. If anything is unclear, or feels heavy or dragging, tell her in Messages.'}
            </Body>
          </>
        ) : (
          <Body size={14} color={t.textSecondary}>
            {plan.loading ? 'Loading…' : 'Nothing written for this week yet.'}
          </Body>
        )}
      </ScrollView>
    </Screen>
  );
}

function friendly(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}
