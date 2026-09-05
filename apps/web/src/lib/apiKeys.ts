import 'server-only';

import { hashApiKey } from '@vela/api';
import { adminClient, mintAccessToken } from '@/lib/impersonate';

/**
 * Turns a personal API key into a session for the coach who minted it.
 *
 * Hash the key, find the row, mint a session for that coach — see `impersonate.ts` for
 * how and why. The row is checked on every request so that revoking a key in the portal
 * takes effect on the next call, not an hour later when the cached session expires.
 */
export async function sessionForApiKey(key: string): Promise<string | null> {
  const admin = adminClient();
  if (!admin) return null;

  const hash = await hashApiKey(key);
  const { data: row } = await admin
    .from('api_keys')
    .select('id, coach_id, revoked_at')
    .eq('key_hash', hash)
    .maybeSingle();
  if (!row || row.revoked_at) return null;

  // Awaited, although "last used" is only a courtesy to the coach: the query builder
  // runs when it is awaited and not before, so a fire-and-forget here would never write.
  await admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.id);

  return mintAccessToken(row.coach_id);
}
