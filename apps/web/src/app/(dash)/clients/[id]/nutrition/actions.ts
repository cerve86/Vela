'use server';

import { revalidatePath } from 'next/cache';
import { deleteTarget, setTarget } from '@vela/api';
import { createServerSupabase } from '@/lib/supabase/server';

export interface Result {
  ok: boolean;
  error?: string;
}

function intField(form: FormData, name: string): number | null {
  const raw = form.get(name);
  const n = Number(typeof raw === 'string' ? raw.trim() : NaN);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export async function setTargetAction(clientId: string, form: FormData): Promise<Result> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const kcal = intField(form, 'kcal');
  const proteinG = intField(form, 'proteinG');
  const carbsG = intField(form, 'carbsG');
  const fatG = intField(form, 'fatG');
  const effectiveFrom = String(form.get('effectiveFrom') ?? '').trim();

  if (kcal === null || proteinG === null || carbsG === null || fatG === null) {
    return { ok: false, error: 'Every macro needs a number.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    return { ok: false, error: 'Pick a date this target starts from.' };
  }

  // The macro split is checked against the stated energy rather than trusted: 4/4/9
  // kcal per gram is arithmetic, and a target whose parts contradict its total would
  // make every adherence number downstream meaningless.
  const fromMacros = proteinG * 4 + carbsG * 4 + fatG * 9;
  if (Math.abs(fromMacros - kcal) > kcal * 0.1) {
    return {
      ok: false,
      error: `Those macros come to ${Math.round(fromMacros)} kcal, more than 10% away from the ${kcal} kcal target.`,
    };
  }

  const { error } = await setTarget(supabase, {
    clientId,
    coachId: user.id,
    effectiveFrom,
    kcal,
    proteinG,
    carbsG,
    fatG,
    note: String(form.get('note') ?? ''),
  });
  if (error) return { ok: false, error };

  revalidatePath(`/clients/${clientId}/nutrition`);
  return { ok: true };
}

export async function deleteTargetAction(clientId: string, targetId: string): Promise<Result> {
  const supabase = await createServerSupabase();
  const { error } = await deleteTarget(supabase, targetId);
  if (error) return { ok: false, error };
  revalidatePath(`/clients/${clientId}/nutrition`);
  return { ok: true };
}
