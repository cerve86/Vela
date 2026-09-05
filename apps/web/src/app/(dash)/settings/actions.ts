'use server';

import { revalidatePath } from 'next/cache';
import { createApiKey, listApiKeys, revokeApiKey } from '@vela/api';
import { createServerSupabase } from '@/lib/supabase/server';

async function ctx() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

export async function loadApiKeys() {
  const { supabase } = await ctx();
  return listApiKeys(supabase);
}

export interface CreateKeyResult {
  ok: boolean;
  /** Shown once. The page never sees it again and neither does the server. */
  key?: string;
  error?: string;
}

export async function createApiKeyAction(formData: FormData): Promise<CreateKeyResult> {
  const { supabase, userId } = await ctx();
  if (!userId) return { ok: false, error: 'Not signed in.' };

  const { key, error } = await createApiKey(supabase, userId, String(formData.get('name') ?? ''));
  if (error || !key) return { ok: false, error: error ?? 'Could not create the key.' };

  revalidatePath('/settings');
  return { ok: true, key };
}

export async function revokeApiKeyAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await ctx();
  if (!userId) return { ok: false, error: 'Not signed in.' };

  const { error } = await revokeApiKey(supabase, id);
  if (error) return { ok: false, error };

  revalidatePath('/settings');
  return { ok: true };
}
