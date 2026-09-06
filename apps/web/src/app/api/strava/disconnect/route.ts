import { NextResponse } from 'next/server';
import { clientIdFor, requireUser } from '@/lib/apiRoute';
import { adminClient } from '@/lib/impersonate';
import { deauthorize, stravaConfig, usableAccessToken } from '@/lib/strava';

/**
 * POST /api/strava/disconnect — forget the tokens and tell Strava so.
 *
 * Imported activities stay: they happened, and they are her sessions now.
 */
export async function POST(req: Request) {
  const { supabase, userId, refused } = await requireUser(req);
  if (refused) return refused;
  const clientId = await clientIdFor(supabase, userId);
  if (!clientId)
    return NextResponse.json({ error: 'Only a client can disconnect Strava.' }, { status: 403 });
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: 'Server is not configured.' }, { status: 500 });

  // Refresh before revoking: an access token lasts six hours, and revoking with a stale
  // one is a silent 401 that leaves Vela authorised on her Strava account.
  const cfg = stravaConfig();
  let deauthorized = false;
  if (cfg) {
    const accessToken = await usableAccessToken(cfg, admin, clientId).catch(() => null);
    if (accessToken) deauthorized = await deauthorize(cfg, accessToken);
  }

  await admin.from('strava_tokens').delete().eq('client_id', clientId);
  await admin.from('strava_links').delete().eq('client_id', clientId);
  return NextResponse.json({ ok: true, deauthorized });
}
