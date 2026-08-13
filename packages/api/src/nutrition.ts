import type { VelaClient } from './client';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type FoodSource = 'off' | 'custom';
export type FoodLogSource = 'barcode' | 'search' | 'custom' | 'quick';

export const MEAL_SLOTS: { value: MealSlot; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface NutritionTarget extends Macros {
  id: string;
  effectiveFrom: string;
  note: string | null;
}

export interface Food {
  id: string;
  source: FoodSource;
  barcode: string | null;
  name: string;
  brand: string | null;
  servingName: string | null;
  servingG: number | null;
  /** Per 100 g, which is how every label states it and how every portion is derived. */
  per100g: Macros;
  /** Null when the coach did not create it — an Open Food Facts row belongs to nobody. */
  coachId: string | null;
}

export interface FoodLogEntry extends Macros {
  id: string;
  loggedOn: string;
  meal: MealSlot;
  foodId: string | null;
  description: string;
  quantityG: number | null;
  source: FoodLogSource;
}

export interface NutritionDay extends Macros {
  day: string;
  entries: number;
  targetKcal: number | null;
  targetProteinG: number | null;
}

export const EMPTY_MACROS: Macros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export function sumMacros(entries: Macros[]): Macros {
  return entries.reduce<Macros>(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      proteinG: acc.proteinG + m.proteinG,
      carbsG: acc.carbsG + m.carbsG,
      fatG: acc.fatG + m.fatG,
    }),
    { ...EMPTY_MACROS },
  );
}

/** Macros for `grams` of a food, rounded to one decimal — no label is finer than that. */
export function portionOf(food: Food, grams: number): Macros {
  const f = grams / 100;
  const r = (v: number) => Math.round(v * f * 10) / 10;
  return {
    kcal: r(food.per100g.kcal),
    proteinG: r(food.per100g.proteinG),
    carbsG: r(food.per100g.carbsG),
    fatG: r(food.per100g.fatG),
  };
}

/**
 * Energy floors below which a target should be questioned rather than saved quietly.
 *
 * These are not clinical thresholds and Vela does not enforce them — a physiotherapist
 * may have a reason. They exist because a postpartum, often breastfeeding population is
 * exactly the group most harmed by a number typed in haste, and the software should say
 * so out loud rather than render an aggressive deficit as a tidy ring.
 *
 * The lactation allowance follows the usual ~330–400 kcal/day figure for the first six
 * months.
 */
export const ENERGY_FLOOR_KCAL = 1600;
export const LACTATION_ALLOWANCE_KCAL = 400;

