import { NextResponse } from 'next/server';
import { clientIdFor, notAClient, requireUser } from '@/lib/apiRoute';
import { authorizeUrl, signState, stravaConfig } from '@/lib/strava';

/**
 * POST /api/strava/connect — the URL the app opens to let the athlete consent.
 *
 * The state carries who is connecting, signed with the client secret, so the callback
 * can trust it without a table of pending handshakes.
 */
export async function POST(req: Request) {
  const cfg = stravaConfig();
  if (!cfg)
    return NextResponse.json(
      { error: 'Strava is not configured on this portal.' },
      { status: 503 },
    );

  const { supabase, userId, refused } = await requireUser(req);
  if (refused) return refused;
  const clientId = await clientIdFor(supabase, userId);
  if (!clientId) return notAClient('connect Strava');

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;
  const url = authorizeUrl(cfg, signState(cfg, clientId, userId), `${site}/api/strava/callback`);
  return NextResponse.json({ url });
}
