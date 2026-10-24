import type { FuelCard, FuelLines, FuelType } from '@vela/shared';
import type { VelaClient } from './client';

/**
 * The coach's fuelling and supplement cards, and each client's fuel settings.
 *
 * Read as the coach, these are all her cards; read as a client, row security returns
 * only her coach's published ones. Either way the caller merges them over the shipped
 * defaults with `mergeFuelCards`.
 */

function toCard(r: Record<string, unknown>): FuelCard {
  return {
    key: r.key as string,
    kind: r.kind as FuelCard['kind'],
    title: r.title as string,
    face: (r.face as FuelLines) ?? {},
    detail: (r.detail as FuelLines) ?? {},
    why: (r.why as string | null) ?? null,
    evidence: (r.evidence as FuelCard['evidence']) ?? null,
    tag: (r.tag as string | null) ?? null,
    published: r.published === true,
    sort: (r.sort as number) ?? 0,
  };
}

export async function listFuelCards(supabase: VelaClient): Promise<FuelCard[]> {
  const { data } = await supabase
    .from('fuel_cards')
    .select('key, kind, title, face, detail, why, evidence, tag, published, sort')
    .order('sort', { ascending: true });
  return (data ?? []).map((r) => toCard(r as Record<string, unknown>));
}

const clean = (lines: FuelLines): Record<string, string> =>
  Object.fromEntries(
    Object.entries(lines)
      .map(([k, v]) => [k, (v ?? '').trim()])
      .filter(([, v]) => v),
  );

export async function saveFuelCard(
  supabase: VelaClient,
  coachId: string,
  c: FuelCard,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('fuel_cards').upsert(
    {
      coach_id: coachId,
      key: c.key,
      kind: c.kind,
      title: c.title.trim() || 'Untitled',
      face: clean(c.face),
      detail: clean(c.detail),
      why: c.why?.trim() || null,
      evidence: c.evidence,
      tag: c.tag?.trim() || null,
      published: c.published,
      sort: c.sort,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'coach_id,key' },
  );
  return { error: error?.message ?? null };
}

/** Back to the shipped default: her row for that key goes. */
export async function resetFuelCard(
  supabase: VelaClient,
  key: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('fuel_cards').delete().eq('key', key);
  return { error: error?.message ?? null };
}

export interface FuelSettings {
  restrictivePattern: boolean;
  calorieTracking: boolean;
}

export async function getFuelSettings(
  supabase: VelaClient,
  clientId: string,
): Promise<FuelSettings> {
  const { data } = await supabase
    .from('clients')
    .select('restrictive_pattern, calorie_tracking')
    .eq('id', clientId)
    .maybeSingle();
  return {
    restrictivePattern: data?.restrictive_pattern ?? false,
    calorieTracking: data?.calorie_tracking ?? false,
  };
}

export async function saveFuelSettings(
  supabase: VelaClient,
  clientId: string,
  s: FuelSettings,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('clients')
    .update({ restrictive_pattern: s.restrictivePattern, calorie_tracking: s.calorieTracking })
    .eq('id', clientId);
  return { error: error?.message ?? null };
}

/** A day's fuelling type, or null to let the app read it from the day. */
export async function setDayFuelType(
  supabase: VelaClient,
  dayId: string,
  type: FuelType | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('program_days').update({ fuel_type: type }).eq('id', dayId);
  return { error: error?.message ?? null };
}

/** Everything she logged in the food diary, as CSV, oldest first. */
export async function foodLogCsv(supabase: VelaClient, clientId: string): Promise<string> {
  const { data } = await supabase
    .from('food_logs')
    .select('logged_on, meal, description, quantity_g, kcal, protein_g, carbs_g, fat_g, source')
    .eq('client_id', clientId)
    .order('logged_on', { ascending: true });
  const head = ['date', 'meal', 'food', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'source'];
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = (data ?? []).map((r) =>
    [
      r.logged_on,
      r.meal,
      r.description,
      r.quantity_g,
      r.kcal,
      r.protein_g,
      r.carbs_g,
      r.fat_g,
      r.source,
    ]
      .map(cell)
      .join(','),
  );
  return [head.join(','), ...rows].join('\n') + '\n';
}
