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

/** A client row for the signed-in user, when she is one. RLS returns only her own. */
export async function clientIdFor(supabase: VelaClient): Promise<string | null> {
  const { data } = await supabase.from('clients').select('id').maybeSingle();
  return data?.id ?? null;
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
