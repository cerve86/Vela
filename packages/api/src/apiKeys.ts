import type { VelaClient } from './client';

/**
 * Personal API keys: a long-lived credential a coach mints for a tool that acts as her.
 *
 * The shape follows the usual conventions so nothing about it needs explaining: a fixed
 * prefix that makes a key recognisable in a log or a config file, then 40 characters of
 * randomness. Only the hash is stored; the key is shown once at creation. Resolving a key
 * to a session is the server's job (it needs the service role to look the hash up before
 * there is a session to filter by) and lives in the portal, not here.
 */

export const API_KEY_PREFIX = 'vela_';
const KEY_LENGTH = 40;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** Characters of the key shown in lists — enough to tell keys apart, useless on its own. */
const SHOWN_PREFIX_LENGTH = API_KEY_PREFIX.length + 6;

export interface ApiKey {
  id: string;
  name: string;
  /** e.g. "vela_Ab3xY9" — the first characters, never more. */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export function isApiKey(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

/**
 * A fresh key from the platform's CSPRNG. Rejection sampling rather than modulo, so
 * every character is equally likely — modulo bias on a 62-symbol alphabet is small, but
 * "small" is not a property a credential generator should have to argue about.
 */
export function generateApiKey(): string {
  const limit = 256 - (256 % ALPHABET.length); // 248: bytes at or above are redrawn
  let out = '';
  while (out.length < KEY_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
    for (const b of bytes) {
      if (b < limit && out.length < KEY_LENGTH) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return API_KEY_PREFIX + out;
}

/** sha256, hex. What the database stores and what the server looks up by. */
export async function hashApiKey(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function listApiKeys(supabase: VelaClient): Promise<ApiKey[]> {
  const { data } = await supabase
    .from('api_keys')
    .select('id, name, prefix, created_at, last_used_at, revoked_at')
    .order('created_at', { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
  }));
}

/**
 * Mints a key. The returned `key` is the only copy there will ever be.
 */
export async function createApiKey(
  supabase: VelaClient,
  coachId: string,
  name: string,
): Promise<{ id: string | null; key: string | null; error: string | null }> {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { id: null, key: null, error: 'Give the key a name.' };
  if (trimmed.length > 60)
    return { id: null, key: null, error: 'Keep the name under 60 characters.' };

  const key = generateApiKey();
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      coach_id: coachId,
      name: trimmed,
      key_hash: await hashApiKey(key),
      prefix: key.slice(0, SHOWN_PREFIX_LENGTH),
    })
    .select('id')
    .single();

  if (error || !data)
    return { id: null, key: null, error: error?.message ?? 'Could not create the key.' };
  return { id: data.id, key, error: null };
}

/**
 * Revoke rather than delete: the row stays so the coach can see that a key existed, what
 * it was called and when it was last used — which is the question she has if she is
 * revoking it because something looked wrong.
 */
export async function revokeApiKey(
  supabase: VelaClient,
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null);
  return { error: error?.message ?? null };
}
