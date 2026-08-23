import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScanLine, Utensils } from 'lucide-react-native';
import { EMPTY_MACROS, deleteFoodLog, logFood, sumMacros } from '@vela/api';
import type { MealSlot } from '@vela/api';
import { isBlocking } from '@vela/shared';
import { Body, Card, Display, Screen } from '@/components/kit';
import { Rise, Tap } from '@/components/motion';
import {
  MacroBar,
  QuickFoodRow,
  SlotPicker,
  SlotSection,
  withAlpha,
  type SlotEntry,
} from '@/components/fuel-kit';
import { Illustration } from '@/components/Illustration';
import { useTheme } from '@/theme';
import { useSession } from '@/lib/session';
import { today, useNutrition } from '@/lib/data';
import { useDailyRead } from '@/lib/daily';
import { supabase } from '@/lib/supabase';

/**
 * Fuel — four slots, logged separately.
 *
 * The slots are the whole design. One "daily log" form with a meal dropdown holds the same
 * rows and tells you far less: it cannot show, without reading anything, that lunch never
 * happened. Four sections with four totals can.
 *
 * The copy is deliberately about eating enough. This is a postpartum and often
 * breastfeeding population, which is the group most harmed by a nutrition screen that
 * reads as a deficit to hit.
 */
export default function FuelScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client } = useSession();

  // Two weeks, not one day: today drives the totals, and the fortnight behind it is where
  // the one-tap suggestions come from.
  const nutrition = useNutrition(14);
  const daily = useDailyRead();

  const [slot, setSlot] = useState<MealSlot>('breakfast');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      nutrition.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const todayIso = today();
  const target = nutrition.data.target;

  const todayEntries = useMemo(
    () => nutrition.data.entries.filter((e) => e.loggedOn === todayIso),
    [nutrition.data.entries, todayIso],
  );

  const logged = useMemo(
    () => sumMacros(todayEntries.length ? todayEntries : [EMPTY_MACROS]),
    [todayEntries],
  );

  /**
   * One-tap suggestions, drawn from what she has actually eaten.
   *
   * Not a search: `searchFoods` refuses queries under two characters by design, so there is
   * no "list everything" to lean on — and a generic food list would be the wrong thing
   * anyway. Re-logging yesterday's breakfast is the single most common action this screen
   * has, and a previous entry already carries its own portion and macros, including for
   * described estimates that never had a food row at all.
   */
  const quick = useMemo(() => {
    const seen = new Map<string, { description: string; kcal: number; detail: string }>();
    for (const e of nutrition.data.entries) {
      if (e.loggedOn === todayIso) continue;
      const key = e.description.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.set(key, {
        description: e.description,
        kcal: e.kcal,
        detail: e.quantityG ? `${Math.round(e.quantityG)} g · logged before` : 'logged before',
      });
      if (seen.size === 3) break;
    }
    return [...seen.values()];
  }, [nutrition.data.entries, todayIso]);

  const bySlot = useMemo(() => {
    const map: Record<string, SlotEntry[]> = {};
    for (const s of t.mealSlots) map[s.key] = [];
    for (const e of todayEntries) {
      (map[e.meal] ??= []).push({
        id: e.id,
        description: e.description || 'Logged',
        kcal: e.kcal,
        detail: e.quantityG ? `${Math.round(e.quantityG)} g` : sourceLabel(e.source),
      });
    }
    return map;
  }, [todayEntries, t.mealSlots]);

  const filledSlots = useMemo(
    () => t.mealSlots.filter((s) => (bySlot[s.key]?.length ?? 0) > 0),
    [t.mealSlots, bySlot],
  );

  const blocked = isBlocking(daily.read.symptom);
  const slotSpec = t.mealSlots.find((s) => s.key === slot)!;

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast((m) => (m === message ? null : m)), 2600);
  }

  /**
   * Re-logs a previous entry into the selected slot.
   *
   * The macros are copied from the earlier log rather than recomputed from a food row — the
   * entry may never have had one, and even where it did, the row it came from could have
   * been corrected since. What she ate last Tuesday is what she ate.
   */
  async function addQuick(item: { description: string; kcal: number }) {
    if (!client || busy) return;
    const previous = nutrition.data.entries.find(
      (e) => e.description === item.description && e.loggedOn !== todayIso,
    );
    if (!previous) return;

    setBusy(true);
    const { error } = await logFood(supabase, {
      clientId: client.id,
      loggedOn: todayIso,
      meal: slot,
      foodId: previous.foodId,
      description: previous.description,
      quantityG: previous.quantityG,
      macros: {
        kcal: previous.kcal,
        proteinG: previous.proteinG,
        carbsG: previous.carbsG,
        fatG: previous.fatG,
      },
      source: previous.source,
    });
    setBusy(false);
    if (error) {
      // The write failed, so nothing was logged. Saying so plainly beats a toast that
      // implies success and a total that quietly does not move.
      flash('Could not save that — check your connection.');
      return;
    }
    flash(`Added to ${slotSpec.label.toLowerCase()}`);
    nutrition.reload();
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    const { error } = await deleteFoodLog(supabase, id);
    setBusy(false);
    if (error) {
      flash('Could not remove that yet.');
      return;
    }
    nutrition.reload();
  }

  const noTarget = !target;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.space.lg,
          paddingTop: insets.top + t.space.md,
          paddingBottom: t.space.xxl * 3,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Display size={30}>Fuel</Display>

        {nutrition.loading ? (
          <Card style={{ borderRadius: 22 }}>
            <ActivityIndicator color={t.brand[600]} />
          </Card>
        ) : (
          <>
            <Rise>
              <Card style={{ borderRadius: 22 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: t.dark ? withAlpha('#E8A200', 0.16) : '#FFF6E3',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Utensils size={16} color={t.status.warning} strokeWidth={2.1} />
                  </View>
                  <Body size={13.5} weight="medium" style={{ flex: 1 }}>
                    Fuel today
                  </Body>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text
                    style={{
                      fontFamily: t.font.displaySemi,
                      fontSize: 32,
                      letterSpacing: -1.3,
                      color: t.textPrimary,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {Math.round(logged.kcal).toLocaleString('en-GB')}
                  </Text>
                  <Body size={15} color={t.textSecondary}>
                    {target ? `of ${target.kcal.toLocaleString('en-GB')} kcal` : 'kcal logged'}
                  </Body>
                </View>

                {noTarget ? (
                  <Body size={12.5} color={t.textSecondary} style={{ marginTop: 12, lineHeight: 18 }}>
                    Your physio has not set targets yet. Logging still works — the bars appear
                    once she does.
                  </Body>
                ) : (
                  <View style={{ gap: 13, marginTop: 18 }}>
                    <MacroBar
                      label="Protein"
                      value={logged.proteinG}
                      target={target.proteinG}
                      unit="g"
                      color={t.brand[600]}
                    />
                    <MacroBar
                      label="Carbohydrate"
                      value={logged.carbsG}
                      target={target.carbsG}
                      unit="g"
                      color={t.accent[500]}
                    />
                    <MacroBar
                      label="Fat"
                      value={logged.fatG}
                      target={target.fatG}
                      unit="g"
                      color={t.status.warningFill}
                    />
                  </View>
                )}

                <Body size={12.5} color={t.textSecondary} style={{ marginTop: 16, lineHeight: 17 }}>
                  {client?.breastfeeding
                    ? 'Breastfeeding is included in these numbers. They exist to help you eat enough, not less.'
                    : 'These numbers exist to help you eat enough, not less.'}
                </Body>
              </Card>
            </Rise>

            <Rise delay={60}>
              <Card style={{ borderRadius: 22 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Body size={13.5} weight="medium" style={{ flex: 1 }}>
                    Add to {slotSpec.label.toLowerCase()}
                  </Body>
                  <Body size={11} color={t.textSecondary}>
                    {Math.round(
                      (bySlot[slot] ?? []).reduce((n, e) => n + e.kcal, 0),
                    ).toLocaleString('en-GB')}{' '}
                    kcal
                  </Body>
                </View>

                <View style={{ marginTop: 14 }}>
                  <SlotPicker value={slot} onChange={(k) => setSlot(k as MealSlot)} />
                </View>

                {quick.length > 0 && (
                  <>
                    <Body
                      size={11}
                      weight="medium"
                      color={t.textSecondary}
                      style={{ letterSpacing: 0.5, marginTop: 18 }}
                    >
                      AGAIN, SAME PORTION
                    </Body>
                    <View style={{ gap: 7, marginTop: 10 }}>
                      {quick.map((q) => (
                        <QuickFoodRow
                          key={q.description}
                          name={q.description}
                          portion={q.detail}
                          kcal={q.kcal}
                          accent={slotSpec.color}
                          onAdd={() => void addQuick(q)}
                        />
                      ))}
                    </View>
                  </>
                )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <Tap
                    onPress={() => router.push({ pathname: '/food/add', params: { meal: slot } })}
                    scale={0.97}
                    style={{
                      flex: 1,
                      borderWidth: 1.5,
                      borderColor: t.border,
                      borderRadius: t.radius.md,
                      paddingVertical: 12,
                      alignItems: 'center',
                    }}
                  >
                    <Body size={13.5} weight="medium">
                      Search or describe it
                    </Body>
                  </Tap>
                  <Tap
                    onPress={() => router.push('/food/scan')}
                    scale={0.97}
                    accessibilityLabel="Scan a barcode"
                    style={{
                      width: 52,
                      borderWidth: 1.5,
                      borderColor: t.border,
                      borderRadius: t.radius.md,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ScanLine size={18} color={t.textPrimary} strokeWidth={2} />
                  </Tap>
                </View>
              </Card>
            </Rise>

            {todayEntries.length === 0 && (
              <Rise delay={120}>
                <Card style={{ borderRadius: 22 }}>
                  <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                    <Illustration name="plate" width={150} />
                    <Body size={13} color={t.textSecondary} style={{ textAlign: 'center' }}>
                      Nothing logged today. Start with whichever meal already happened — there is
                      no order to keep to.
                    </Body>
                  </View>
                </Card>
              </Rise>
            )}

            {/*
              Only slots that have something in them.

              Four empty "Add breakfast / Add lunch / Add dinner / Add snack" cards say nothing
              the card above does not already offer, and on an untouched day they were the
              entire screen below the fold — four rows of scrolling to be told nothing had
              happened yet. A slot appears once it holds food, which is the point at which it
              has something to show and something to delete.
            */}
            {filledSlots.map((s, i) => (
              <Rise key={s.key} delay={150 + i * 40}>
                <SlotSection
                  slot={s.key}
                  entries={bySlot[s.key] ?? []}
                  onAdd={() => {
                    setSlot(s.key as MealSlot);
                    router.push({ pathname: '/food/add', params: { meal: s.key } });
                  }}
                  onDelete={(id) => void remove(id)}
                  softenedCta={
                    blocked && s.key === 'snack' && (bySlot.snack?.length ?? 0) > 0
                      ? 'One snack a day is enough'
                      : undefined
                  }
                />
              </Rise>
            ))}
          </>
        )}
      </ScrollView>

      {toast && (
        <View
          style={{
            position: 'absolute',
            left: t.space.lg,
            right: t.space.lg,
            bottom: 96,
            backgroundColor: t.dark ? t.brand[900] : '#12172B',
            borderRadius: t.radius.md,
            paddingVertical: 13,
            paddingHorizontal: 16,
          }}
        >
          <Body size={13} weight="medium" color="#FFFFFF">
            {toast}
          </Body>
        </View>
      )}
    </Screen>
  );
}

/**
 * How an entry got here, in her words.
 *
 * The four cases are the whole of `food_log_source`: ('barcode','search','custom','quick').
 * This used to name 'described' and 'manual', neither of which exists — so two branches were
 * unreachable and every real value except a barcode fell through to "From the food list",
 * including a food she had typed in herself and a one-tap repeat of yesterday.
 */
function sourceLabel(source: string): string {
  if (source === 'barcode') return 'Scanned';
  if (source === 'custom') return 'Your own food';
  if (source === 'quick') return 'Same as before';
  if (source === 'search') return 'From the food list';
  return 'Logged';
}