export function targetConcerns(
  kcal: number,
  opts: { breastfeeding: boolean },
): string[] {
  const floor = ENERGY_FLOOR_KCAL + (opts.breastfeeding ? LACTATION_ALLOWANCE_KCAL : 0);
  const concerns: string[] = [];
  if (kcal < floor) {
    concerns.push(
      opts.breastfeeding
        ? `${kcal} kcal is below ${floor} — the floor plus roughly ${LACTATION_ALLOWANCE_KCAL} kcal for breastfeeding. Milk supply and recovery both suffer first.`
        : `${kcal} kcal is below the ${floor} kcal floor this app will not quietly recommend.`,
    );
  }
  return concerns;
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

interface TargetRow {
  id: string;
  effective_from: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  note: string | null;
}

function toTarget(row: TargetRow): NutritionTarget {
  return {
    id: row.id,
    effectiveFrom: row.effective_from,
    kcal: row.kcal,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    note: row.note,
  };
}

/** Every target ever set, newest first — the history is the point of the table. */
export async function listTargets(
  supabase: VelaClient,
  clientId: string,
): Promise<NutritionTarget[]> {
  const { data } = await supabase
    .from('nutrition_targets')
    .select('id, effective_from, kcal, protein_g, carbs_g, fat_g, note')
    .eq('client_id', clientId)
    .order('effective_from', { ascending: false });
  return (data ?? []).map(toTarget);
}

/** The target in force today, resolved in the database so both apps agree. */
export async function currentTarget(
  supabase: VelaClient,
  clientId: string,
  on: string,
): Promise<NutritionTarget | null> {
  const { data } = await supabase.rpc('nutrition_target_on', { p_client: clientId, p_on: on });
  const row = (Array.isArray(data) ? data[0] : data) as TargetRow | null;
  return row?.id ? toTarget(row) : null;
}

export async function setTarget(
  supabase: VelaClient,
  input: {
    clientId: string;
    coachId: string;
    effectiveFrom: string;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    note?: string;
  },
): Promise<{ error: string | null }> {
  // Upsert on (client, date): re-saving the same effective date is a correction, not a
  // second target. Two rows for one day would make `nutrition_target_on` arbitrary.
  const { error } = await supabase.from('nutrition_targets').upsert(
    {
      client_id: input.clientId,
      coach_id: input.coachId,
      effective_from: input.effectiveFrom,
      kcal: input.kcal,
      protein_g: input.proteinG,
      carbs_g: input.carbsG,
      fat_g: input.fatG,
      note: input.note?.trim() || null,
    },
    { onConflict: 'client_id,effective_from' },
  );
  return { error: error?.message ?? null };
}

export async function deleteTarget(
  supabase: VelaClient,
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('nutrition_targets').delete().eq('id', id);
  return { error: error?.message ?? null };
}

// ---------------------------------------------------------------------------
// Foods
// ---------------------------------------------------------------------------

interface FoodRow {
  id: string;
  coach_id: string | null;
  source: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  serving_name: string | null;
  serving_g: number | null;
  kcal_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
}

function toFood(row: FoodRow): Food {
  return {
    id: row.id,
    coachId: row.coach_id,
    source: row.source as FoodSource,
    barcode: row.barcode,
    name: row.name,
    brand: row.brand,
    servingName: row.serving_name,
    servingG: row.serving_g === null ? null : Number(row.serving_g),
    per100g: {
      kcal: Number(row.kcal_100g),
      proteinG: Number(row.protein_100g),
      carbsG: Number(row.carbs_100g),
      fatG: Number(row.fat_100g),
    },
  };
}

const FOOD_COLUMNS =
  'id, coach_id, source, barcode, name, brand, serving_name, serving_g, kcal_100g, protein_100g, carbs_100g, fat_100g';

export async function searchFoods(
  supabase: VelaClient,
  query: string,
  limit = 20,
): Promise<Food[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  // Escape the wildcards rather than interpolating raw input into the pattern: a stray
  // % turns "search" into "return everything".
  const pattern = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const { data } = await supabase
    .from('foods')
    .select(FOOD_COLUMNS)
    .or(`name.ilike.${pattern},brand.ilike.${pattern}`)
    .order('name')
    .limit(limit);
  return (data ?? []).map(toFood);
}

export async function foodByBarcode(
  supabase: VelaClient,
  barcode: string,
): Promise<Food | null> {
  const { data } = await supabase
    .from('foods')
    .select(FOOD_COLUMNS)
    .eq('barcode', barcode)
    .eq('source', 'off')
    .maybeSingle();
  return data ? toFood(data) : null;
}

export async function createCustomFood(
  supabase: VelaClient,
  coachId: string,
  input: {
    name: string;
    brand?: string;
    servingName?: string;
    servingG?: number | null;
    per100g: Macros;
  },
): Promise<{ food: Food | null; error: string | null }> {
  const { data, error } = await supabase
    .from('foods')
    .insert({
      coach_id: coachId,
      source: 'custom',
      name: input.name.trim(),
      brand: input.brand?.trim() || null,
      serving_name: input.servingName?.trim() || null,
      serving_g: input.servingG ?? null,
      kcal_100g: input.per100g.kcal,
      protein_100g: input.per100g.proteinG,
      carbs_100g: input.per100g.carbsG,
      fat_100g: input.per100g.fatG,
    })
    .select(FOOD_COLUMNS)
    .single();
  return { food: data ? toFood(data) : null, error: error?.message ?? null };
}

/**
 * Caches a product looked up from Open Food Facts.
 *
 * Races are expected: two clients scanning the same tin at once both try to insert. The
 * unique index settles it, and the loser simply reads the winner's row — hence the
 * re-select on a duplicate rather than an error the caller has to think about.
 */
export async function cacheOffFood(
  supabase: VelaClient,
  input: {
    barcode: string;
    name: string;
    brand?: string | null;
    servingName?: string | null;
    servingG?: number | null;
    per100g: Macros;
  },
): Promise<{ food: Food | null; error: string | null }> {
  const { data, error } = await supabase
    .from('foods')
    .insert({
      coach_id: null,
      source: 'off',
      barcode: input.barcode,
      name: input.name.trim(),
      brand: input.brand?.trim() || null,
      serving_name: input.servingName?.trim() || null,
      serving_g: input.servingG ?? null,
      kcal_100g: input.per100g.kcal,
      protein_100g: input.per100g.proteinG,
      carbs_100g: input.per100g.carbsG,
      fat_100g: input.per100g.fatG,
    })
    .select(FOOD_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') {
      const existing = await foodByBarcode(supabase, input.barcode);
      if (existing) return { food: existing, error: null };
    }
    return { food: null, error: error.message };
  }
  return { food: data ? toFood(data) : null, error: null };
}

