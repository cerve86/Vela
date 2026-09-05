import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { hashApiKey } from '@vela/api';
import type { Database } from '@vela/api/types';

/**
 * Turns a personal API key into a session for the coach who minted it.
 *
 * The route handlers want one thing: a Supabase client that IS the coach, so that every
 * query runs through row level security as her and none of them needs permission logic.
 * A Bearer JWT gives them that directly. A key does not — it is a row in a table, and
 * looking that row up needs the service role, because there is no session yet to be
 * filtered by.
 *
 * So: hash the key, find the row, then mint a real session for that coach through the
 * admin API (a magic-link token generated and verified server-side, no email sent) and
 * hand back its access token. From there the request is indistinguishable from one
 * carrying her own session, which is the point. The service role is used for two reads
 * and one timestamp and never touches a domain table.
 *
 * Minted sessions are cached per key for their lifetime, but the row is checked on every
 * request so that revoking a key in the portal takes effect on the next call, not an hour
 * later when the cached session would have expired.
 */

interface Minted {
  accessToken: string;
  expiresAt: number;
}

const minted = new Map<string, Minted>();

/** Do not reuse a session inside its final minute; the request would outlive it. */
const EXPIRY_MARGIN_MS = 60_000;

export async function sessionForApiKey(key: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    console.error('[vela] API keys need SUPABASE_SERVICE_ROLE_KEY set; refusing the key.');
    return null;
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

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

  const cached = minted.get(hash);
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return cached.accessToken;

  const { data: userData } = await admin.auth.admin.getUserById(row.coach_id);
  const email = userData?.user?.email;
  if (!email) return null;

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error('[vela] could not mint a session for an API key:', linkError?.message);
    return null;
  }

  const anon = createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  const session = verified?.session;
  if (verifyError || !session) {
    console.error('[vela] could not verify a minted session for an API key:', verifyError?.message);
    return null;
  }

  minted.set(hash, {
    accessToken: session.access_token,
    expiresAt: (session.expires_at ?? 0) * 1000,
  });
  return session.access_token;
}
