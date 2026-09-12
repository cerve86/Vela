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
export type KeyResolution =
  | { ok: true; token: string; prefix: string }
  | { ok: false; reason: 'unknown' | 'revoked' | 'expired' | 'limited' | 'unavailable' };

/**
 * How many calls one key may make per minute. Generous for an assistant working through
 * a client's week; a wall for a key that has leaked into a loop. Per server instance,
 * which is the honest limit of an in-memory counter and enough for the abuse it stops.
 */
const RATE_LIMIT_PER_MINUTE = 120;
const window = new Map<string, number[]>();
function limited(hash: string): boolean {
  const now = Date.now();
  const recent = (window.get(hash) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  window.set(hash, recent);
  return recent.length > RATE_LIMIT_PER_MINUTE;
}

export async function sessionForApiKey(key: string): Promise<KeyResolution> {
  const admin = adminClient();
  if (!admin) return { ok: false, reason: 'unavailable' };

  const hash = await hashApiKey(key);
  if (limited(hash)) return { ok: false, reason: 'limited' };

  const { data: row } = await admin
    .from('api_keys')
    .select('id, coach_id, prefix, revoked_at, expires_at')
    .eq('key_hash', hash)
    .maybeSingle();
  if (!row) return { ok: false, reason: 'unknown' };
  if (row.revoked_at) return { ok: false, reason: 'revoked' };
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now())
    return { ok: false, reason: 'expired' };

  // Awaited, although "last used" is only a courtesy to the coach: the query builder
  // runs when it is awaited and not before, so a fire-and-forget here would never write.
  await admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.id);

  const token = await mintAccessToken(row.coach_id);
  if (!token) return { ok: false, reason: 'unavailable' };
  return { ok: true, token, prefix: row.prefix };
}