// ---------------------------------------------------------------------------
// The diary
// ---------------------------------------------------------------------------

interface LogRow {
  id: string;
  logged_on: string;
  meal: string;
  food_id: string | null;
  description: string;
  quantity_g: number | null;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  source: string;
}

function toLog(row: LogRow): FoodLogEntry {
  return {
    id: row.id,
    loggedOn: row.logged_on,
    meal: row.meal as MealSlot,
    foodId: row.food_id,
    description: row.description,
    quantityG: row.quantity_g === null ? null : Number(row.quantity_g),
    kcal: Number(row.kcal),
    proteinG: Number(row.protein_g),
    carbsG: Number(row.carbs_g),
    fatG: Number(row.fat_g),
    source: row.source as FoodLogSource,
  };
}

const LOG_COLUMNS =
  'id, logged_on, meal, food_id, description, quantity_g, kcal, protein_g, carbs_g, fat_g, source';

export async function listFoodLogs(
  supabase: VelaClient,
  opts: { clientId: string; from: string; to?: string },
): Promise<FoodLogEntry[]> {
  let q = supabase
    .from('food_logs')
    .select(LOG_COLUMNS)
    .eq('client_id', opts.clientId)
    .gte('logged_on', opts.from)
    .order('logged_on', { ascending: true })
    .order('created_at', { ascending: true });
  if (opts.to) q = q.lte('logged_on', opts.to);

  const { data } = await q;
  return (data ?? []).map(toLog);
}

export async function logFood(
  supabase: VelaClient,
  input: {
    clientId: string;
    loggedOn: string;
    meal: MealSlot;
    foodId?: string | null;
    description: string;
    quantityG?: number | null;
    macros: Macros;
    source: FoodLogSource;
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('food_logs').insert({
    client_id: input.clientId,
    logged_on: input.loggedOn,
    meal: input.meal,
    food_id: input.foodId ?? null,
    description: input.description.trim(),
    quantity_g: input.quantityG ?? null,
    // Copied, not joined: correcting a food next month must not rewrite this entry.
    kcal: input.macros.kcal,
    protein_g: input.macros.proteinG,
    carbs_g: input.macros.carbsG,
    fat_g: input.macros.fatG,
    source: input.source,
  });
  return { error: error?.message ?? null };
}

export async function deleteFoodLog(
  supabase: VelaClient,
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('food_logs').delete().eq('id', id);
  return { error: error?.message ?? null };
}

/** Daily totals against the target in force on each day, computed in the database. */
export async function nutritionDays(
  supabase: VelaClient,
  clientId: string,
  from: string,
  to: string,
): Promise<NutritionDay[]> {
  const { data } = await supabase.rpc('nutrition_days', {
    p_client: clientId,
    p_from: from,
    p_to: to,
  });
  return ((data as unknown[]) ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      day: r.day as string,
      kcal: Number(r.kcal),
      proteinG: Number(r.protein_g),
      carbsG: Number(r.carbs_g),
      fatG: Number(r.fat_g),
      entries: Number(r.entries),
      targetKcal: r.target_kcal === null ? null : Number(r.target_kcal),
      targetProteinG: r.target_protein_g === null ? null : Number(r.target_protein_g),
    };
  });
}

/**
 * A day counts as logged if it has any entry at all, and as on-target if its energy is
 * within tolerance of the target.
 *
 * Deliberately two separate numbers. "She logged 6 of 7 days" and "3 of those hit the
 * target" say different things, and collapsing them into one adherence percentage hides
 * whichever one you actually needed.
 */
export function adherence(
  days: NutritionDay[],
  tolerance = 0.1,
): { logged: number; total: number; onTarget: number; targetedDays: number } {
  const logged = days.filter((d) => d.entries > 0).length;
  const targeted = days.filter((d) => d.entries > 0 && d.targetKcal !== null);
  const onTarget = targeted.filter(
    (d) => Math.abs(d.kcal - (d.targetKcal as number)) <= (d.targetKcal as number) * tolerance,
  ).length;
  return { logged, total: days.length, onTarget, targetedDays: targeted.length };
}
