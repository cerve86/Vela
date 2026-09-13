import { NextResponse } from 'next/server';
import { clientIdFor, notAClient, requireUser } from '@/lib/apiRoute';
import { adminClient } from '@/lib/impersonate';
import {
  atCapacity,
  authorizeUrl,
  capacityMessage,
  connectedAthletes,
  signState,
  stravaConfig,
} from '@/lib/strava';

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

  // Strava's cap on connected athletes is enforced on Strava's authorise page, after she
  // has left the app, as an error page with no way back. Refuse here instead, in words,
  // when the next athlete would be one too many. Reconnecting an athlete who already
  // holds a slot takes no new one, so she is let through.
  const { data: existing } = await supabase
    .from('strava_links')
    .select('client_id')
    .eq('client_id', clientId)
    .maybeSingle();
  if (!existing) {
    const admin = adminClient();
    if (!admin)
      return NextResponse.json(
        { error: 'The server is not configured for Strava.' },
        { status: 500 },
      );
    let connected: number;
    try {
      connected = await connectedAthletes(admin);
    } catch (e) {
      console.error('[vela] strava capacity check failed:', e);
      return NextResponse.json(
        { error: 'Could not check the Strava connection right now. Try again in a moment.' },
        { status: 503 },
      );
    }
    if (atCapacity(connected, cfg.athleteCapacity)) {
      console.error(
        `[vela] strava athlete capacity reached: ${connected} of ${cfg.athleteCapacity} connected; raise it at https://www.strava.com/settings/api and set STRAVA_ATHLETE_CAPACITY to match.`,
      );
      return NextResponse.json({ error: capacityMessage(cfg.athleteCapacity) }, { status: 503 });
    }
  }

  // The origin the app actually called, not a configured site URL: Strava checks the
  // redirect host against the application's callback domain to the letter, and a site
  // URL set without "www" (or to a preview host) is refused before the login screen.
  const site = requestOrigin(req);
  const url = authorizeUrl(cfg, signState(cfg, clientId, userId), `${site}/api/strava/callback`);
  return NextResponse.json({ url });
}

/** The public origin of this request, behind Vercel's proxy or not. */
function requestOrigin(req: Request): string {
  const forwardedHost = req.headers.get('x-forwarded-host');
  const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'https';
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`;
  return new URL(req.url).origin;
}
