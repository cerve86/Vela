import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@vela/api/types';

/**
 * A session for a user who has not signed in — minted server-side, never emailed.
 *
 * Three things arrive without a session and still need to act as somebody: a personal
 * API key, a calendar feed token, and a Strava webhook. Each resolves to a user id with
 * the service role, and from there everything is done as that user through row level
 * security. The service role reads a credential table and mints the session; it never
 * touches a domain row.
 *
 * Minting is an admin-generated magic-link token verified straight away. Sessions are
 * cached per user until shortly before they expire; the caller is responsible for
 * checking that the credential that led here is still valid on every call.
 */

interface Minted {
  accessToken: string;
  expiresAt: number;
}

const minted = new Map<string, Minted>();
const EXPIRY_MARGIN_MS = 60_000;

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return null;
  return { url, anonKey, serviceKey };
}

/** The service-role client, for credential tables only. Null when not configured. */
export function adminClient() {
  const e = env();
  if (!e) {
    console.error('[vela] SUPABASE_SERVICE_ROLE_KEY is not set; credential lookups are refused.');
    return null;
  }
  return createClient<Database>(e.url, e.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function mintAccessToken(userId: string): Promise<string | null> {
  const e = env();
  const admin = adminClient();
  if (!e || !admin) return null;

  const cached = minted.get(userId);
  if (cached && cached.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return cached.accessToken;

  const { data: userData } = await admin.auth.admin.getUserById(userId);
  const email = userData?.user?.email;
  if (!email) return null;

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error('[vela] could not mint a session:', linkError?.message);
    return null;
  }

  const anon = createClient<Database>(e.url, e.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });
  const session = verified?.session;
  if (verifyError || !session) {
    console.error('[vela] could not verify a minted session:', verifyError?.message);
    return null;
  }

  minted.set(userId, {
    accessToken: session.access_token,
    expiresAt: (session.expires_at ?? 0) * 1000,
  });
  return session.access_token;
}

/** A client that IS the user: every query through RLS as her. */
export function clientForToken(accessToken: string) {
  const e = env();
  return createServerClient<Database>(e!.url, e!.anonKey, {
    cookies: { getAll: () => [], setAll: () => {} },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export async function clientAsUser(userId: string) {
  const token = await mintAccessToken(userId);
  return token ? clientForToken(token) : null;
}
