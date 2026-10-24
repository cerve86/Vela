'use server';

import { revalidatePath } from 'next/cache';
import { friendlyError, resetFuelCard, saveFuelCard } from '@vela/api';
import type { FuelCard } from '@vela/shared';
import { createServerSupabase } from '@/lib/supabase/server';

export interface Result {
  ok: boolean;
  error?: string;
}

/** Saves one card as hers, replacing the shipped default with the same key. */
export async function saveFuelCardAction(card: FuelCard): Promise<Result> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (/\d/.test(Object.values(card.face).join(' ')))
    return {
      ok: false,
      error: 'Keep numbers off the face of the card — amounts go in the detail behind the tap.',
    };
  const { error } = await saveFuelCard(supabase, user.id, card);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath('/fuel');
  return { ok: true };
}

/** Goes back to the shipped wording for that card. */
export async function resetFuelCardAction(key: string): Promise<Result> {
  const supabase = await createServerSupabase();
  const { error } = await resetFuelCard(supabase, key);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath('/fuel');
  return { ok: true };
}
