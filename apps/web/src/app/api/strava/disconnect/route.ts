import { NextResponse } from 'next/server';
import { clientIdFor, requireUser } from '@/lib/apiRoute';
import { adminClient } from '@/lib/impersonate';
import { deauthorize, stravaConfig } from '@/lib/strava';

/**
 * POST /api/strava/disconnect — forget the tokens and tell Strava so.
 *
 * Imported activities stay: they happened, and they are her sessions now.
 */
export async function POST(req: Request) {
  const { supabase, refused } = await requireUser(req);
  if (refused) return refused;
  const clientId = await clientIdFor(supabase);
  if (!clientId)
    return NextResponse.json({ error: 'Only a client can disconnect Strava.' }, { status: 403 });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: 'Server is not configured.' }, { status: 500 });

  const cfg = stravaConfig();
  const { data: tokens } = await admin
    .from('strava_tokens')
    .select('access_token')
    .eq('client_id', clientId)
    .maybeSingle();
  if (cfg && tokens) await deauthorize(cfg, tokens.access_token);

  await admin.from('strava_tokens').delete().eq('client_id', clientId);
  await admin.from('strava_links').delete().eq('client_id', clientId);
  return NextResponse.json({ ok: true });
}
