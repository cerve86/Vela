import { NextResponse, after } from 'next/server';
import { adminClient, clientAsUser } from '@/lib/impersonate';
import { stravaConfig, syncStravaActivity } from '@/lib/strava';

/**
 * Strava's webhook. GET answers the subscription handshake; POST receives events.
 *
 * Strava wants a 200 within two seconds and retries otherwise, so the event is answered
 * first and the import runs after the response has gone (`after`). The event names an
 * athlete and one activity: the link table maps the athlete to a client, and only that
 * activity is fetched and filed, as her.
 */
export async function GET(req: Request) {
  const cfg = stravaConfig();
  const params = new URL(req.url).searchParams;
  if (!cfg || params.get('hub.verify_token') !== cfg.verifyToken) {
    return NextResponse.json({ error: 'Bad verify token.' }, { status: 403 });
  }
  return NextResponse.json({ 'hub.challenge': params.get('hub.challenge') });
}

export async function POST(req: Request) {
  const cfg = stravaConfig();
  const admin = adminClient();
  if (!cfg || !admin) return NextResponse.json({ ok: false }, { status: 503 });

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
      if (link) {
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
        .select('client_id, profile_id')
        .eq('athlete_id', ownerId)
        .maybeSingle();
      if (!link) return;
      const asUser = await clientAsUser(link.profile_id);
      if (asUser) await syncStravaActivity(cfg, admin, asUser, link.client_id, activityId);
    });
  }
  return NextResponse.json({ ok: true });
}
