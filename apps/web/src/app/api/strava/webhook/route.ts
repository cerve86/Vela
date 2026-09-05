import { NextResponse } from 'next/server';
import { adminClient, clientAsUser } from '@/lib/impersonate';
import { stravaConfig, syncStrava } from '@/lib/strava';

/**
 * Strava's webhook. GET answers the subscription handshake; POST receives events.
 *
 * Strava wants a 200 within two seconds, so the event is acknowledged first and the
 * import runs after. The event names an athlete, not a client; the link table maps one
 * to the other and the import runs as her.
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
    const { data: link } = await admin
      .from('strava_links')
      .select('client_id')
      .eq('athlete_id', event.owner_id)
      .maybeSingle();
    if (link) {
      await admin.from('strava_tokens').delete().eq('client_id', link.client_id);
      await admin.from('strava_links').delete().eq('client_id', link.client_id);
    }
    return NextResponse.json({ ok: true });
  }

  if (
    event.object_type === 'activity' &&
    (event.aspect_type === 'create' || event.aspect_type === 'update') &&
    event.owner_id
  ) {
    const { data: link } = await admin
      .from('strava_links')
      .select('client_id, profile_id')
      .eq('athlete_id', event.owner_id)
      .maybeSingle();
    if (link) {
      const asUser = await clientAsUser(link.profile_id);
      if (asUser) await syncStrava(cfg, admin, asUser, link.client_id);
    }
  }
  return NextResponse.json({ ok: true });
}
