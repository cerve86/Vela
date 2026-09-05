import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { isApiKey } from '@vela/api';
import type { Database } from '@vela/api/types';
import { sessionForApiKey } from '@/lib/apiKeys';

/**
 * A client for a Route Handler: the Bearer credential if the request carries one, else
 * the session cookie.
 *
 * A script has no cookie jar; a browser has no reason to mint a token. Accepting both on
 * the same route means the upload form and a curl command hit identical code, and the
 * database still decides what the caller may touch.
 *
 * Two kinds of Bearer credential. A Supabase access token is the coach's own session and
 * is used as it is. A personal API key (`vela_…`) is resolved to a session for the coach
 * who minted it — see `sessionForApiKey` — and then treated identically. Either way RLS
 * sees exactly who she is. A key that does not resolve becomes a client with no usable
 * session, so the handler's `getUser` fails and it answers 401 like any other stranger.
 */
export async function createRequestSupabase(req: Request) {
  const auth = req.headers.get('authorization') ?? '';
  const credential = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!credential) return createServerSupabase();

  const token = isApiKey(credential) ? await sessionForApiKey(credential) : credential;

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      global: { headers: { Authorization: `Bearer ${token ?? 'no-such-key'}` } },
    },
  );
}

/**
 * Server-side client. Reads the session from cookies so Server Components and Route
 * Handlers run every query as the signed-in coach, which means RLS — not application
 * code — decides what they can see.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot set cookies; middleware refreshes the session
            // instead, so swallowing this is correct rather than merely convenient.
          }
        },
      },
    },
  );
}
