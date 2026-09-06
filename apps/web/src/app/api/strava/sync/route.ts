import { NextResponse } from 'next/server';
import { clientIdFor, notAClient, requireUser } from '@/lib/apiRoute';
import { adminClient } from '@/lib/impersonate';
import { stravaConfig, syncStrava } from '@/lib/strava';

/** POST /api/strava/sync — pull what is new, as the signed-in client. */
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
  if (!clientId) return notAClient('sync Strava');
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: 'Server is not configured.' }, { status: 500 });

  const result = await syncStrava(cfg, admin, supabase, clientId);
  return NextResponse.json(result, { status: result.error ? 502 : 200 });
}
