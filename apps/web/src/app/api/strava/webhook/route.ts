import { timingSafeEqual } from 'node:crypto';
import { NextResponse, after } from 'next/server';
import { adminClient, clientAsUser } from '@/lib/impersonate';
import { stravaConfig, syncStravaActivity, tokenStillValid } from '@/lib/strava';

/**
 * Strava's webhook. GET answers the subscription handshake; POST receives events.
 *
 * Strava wants a 200 within two seconds and retries otherwise, so the event is answered
 * first and the import runs after the response has gone (`after`). The event names an
 * athlete and one activity: the link table maps the athlete to a client, and only that
 * activity is fetched and filed, as her.
 *
 * Strava does not sign events, so the subscription is registered with the verify token
 * in the callback URL (`?k=…`) and every POST must carry it. Athlete ids are public;
 * without the secret anyone could disconnect an athlete or push an activity into her
 * record. Nothing in the body is trusted beyond naming who to look at: a fetched
 * activity is filed only if Strava says it is hers, and a deauthorisation is believed
 * only once her token has actually stopped working.
 */
function carriesSecret(req: Request, secret: string): boolean {
  const given = Buffer.from(new URL(req.url).searchParams.get('k') ?? '');
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

export async function GET(req: Request) {
  const cfg = stravaConfig();
  const params = new URL(req.url).searchParams;
  if (
    !cfg ||
    params.get('hub.verify_token') !== cfg.verifyToken ||
    !carriesSecret(req, cfg.verifyToken)
  ) {
    return NextResponse.json({ error: 'Bad verify token.' }, { status: 403 });
  }
  return NextResponse.json({ 'hub.challenge': params.get('hub.challenge') });
}

export async function POST(req: Request) {
  const cfg = stravaConfig();
  const admin = adminClient();
  if (!cfg || !admin) return NextResponse.json({ ok: false }, { status: 503 });
  if (!carriesSecret(req, cfg.verifyToken))
    return NextResponse.json({ ok: false }, { status: 403 });

  let event: {
    object_type?: string;
    aspect_type?: string;
    owner_id?: number;
    object_id?: number;
    updates?: Record<string, string>;
  };
  try {
    event = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (event.object_type === 'athlete' && event.updates?.authorized === 'false' && event.owner_id) {
    const ownerId = event.owner_id;
    after(async () => {
      const { data: link } = await admin
        .from('strava_links')
        .select('client_id')
        .eq('athlete_id', ownerId)
        .maybeSingle();
      // Believed only when her token has in fact been revoked: Strava answers 401.
      if (link && !(await tokenStillValid(cfg, admin, link.client_id))) {
        await admin.from('strava_tokens').delete().eq('client_id', link.client_id);
        await admin.from('strava_links').delete().eq('client_id', link.client_id);
      }
    });
    return NextResponse.json({ ok: true });
  }

  if (
    event.object_type === 'activity' &&
    (event.aspect_type === 'create' || event.aspect_type === 'update') &&
    event.owner_id &&
    event.object_id
  ) {
    const ownerId = event.owner_id;
    const activityId = event.object_id;
    after(async () => {
      const { data: link } = await admin
        .from('strava_links')
        .select('client_id, profile_id, athlete_id')
        .eq('athlete_id', ownerId)
        .maybeSingle();
      if (!link) return;
      const asUser = await clientAsUser(link.profile_id);
      if (asUser)
        await syncStravaActivity(
          cfg,
          admin,
          asUser,
          link.client_id,
          activityId,
          Number(link.athlete_id),
        );
    });
  }
  return NextResponse.json({ ok: true });
}
