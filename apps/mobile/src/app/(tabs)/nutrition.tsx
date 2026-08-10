import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isDayOnTarget } from '@coachapp/shared';
import { Button, Card, Pill, ProgressBar, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { todayNutrition } from '@/lib/today';

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export default function NutritionScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { logs, actual, target } = todayNutrition();
  const onTarget = isDayOnTarget(actual, target);

  const macros = [
    { label: 'Protein', a: actual.proteinG, tg: target.proteinG, c: t.series[2]! },
    { label: 'Carbs', a: actual.carbsG, tg: target.carbsG, c: t.series[3]! },
    { label: 'Fat', a: actual.fatG, tg: target.fatG, c: t.series[4]! },
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
        <Text style={{ color: t.textPrimary, fontSize: 28, fontWeight: '700' }}>Nutrition</Text>

        <Card>
          <View style={{ alignItems: 'center', paddingVertical: t.space.sm }}>
            <Text
              style={{
                color: t.textPrimary,
                fontSize: 40,
                fontWeight: '700',
                fontVariant: ['tabular-nums'],
              }}
            >
              {Math.round(actual.kcal)}
            </Text>
            <Text style={{ color: t.textSecondary, fontSize: 14 }}>
              of {target.kcal} kcal · {Math.max(0, target.kcal - Math.round(actual.kcal))} left
            </Text>
            <View style={{ marginTop: 10 }}>
              <Pill tone={onTarget ? 'good' : 'warning'}>
                {onTarget ? 'On target' : 'Below target'}
              </Pill>
            </View>
          </View>

          <View style={{ marginTop: t.space.lg, gap: 12 }}>
            {macros.map((m) => (
              <View key={m.label}>
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}
                >
                  <Text style={{ color: t.textSecondary, fontSize: 13 }}>{m.label}</Text>
                  <Text style={{ color: t.textPrimary, fontSize: 13, fontWeight: '600' }}>
                    {Math.round(m.a)} / {m.tg} g
                  </Text>
                </View>
                <ProgressBar value={m.a / m.tg} color={m.c} />
              </View>
            ))}
          </View>
        </Card>

        <View style={{ flexDirection: 'row', gap: t.space.md }}>
          <View style={{ flex: 1 }}>
            <Button label="Scan barcode" />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Search food" variant="secondary" />
          </View>
        </View>

        {MEAL_ORDER.map((meal) => {
          const items = logs.filter((l) => l.meal === meal);
          return (
            <Card
              key={meal}
              title={meal.charAt(0).toUpperCase() + meal.slice(1)}
              right={
                <Text style={{ color: t.textMuted, fontSize: 12 }}>
                  {items.reduce((n, i) => n + i.macros.kcal, 0)} kcal
                </Text>
              }
            >
              {items.length === 0 ? (
                <Text style={{ color: t.textMuted, fontSize: 13 }}>Nothing logged yet</Text>
              ) : (
                <View style={{ gap: 10 }}>
                  {items.map((i) => (
                    <View
                      key={i.id}
                      style={{ flexDirection: 'row', justifyContent: 'space-between' }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: t.textPrimary, fontSize: 14 }}>{i.foodName}</Text>
                        <Text style={{ color: t.textMuted, fontSize: 12 }}>
                          {i.quantityG} g · P {i.macros.proteinG} · C {i.macros.carbsG} · F{' '}
                          {i.macros.fatG}
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: t.textSecondary,
                          fontSize: 14,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {i.macros.kcal}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
