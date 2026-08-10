import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adherenceBand, adherenceStyle } from '@coachapp/shared';
import {
  Avatar,
  Body,
  Button,
  Card,
  ChipRow,
  Display,
  Pill,
  ProgressBar,
  Screen,
  StatRow,
} from '@/components/kit';
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

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** Monday 10 August 2026 is index 1; days before today are done, today is active. */
const TODAY_INDEX = 1;

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
          paddingBottom: t.space.xxl * 2,
          gap: t.space.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — avatar left, notification bell right, as in the reference */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Avatar name={`${me.firstName} ${me.lastName}`} size={44} />
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: t.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 18 }}>🔔</Text>
            <View
              style={{
                position: 'absolute',
                top: 11,
                right: 12,
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: t.status.critical,
              }}
            />
          </View>
        </View>

        {/* The reference's signature headline: light greeting, heavy name */}
        <View style={{ marginTop: t.space.sm }}>
          <Text>
            <Text
              style={{
                fontFamily: t.font.display,
                fontSize: 34,
                letterSpacing: -1,
                color: t.textMuted,
              }}
            >
              Hello!{' '}
            </Text>
            <Text
              style={{
                fontFamily: t.font.display,
                fontSize: 34,
                letterSpacing: -1,
                color: t.textPrimary,
              }}
            >
              {me.firstName}
            </Text>
          </Text>
          <Body size={14} color={t.textSecondary} style={{ marginTop: 2 }}>
            Keep it up — one session to go today
          </Body>
        </View>

        {/* Week ring strip */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: t.space.sm }}>
          {WEEK.map((d, i) => {
            const done = i < TODAY_INDEX;
            const active = i === TODAY_INDEX;
            return (
              <View key={d} style={{ alignItems: 'center', gap: 6 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    borderWidth: active ? 3 : 2,
                    borderColor: done ? t.brand[600] : active ? t.accent[500] : t.grid,
                    backgroundColor: done ? t.brand[600] : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {done && <Text style={{ color: '#fff', fontSize: 14 }}>✓</Text>}
                </View>
                <Body size={11} color={active ? t.textPrimary : t.textMuted} weight={active ? 'semibold' : 'regular'}>
                  {d}
                </Body>
              </View>
            );
          })}
        </View>

        {/* Tinted promo card, straight from the reference */}
        <Card fill={t.dark ? 'rgba(255,255,255,0.05)' : t.tint.cream} style={{ marginTop: t.space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.lg }}>
            <Text style={{ fontSize: 30 }}>🩺</Text>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: t.font.displayBold,
                  fontSize: 15,
                  letterSpacing: -0.3,
                  color: t.textPrimary,
                }}
              >
                Weekly check-in is due
              </Text>
              <Body size={12} color={t.textSecondary} style={{ marginTop: 2 }}>
                Two minutes — how the knee felt this week
              </Body>
            </View>
          </View>
        </Card>

        <Card
          title="Today's session"
          right={<Body size={12} color={t.textMuted}>~{estimatedMinutes()} min</Body>}
        >
          <Display size={24}>Lower body + core</Display>
          <Body size={13} color={t.textSecondary} style={{ marginTop: 3 }}>
            Week 4 · {todayPlan.length} exercises · {todayPlan.reduce((n, i) => n + i.sets, 0)} sets
          </Body>

          <View style={{ marginTop: t.space.lg, gap: t.space.md }}>
            {blocks.map((b) => (
              <View key={b} style={{ gap: 6 }}>
                <Body size={11} weight="bold" color={t.textMuted}>
                  BLOCK {b}
                </Body>
                {todayPlan
                  .filter((i) => i.block === b)
                  .map((i) => (
                    <ChipRow key={i.id}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: t.brand[400],
                        }}
                      />
                      <Body size={14} weight="medium" style={{ flex: 1 }}>
                        {i.name}
                      </Body>
                      <Body size={13} color={t.textSecondary}>
                        {i.sets} × {i.reps}
                        {i.targetLoadKg ? ` · ${i.targetLoadKg} kg` : ''}
                      </Body>
                    </ChipRow>
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
                <Body size={13} color={t.textSecondary}>
                  Sessions completed
                </Body>
                <Body size={13} weight="semibold">
                  {myRollup.sessionsCompleted7d} of {myRollup.sessionsScheduled7d}
                </Body>
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
                { label: 'Weight', value: weight ? weight.value.toFixed(1) : '—', unit: 'kg' },
              ]}
            />
          </View>
        </Card>

        <Card
          title="Nutrition today"
          right={
            <Body size={12} color={t.textMuted}>
              {Math.round(actual.kcal)} / {target.kcal} kcal
            </Body>
          }
        >
          <View style={{ gap: t.space.md }}>
            {[
              { label: 'Protein', a: actual.proteinG, tg: target.proteinG, c: t.series[0]! },
              { label: 'Carbs', a: actual.carbsG, tg: target.carbsG, c: t.series[1]! },
              { label: 'Fat', a: actual.fatG, tg: target.fatG, c: t.series[2]! },
            ].map((m) => (
              <View key={m.label}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                  <Body size={12} color={t.textSecondary}>
                    {m.label}
                  </Body>
                  <Body size={12} weight="semibold">
                    {Math.round(m.a)} / {m.tg} g
                  </Body>
                </View>
                <ProgressBar value={m.a / m.tg} color={m.c} />
              </View>
            ))}
          </View>
        </Card>

        <Card title="Apple Health">
          <Body size={13} color={t.textSecondary}>
            Weight, resting heart rate, sleep and steps sync automatically.
          </Body>
          <View style={{ marginTop: t.space.md }}>
            <Pill tone="brand">Last synced 07:04</Pill>
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
