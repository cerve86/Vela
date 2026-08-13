import { useCallback } from 'react';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MEAL_SLOTS, deleteFoodLog, sumMacros, type FoodLogEntry, type MealSlot } from '@vela/api';
import { Body, Button, Card, ChipRow, Display, Pill, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { supabase } from '@/lib/supabase';
import { today, useNutrition } from '@/lib/data';

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** A ring-less meter: a filled track, honest about overshoot by clamping the bar only. */
function MacroBar({
  label,
  value,
  target,
  unit,
  color,
}: {
  label: string;
  value: number;
  target: number | null;
  unit: string;
  color: string;
}) {
  const t = useTheme();
  const ratio = target && target > 0 ? value / target : 0;

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Body size={13} color={t.textSecondary}>
          {label}
        </Body>
        <Body size={13} weight="semibold">
          {Math.round(value)}
          {target !== null && (
            <Text style={{ color: t.textMuted, fontFamily: t.font.regular }}>
              {' '}
              / {Math.round(target)} {unit}
            </Text>
          )}
          {target === null && (
            <Text style={{ color: t.textMuted, fontFamily: t.font.regular }}> {unit}</Text>
          )}
        </Body>
      </View>
      <View
        style={{
          height: 8,
          borderRadius: t.radius.pill,
          backgroundColor: t.softFill,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
            height: '100%',
            borderRadius: t.radius.pill,
            backgroundColor: color,
          }}
        />
      </View>
    </View>
  );
}

export default function NutritionScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const nutrition = useNutrition(7);

  // Adding a meal happens on a pushed screen; coming back must show it.
  useFocusEffect(
    useCallback(() => {
      nutrition.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const todayIso = today();
  const entries = nutrition.data.entries.filter((e) => e.loggedOn === todayIso);
  const target = nutrition.data.target;
  const totals = sumMacros(entries);

  const byMeal = new Map<MealSlot, FoodLogEntry[]>();
  for (const e of entries) {
    const arr = byMeal.get(e.meal);
    if (arr) arr.push(e);
    else byMeal.set(e.meal, [e]);
  }

  async function remove(id: string) {
    await deleteFoodLog(supabase, id);
    nutrition.reload();
  }

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
        <Display size={30}>Today&apos;s food</Display>

        {nutrition.loading && nutrition.data.days.length === 0 ? (
          <Card>
            <ActivityIndicator color={t.brand[600]} />
          </Card>
        ) : (
          <>
            <Card>
              <View style={{ gap: t.space.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text
                    style={{
                      fontFamily: t.font.display,
                      fontSize: 38,
                      letterSpacing: -1.2,
                      color: t.textPrimary,
                    }}
                  >
                    {Math.round(totals.kcal).toLocaleString('en-GB')}
                  </Text>
                  <Body size={14} color={t.textMuted}>
                    {target ? `of ${target.kcal.toLocaleString('en-GB')} kcal` : 'kcal logged'}
                  </Body>
                </View>

                <View style={{ gap: t.space.md }}>
                  <MacroBar
                    label="Energy"
                    value={totals.kcal}
                    target={target?.kcal ?? null}
                    unit="kcal"
                    color={t.brand[600]}
                  />
                  <MacroBar
                    label="Protein"
                    value={totals.proteinG}
                    target={target?.proteinG ?? null}
                    unit="g"
                    color={t.accent[500]}
                  />
                  <MacroBar
                    label="Carbs"
                    value={totals.carbsG}
                    target={target?.carbsG ?? null}
                    unit="g"
                    color={t.brand[400]}
                  />
                  <MacroBar
                    label="Fat"
                    value={totals.fatG}
                    target={target?.fatG ?? null}
                    unit="g"
                    color={t.status.warning}
                  />
                </View>

                {target?.note && (
                  <Body size={12} color={t.textSecondary} style={{ lineHeight: 17 }}>
                    {target.note}
                  </Body>
                )}
                {!target && (
                  <Body size={12} color={t.textMuted} style={{ lineHeight: 17 }}>
                    Your physio hasn&apos;t set a target yet. Log anyway — what you eat is
                    worth knowing before there is a number attached to it.
                  </Body>
                )}
              </View>
            </Card>

            <Button label="Add food" onPress={() => router.push('/food/add')} />

            <Card title="This week">
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {nutrition.data.days.map((d) => {
                  const logged = d.entries > 0;
                  const isToday = d.day === todayIso;
                  const dow = new Date(`${d.day}T00:00:00Z`).getUTCDay();
                  return (
                    <View key={d.day} style={{ alignItems: 'center', gap: 6 }}>
                      <View
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 17,
                          borderWidth: isToday ? 2.5 : 1.5,
                          borderColor: isToday
                            ? t.accent[500]
                            : logged
                              ? t.brand[500]
                              : t.grid,
                          backgroundColor: logged ? t.brand[600] : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {logged && (
                          <Body size={10} color="#fff" weight="bold">
                            {Math.round(d.kcal / 100)}
                          </Body>
                        )}
                      </View>
                      <Body size={11} color={isToday ? t.textPrimary : t.textMuted}>
                        {DAY_INITIALS[dow]}
                      </Body>
                    </View>
                  );
                })}
              </View>
              <Body size={11} color={t.textMuted} style={{ marginTop: t.space.md }}>
                Filled days are logged; the number is hundreds of kcal. Blank means no
                entry, which is not the same as eating nothing.
              </Body>
            </Card>

            {entries.length === 0 ? (
              <Card>
                <Body size={14} color={t.textSecondary} style={{ lineHeight: 20 }}>
                  Nothing logged today. Scan a barcode, search what your physio has added,
                  or type it in — whichever is quickest with one hand free.
                </Body>
              </Card>
            ) : (
              MEAL_SLOTS.filter((s) => byMeal.has(s.value)).map((slot) => (
                <Card key={slot.value} title={slot.label}>
                  <View style={{ gap: 8 }}>
                    {byMeal.get(slot.value)!.map((e) => (
                      <ChipRow key={e.id}>
                        <View style={{ flex: 1 }}>
                          <Body size={14} weight="medium">
                            {e.description}
                          </Body>
                          <Body size={11} color={t.textMuted}>
                            {e.quantityG !== null ? `${Math.round(e.quantityG)} g · ` : ''}
                            {Math.round(e.proteinG)}p · {Math.round(e.carbsG)}c ·{' '}
                            {Math.round(e.fatG)}f
                          </Body>
                        </View>
                        <Body size={14} weight="semibold">
                          {Math.round(e.kcal)}
                        </Body>
                        <Pressable
                          onPress={() => remove(e.id)}
                          accessibilityLabel={`Remove ${e.description}`}
                          hitSlop={10}
                          style={{ paddingLeft: 6 }}
                        >
                          <Body size={16} color={t.textMuted}>
                            ×
                          </Body>
                        </Pressable>
                      </ChipRow>
                    ))}
                  </View>
                </Card>
              ))
            )}

            <Link href="/food/add" asChild>
              <Pressable>
                <Card>
                  <Pill tone="brand">Fuel first</Pill>
                  <Body size={13} color={t.textSecondary} style={{ marginTop: t.space.md, lineHeight: 19 }}>
                    Energy availability affects recovery, bone health and pelvic floor
                    function, and it matters more while breastfeeding. These numbers are
                    here to help you eat enough, not less.
                  </Body>
                </Card>
              </Pressable>
            </Link>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
