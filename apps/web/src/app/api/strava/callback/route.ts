import { NextResponse } from 'next/server';
import { adminClient, clientAsUser } from '@/lib/impersonate';
import { exchangeCode, stravaConfig, syncStrava, verifyState } from '@/lib/strava';

const APP_RETURN = 'vela://strava';

/**
 * GET /api/strava/callback — where Strava sends the athlete back.
 *
 * Exchanges the code, stores the tokens with the service role, records the link, runs
 * the first import as her, and hands the phone back to the app by deep link. Every
 * failure also goes back to the app, as a word it can show, rather than stranding her
 * on a browser page.
 */
export async function GET(req: Request) {
  const cfg = stravaConfig();
  const params = new URL(req.url).searchParams;
  const back = (query: string) => NextResponse.redirect(`${APP_RETURN}?${query}`, { status: 302 });

  if (!cfg) return back('error=not_configured');
  if (params.get('error')) return back(`error=${encodeURIComponent(params.get('error')!)}`);

  const state = verifyState(cfg, params.get('state') ?? '');
  const code = params.get('code');
  if (!state || !code) return back('error=bad_state');

  const scope = params.get('scope') ?? '';
  if (!scope.includes('activity:read')) return back('error=scope');

  const admin = adminClient();
  if (!admin) return back('error=server');

  let tokens;
  try {
    tokens = await exchangeCode(cfg, code);
  } catch (e) {
    console.error('[vela] strava exchange failed:', e);
    return back('error=exchange');
  }
  if (!tokens.athlete?.id) return back('error=exchange');

  const athleteName =
    `${tokens.athlete.firstname ?? ''} ${tokens.athlete.lastname ?? ''}`.trim() || null;
  const { error: linkError } = await admin.from('strava_links').upsert(
    {
      client_id: state.clientId,
      profile_id: state.userId,
      athlete_id: tokens.athlete.id,
      athlete_name: athleteName,
      connected_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: 'client_id' },
  );
  const { error: tokenError } = await admin.from('strava_tokens').upsert(
    {
      client_id: state.clientId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(tokens.expires_at * 1000).toISOString(),
      scope,
    },
    { onConflict: 'client_id' },
  );
  if (linkError || tokenError) {
    console.error('[vela] strava link store failed:', linkError?.message ?? tokenError?.message);
    return back('error=store');
  }

  const asUser = await clientAsUser(state.userId);
  if (asUser) await syncStrava(cfg, admin, asUser, state.clientId);

  return back('connected=1');
}
