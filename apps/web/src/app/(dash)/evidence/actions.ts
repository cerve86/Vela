'use server';

import { revalidatePath } from 'next/cache';
import { deleteEvidence, friendlyError, saveEvidence, type EvidenceRef } from '@vela/api';
import { createServerSupabase } from '@/lib/supabase/server';

export interface Result {
  ok: boolean;
  error?: string;
}

export async function saveEvidenceAction(
  r: Omit<EvidenceRef, 'id'> & { id?: string },
): Promise<Result> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (!r.title.trim()) return { ok: false, error: 'Give the reference a title.' };
  const { error } = await saveEvidence(supabase, user.id, r);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath('/evidence');
  return { ok: true };
}

export async function deleteEvidenceAction(id: string): Promise<Result> {
  const supabase = await createServerSupabase();
  const { error } = await deleteEvidence(supabase, id);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath('/evidence');
  return { ok: true };
}
