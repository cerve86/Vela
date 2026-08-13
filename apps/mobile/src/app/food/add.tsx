import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MEAL_SLOTS,
  logFood,
  portionOf,
  searchFoods,
  type Food,
  type Macros,
  type MealSlot,
} from '@vela/api';
import { Body, Button, Card, ChipRow, Display, Pill, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import { today } from '@/lib/data';

/** Breakfast before 11, lunch before 16, dinner before 21, otherwise a snack. */
function mealForNow(): MealSlot {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

export default function AddFoodScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client } = useSession();

  // The scanner pushes back here with the food it cached, rather than logging directly:
  // the portion still has to be chosen, and one screen owning that keeps it consistent.
  const { foodId, barcode } = useLocalSearchParams<{ foodId?: string; barcode?: string }>();

  const [meal, setMeal] = useState<MealSlot>(mealForNow());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Food | null>(null);
  const [grams, setGrams] = useState('100');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick add: energy only, for the meal nobody is going to weigh.
  const [quickName, setQuickName] = useState('');
  const [quickKcal, setQuickKcal] = useState('');

  useEffect(() => {
    if (!foodId) return;
    let cancelled = false;
    supabase
      .from('foods')
      .select(
        'id, coach_id, source, barcode, name, brand, serving_name, serving_g, kcal_100g, protein_100g, carbs_100g, fat_100g',
      )
      .eq('id', foodId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const food: Food = {
          id: data.id,
          coachId: data.coach_id,
          source: data.source as Food['source'],
          barcode: data.barcode,
          name: data.name,
          brand: data.brand,
          servingName: data.serving_name,
          servingG: data.serving_g === null ? null : Number(data.serving_g),
          per100g: {
            kcal: Number(data.kcal_100g),
            proteinG: Number(data.protein_100g),
            carbsG: Number(data.carbs_100g),
            fatG: Number(data.fat_100g),
          },
        };
        setSelected(food);
        setGrams(String(food.servingG ?? 100));
      });
    return () => {
      cancelled = true;
    };
  }, [foodId]);

  // Debounced, because every keystroke is a round trip otherwise and the list flickering
  // under her thumb is worse than waiting a beat.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const rows = await searchFoods(supabase, q);
      setResults(rows);
      setSearching(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  /**
   * Closes the whole add-food flow and lands back on the diary.
   *
   * Two things had to be handled. The scanner replaces itself with this screen, so the
   * first Add food is still underneath and a plain back() surfaced that stale screen.
   * And dismissing the modal stack alone drops to the tab group's initial route — Today —
   * which is not where she was or what she just changed.
   */
  function done() {
    router.dismissAll();
    router.replace('/nutrition');
  }

  const gramsNum = Number(grams.replace(',', '.'));
  const portion: Macros | null = useMemo(
    () => (selected && Number.isFinite(gramsNum) && gramsNum > 0 ? portionOf(selected, gramsNum) : null),
    [selected, gramsNum],
  );

  async function save() {
    if (!client || !selected || !portion) return;
    setSaving(true);
    setError(null);
    const { error: logError } = await logFood(supabase, {
      clientId: client.id,
      loggedOn: today(),
      meal,
      foodId: selected.id,
      description: selected.brand ? `${selected.name} · ${selected.brand}` : selected.name,
      quantityG: gramsNum,
      macros: portion,
      source: barcode || selected.source === 'off' ? 'barcode' : 'search',
    });
    setSaving(false);
    if (logError) setError(logError);
    else done();
  }

  async function saveQuick() {
    const kcal = Number(quickKcal.replace(/[^\d.]/g, ''));
    if (!client || !quickName.trim() || !Number.isFinite(kcal) || kcal <= 0) {
      setError('A name and a number of calories, and it is in.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: logError } = await logFood(supabase, {
      clientId: client.id,
      loggedOn: today(),
      meal,
      description: quickName.trim(),
      // Deliberately no invented macro split. An estimate here would look like data.
      macros: { kcal, proteinG: 0, carbsG: 0, fatG: 0 },
      source: 'quick',
    });
    setSaving(false);
    if (logError) setError(logError);
    else done();
  }

  const field = {
    backgroundColor: t.inputFill,
    borderRadius: t.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: t.textPrimary,
    fontSize: 16,
    fontFamily: t.font.regular,
  } as const;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: insets.top + t.space.md,
          paddingBottom: t.space.xxl * 2,
          gap: t.space.md,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Display size={28}>Add food</Display>

        <Card title="Which meal">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {MEAL_SLOTS.map((s) => {
              const on = meal === s.value;
              return (
                <Pressable
                  key={s.value}
                  onPress={() => setMeal(s.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderRadius: t.radius.pill,
                    backgroundColor: on ? t.brand[600] : t.softFill,
                  }}
                >
                  <Body size={13} weight="semibold" color={on ? '#fff' : t.textSecondary}>
                    {s.label}
                  </Body>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {selected ? (
          <Card title="Portion">
            <Body size={17} weight="semibold">
              {selected.name}
            </Body>
            {selected.brand && (
              <Body size={13} color={t.textSecondary}>
                {selected.brand}
              </Body>
            )}
            {selected.source === 'off' && (
              <View style={{ marginTop: t.space.sm, alignItems: 'flex-start' }}>
                <Pill tone="neutral">From the barcode</Pill>
              </View>
            )}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: t.space.md,
                marginTop: t.space.lg,
              }}
            >
              <TextInput
                value={grams}
                onChangeText={setGrams}
                keyboardType="decimal-pad"
                accessibilityLabel="Grams"
                style={{ ...field, width: 110, textAlign: 'center' }}
              />
              <Body size={15} color={t.textSecondary}>
                grams
              </Body>
              {selected.servingG !== null && (
                <Pressable
                  onPress={() => setGrams(String(selected.servingG))}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: t.radius.pill,
                    backgroundColor: t.softFill,
                  }}
                >
                  <Body size={12} weight="semibold" color={t.textSecondary}>
                    {selected.servingName ?? `1 serving (${selected.servingG} g)`}
                  </Body>
                </Pressable>
              )}
            </View>

            {portion && (
              <View style={{ marginTop: t.space.lg, gap: 4 }}>
                <Body size={22} weight="semibold">
                  {Math.round(portion.kcal)} kcal
                </Body>
                <Body size={13} color={t.textSecondary}>
                  {portion.proteinG.toFixed(1)} g protein · {portion.carbsG.toFixed(1)} g carbs ·{' '}
                  {portion.fatG.toFixed(1)} g fat
                </Body>
              </View>
            )}

            {error && (
              <Body size={13} color={t.status.critical} style={{ marginTop: t.space.md }}>
                {error}
              </Body>
            )}

            <View style={{ marginTop: t.space.lg, gap: t.space.sm }}>
              <Button
                label={saving ? 'Saving…' : 'Log it'}
                disabled={saving || !portion}
                onPress={save}
              />
              <Button
                label="Pick something else"
                variant="secondary"
                onPress={() => {
                  setSelected(null);
                  router.setParams({ foodId: undefined, barcode: undefined });
                }}
              />
            </View>
          </Card>
        ) : (
          <>
            <Button label="Scan a barcode" onPress={() => router.push('/food/scan')} />

            <Card title="Search">
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Porridge, chicken, yoghurt…"
                placeholderTextColor={t.textMuted}
                autoCorrect={false}
                accessibilityLabel="Search foods"
                style={field}
              />
              {searching && (
                <View style={{ marginTop: t.space.md }}>
                  <ActivityIndicator color={t.brand[600]} />
                </View>
              )}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <Body size={13} color={t.textSecondary} style={{ marginTop: t.space.md }}>
                  Nothing matching. Scan the barcode, or add it below with just the
                  calories.
                </Body>
              )}
              {results.length > 0 && (
                <View style={{ marginTop: t.space.md, gap: 8 }}>
                  {results.map((f) => (
                    <Pressable
                      key={f.id}
                      onPress={() => {
                        setSelected(f);
                        setGrams(String(f.servingG ?? 100));
                      }}
                    >
                      <ChipRow>
                        <View style={{ flex: 1 }}>
                          <Body size={14} weight="medium">
                            {f.name}
                          </Body>
                          <Body size={11} color={t.textMuted}>
                            {f.brand ? `${f.brand} · ` : ''}
                            {Math.round(f.per100g.kcal)} kcal / 100 g
                          </Body>
                        </View>
                      </ChipRow>
                    </Pressable>
                  ))}
                </View>
              )}
            </Card>

            <Card title="Or just the calories">
              <Body size={12} color={t.textMuted} style={{ marginBottom: t.space.md, lineHeight: 17 }}>
                For the meal you are not going to weigh. It counts towards your energy and
                leaves the macros blank rather than guessing them.
              </Body>
              <View style={{ gap: t.space.sm }}>
                <TextInput
                  value={quickName}
                  onChangeText={setQuickName}
                  placeholder="Dinner at my mum's"
                  placeholderTextColor={t.textMuted}
                  accessibilityLabel="What was it"
                  style={field}
                />
                <TextInput
                  value={quickKcal}
                  onChangeText={setQuickKcal}
                  placeholder="600"
                  placeholderTextColor={t.textMuted}
                  keyboardType="number-pad"
                  accessibilityLabel="Calories"
                  style={field}
                />
              </View>
              {error && (
                <Body size={13} color={t.status.critical} style={{ marginTop: t.space.md }}>
                  {error}
                </Body>
              )}
              <View style={{ marginTop: t.space.md }}>
                <Button
                  label={saving ? 'Saving…' : 'Log it'}
                  variant="secondary"
                  disabled={saving}
                  onPress={saveQuick}
                />
              </View>
            </Card>
          </>
        )}

        <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
