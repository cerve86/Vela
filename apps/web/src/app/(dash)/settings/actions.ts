'use server';

import { revalidatePath } from 'next/cache';
import { createApiKey, friendlyError, listApiKeys, revokeApiKey } from '@vela/api';
import { createServerSupabase } from '@/lib/supabase/server';

async function ctx() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

/**
 * The keys, with their dates already words and `expired` already decided.
 *
 * Both are worked out here and not in render: a clock in render is impure, and a date
 * formatted in the browser's locale did not match the one the server rendered, which
 * failed hydration on the whole page.
 */
export async function loadApiKeys() {
  const { supabase } = await ctx();
  const now = Date.now();
  return (await listApiKeys(supabase)).map((k) => ({
    ...k,
    createdLabel: when(k.createdAt),
    lastUsedLabel: when(k.lastUsedAt),
    expiresLabel:
      k.expiresAt === null
        ? '—'
        : new Date(k.expiresAt).getTime() < now
          ? 'Expired'
          : when(k.expiresAt),
    expired: k.expiresAt !== null && new Date(k.expiresAt).getTime() < now,
  }));
}

function when(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
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
  if (error || !key)
    return { ok: false, error: friendlyError(error ?? 'Could not create the key.') };

  revalidatePath('/settings');
  return { ok: true, key };
}

export async function revokeApiKeyAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await ctx();
  if (!userId) return { ok: false, error: 'Not signed in.' };

  const { error } = await revokeApiKey(supabase, id);
  if (error) return { ok: false, error: friendlyError(error) };

  revalidatePath('/settings');
  return { ok: true };
}
