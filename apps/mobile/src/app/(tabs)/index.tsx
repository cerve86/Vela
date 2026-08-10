import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adherenceStyle, adherenceBand } from '@coachapp/shared';
import { Button, Card, Pill, ProgressBar, Screen, StatRow } from '@/components/kit';
import { useTheme } from '@/theme';
import {
  currentStreak,
  estimatedMinutes,
  latestMetricValue,
  me,
  myRollup,
  todayNutrition,
  todayPlan,
} from '@/lib/today';

export default function TodayScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const weight = latestMetricValue('weight_kg');
  const { actual, target } = todayNutrition();
  const band = adherenceBand(myRollup.adherence7d);
  const blocks = [...new Set(todayPlan.map((i) => i.block))];

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
        <View>
          <Text style={{ color: t.textSecondary, fontSize: 14 }}>Monday 10 August</Text>
          <Text style={{ color: t.textPrimary, fontSize: 28, fontWeight: '700', marginTop: 2 }}>
            Morning, {me.firstName}
          </Text>
        </View>

        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
            <Pill tone="brand">Today&apos;s session</Pill>
            <Text style={{ color: t.textMuted, fontSize: 12 }}>~{estimatedMinutes()} min</Text>
          </View>

          <Text style={{ color: t.textPrimary, fontSize: 20, fontWeight: '700' }}>
            Lower body + core
          </Text>
          <Text style={{ color: t.textSecondary, fontSize: 13, marginTop: 3 }}>
            Week 4 · {todayPlan.length} exercises ·{' '}
            {todayPlan.reduce((n, i) => n + i.sets, 0)} sets
          </Text>

          <View style={{ marginTop: t.space.lg, gap: 10 }}>
            {blocks.map((b) => (
              <View key={b} style={{ gap: 6 }}>
                <Text style={{ color: t.textMuted, fontSize: 11, fontWeight: '700' }}>
                  BLOCK {b}
                </Text>
                {todayPlan
                  .filter((i) => i.block === b)
                  .map((i) => (
                    <View
                      key={i.id}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    >
                      <View
                        style={{
                          width: 4,
                          height: 26,
                          borderRadius: 2,
                          backgroundColor: t.brand[300],
                        }}
                      />
                      <Text style={{ color: t.textPrimary, fontSize: 15, flex: 1 }}>{i.name}</Text>
                      <Text style={{ color: t.textSecondary, fontSize: 13 }}>
                        {i.sets} × {i.reps}
                        {i.targetLoadKg ? ` · ${i.targetLoadKg} kg` : ''}
                      </Text>
                    </View>
                  ))}
              </View>
            ))}
          </View>

          <View style={{ marginTop: t.space.xl }}>
            <Link href="/session/today" asChild>
              <Button label="Start session" />
            </Link>
          </View>
        </Card>

        <Card title="This week">
          <View style={{ gap: t.space.lg }}>
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: t.textSecondary, fontSize: 13 }}>Sessions completed</Text>
                <Text style={{ color: t.textPrimary, fontSize: 13, fontWeight: '600' }}>
                  {myRollup.sessionsCompleted7d} of {myRollup.sessionsScheduled7d}
                </Text>
              </View>
              <ProgressBar value={myRollup.adherence7d} color={adherenceStyle[band].color} />
            </View>

            <StatRow
              items={[
                { label: 'Streak', value: String(currentStreak()), unit: 'days' },
                {
                  label: 'Avg pain',
                  value: myRollup.avgPain7d === null ? '—' : String(myRollup.avgPain7d),
                  unit: myRollup.avgPain7d === null ? undefined : '/10',
                },
                {
                  label: 'Weight',
                  value: weight ? weight.value.toFixed(1) : '—',
                  unit: 'kg',
                },
              ]}
            />
          </View>
        </Card>

        <Card
          title="Nutrition today"
          right={
            <Text style={{ color: t.textMuted, fontSize: 12 }}>
              {Math.round(actual.kcal)} / {target.kcal} kcal
            </Text>
          }
        >
          <View style={{ gap: 10 }}>
            {[
              { label: 'Protein', a: actual.proteinG, tg: target.proteinG, c: t.series[2]! },
              { label: 'Carbs', a: actual.carbsG, tg: target.carbsG, c: t.series[3]! },
              { label: 'Fat', a: actual.fatG, tg: target.fatG, c: t.series[4]! },
            ].map((m) => (
              <View key={m.label}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: t.textSecondary, fontSize: 12 }}>{m.label}</Text>
                  <Text style={{ color: t.textPrimary, fontSize: 12, fontWeight: '600' }}>
                    {Math.round(m.a)} / {m.tg} g
                  </Text>
                </View>
                <ProgressBar value={m.a / m.tg} color={m.c} />
              </View>
            ))}
          </View>
        </Card>

        <Card title="Apple Health">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.textSecondary, fontSize: 13 }}>
                Weight, resting heart rate, sleep and steps sync automatically.
              </Text>
              <View style={{ marginTop: 8 }}>
                <Pill tone="good">Last synced 07:04</Pill>
              </View>
            </View>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
