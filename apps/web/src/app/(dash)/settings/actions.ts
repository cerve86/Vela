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

/**
 * WhatsApp is how her athletes reach her: the companion's contact buttons open this link.
 * The same three shapes the database accepts (profiles.whatsapp_url's check): a chat
 * (wa.me/<digits>), the long form (api.whatsapp.com/send?phone=<digits>) and a group invite
 * (chat.whatsapp.com/<code>).
 */
const WHATSAPP =
  /^https:\/\/(wa\.me\/[0-9]+|api\.whatsapp\.com\/send\?phone=[0-9]+|chat\.whatsapp\.com\/[A-Za-z0-9]+)/;

/**
 * What she typed, as the link to store: "" to clear, a full link as it is, the bare
 * "wa.me/…" without its https://, or a phone number with its country code ("+65 9123 4567"
 * or "0065 9123 4567") made into a wa.me link. 'country' for a number without one: wa.me
 * reads its first digits as a country code, so "415 555 0123" would reach a stranger in
 * Switzerland and "07700 900123" nobody. null when it is none of those.
 */
function normaliseWhatsApp(raw: string): string | 'country' | null {
  const s = raw.trim();
  if (!s) return '';
  if (/^[+\d][\d\s().-]{6,}$/.test(s)) {
    if (!/^(\+|00)/.test(s)) return 'country';
    const digits = s.replace(/\D/g, '').replace(/^00/, '');
    if (digits.startsWith('0')) return 'country';
    return digits.length >= 7 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
  }
  const url = /^https?:\/\//i.test(s) ? s.replace(/^http:\/\//i, 'https://') : `https://${s}`;
  const fixed = url.replace(/^https:\/\/(www\.)?/i, 'https://');
  return WHATSAPP.test(fixed) && !/\s/.test(fixed) ? fixed : null;
}

/** Her own link, or "" when she hasn't set one. */
export async function loadWhatsApp(): Promise<string> {
  const { supabase, userId } = await ctx();
  if (!userId) return '';
  const { data } = await supabase
    .from('profiles')
    .select('whatsapp_url')
    .eq('id', userId)
    .maybeSingle();
  return data?.whatsapp_url ?? '';
}

export async function saveWhatsAppAction(
  formData: FormData,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { supabase, userId } = await ctx();
  if (!userId) return { ok: false, error: 'Not signed in.' };

  const url = normaliseWhatsApp(String(formData.get('whatsapp') ?? ''));
  if (url === 'country')
    return {
      ok: false,
      error:
        'Add your country code so WhatsApp finds the right number, e.g. +44 7700 900123 (no leading 0 after it).',
    };
  if (url === null)
    return {
      ok: false,
      error:
        'That isn’t a WhatsApp link. Paste a wa.me link (https://wa.me/6591234567), a group invite (https://chat.whatsapp.com/…), or just your number with its country code.',
    };

  // Her own row, under profiles_self_update; the column grant allows this one field.
  const { data, error } = await supabase
    .from('profiles')
    .update({ whatsapp_url: url || null })
    .eq('id', userId)
    .select('id');
  if (error) return { ok: false, error: friendlyError(error.message) };
  if (!data?.length) return { ok: false, error: 'Could not save the link. Try again.' };

  revalidatePath('/settings');
  return { ok: true, url };
}
