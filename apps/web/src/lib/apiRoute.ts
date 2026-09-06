import 'server-only';

import { NextResponse } from 'next/server';
import type { VelaClient } from '@vela/api';
import { createRequestSupabase } from '@/lib/supabase/server';

/**
 * The one thing every route under /api needs first: who is calling.
 *
 * Returns the coach's client and id, or the 401 to send back. Kept as a helper so the
 * routes read as "authenticate, then do the thing" and the wording of the refusal — which
 * an assistant on the other end will relay to the coach — is the same everywhere.
 */
export const requireCoach = requireUser;

/**
 * The client row that IS the signed-in user, or null when she is not a client.
 *
 * Filtered on profile_id and not left to RLS: a coach's session also sees her clients'
 * rows, and a coach with exactly one client would otherwise come back as that client.
 */
export async function clientIdFor(supabase: VelaClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('clients')
    .select('id')
    .eq('profile_id', userId)
    .maybeSingle();
  // A failed lookup must not read as "not a client": say what failed, where it can be seen.
  if (error) console.error('[vela] clientIdFor failed:', error.code, error.message);
  return data?.id ?? null;
}

/** The refusal the client-only routes send, with enough context to act on. */
export function notAClient(action: string): NextResponse {
  return NextResponse.json(
    {
      error: `Only a client can ${action}. This account has no client row linked to it — if you were invited, open the invitation link and choose a password first, or ask your physiotherapist to invite you again.`,
    },
    { status: 403 },
  );
}

export async function requireUser(
  req: Request,
): Promise<
  | { supabase: VelaClient; userId: string; refused: null }
  | { supabase: null; userId: null; refused: NextResponse }
> {
  const supabase = await createRequestSupabase(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase: null,
      userId: null,
      refused: NextResponse.json(
        {
          error:
            'Not signed in. Send a personal API key from Settings → API keys, or a Supabase access token, as "Authorization: Bearer …".',
        },
        { status: 401 },
      ),
    };
  }
  return { supabase, userId: user.id, refused: null };
}
