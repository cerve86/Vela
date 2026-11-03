import { NextResponse } from 'next/server';
import { icuHasReading, icuWithheld } from '@vela/shared';
import { clientIdFor, notAClient, requireUser } from '@/lib/apiRoute';
import { ICU_ID, icuCheck, icuGet, icuKey, icuWindow } from '@/lib/intervals';

/**
 * GET /api/companion/intervals?metric=wellness|activities|events|status&days=N[&ahead=M]
 *
 * `ahead` (events only, 0–14, default 0) reaches M days past tomorrow, so the companion's
 * fuel plan can see tomorrow's long run (and a little beyond) on the calendar.
 *
 * `status` is the setup guide's question, "is my watch reaching Vela?":
 * {state: "no-key" | "no-athlete-id" | "denied" | "error" | "connected", conn?} with conn
 * as `readIcuConnection` reads it (packages/shared intervalsConnection.ts).
 *
 * The companion's window onto intervals.icu, for the signed-in athlete only. intervals.icu
 * takes HTTP Basic auth with the COACH's API key, which must never reach a browser — so
 * the athlete's page calls here with her own Supabase token, and this route reads her
 * intervals.icu id (from companion_profiles, under her own RLS) and fetches with the key.
 *
 * Answers an empty list while intervals.icu is not connected for her — no key on the
 * deployment, or no id on file — and the companion then reads the same things from Vela
 * instead (Strava runs, Apple Health HRV, her programme). Empty rather than 404, because
 * "not connected yet" is the normal state, not an error to log on every page load. So
 * this route can ship before the coach has a key.
 *
 * Two things are left out on the way through, so the companion's "intervals.icu when it
 * has something, Vela otherwise" means what it says:
 * - activities intervals.icu withholds (Strava's, as stubs with no data), which would
 *   otherwise stand in for the Strava runs Vela itself holds;
 * - wellness days with no reading on them (intervals.icu writes a row for every training
 *   day), which would otherwise stand in for her Apple Health HRV.
 *
 * Env: INTERVALS_API_KEY (Settings → Developer Settings on intervals.icu). A coach key
 * reads an athlete once she has accepted the coaching request.
 */
const METRICS = new Set(['wellness', 'activities', 'events', 'status']);

export async function GET(req: Request) {
  const { supabase, userId, refused } = await requireUser(req);
  if (refused) return refused;

  const clientId = await clientIdFor(supabase, userId);
  if (!clientId) return notAClient('read their intervals.icu data');

  const params = new URL(req.url).searchParams;
  const metricParam = params.get('metric') ?? 'wellness';
  const metric = METRICS.has(metricParam) ? metricParam : 'wellness';

  const key = icuKey();
  const notConnected = (why: 'no-key' | 'no-athlete-id') =>
    metric === 'status'
      ? NextResponse.json({ state: why })
      : NextResponse.json([], { headers: { 'x-intervals-status': why } });
  if (!key) return notConnected('no-key');

  const { data: profile } = await supabase
    .from('companion_profiles')
    .select('intervals_icu_id')
    .eq('client_id', clientId)
    .maybeSingle();
  const icuId = profile?.intervals_icu_id?.trim();
  if (!icuId || !ICU_ID.test(icuId)) return notConnected('no-athlete-id');

  if (metric === 'status') {
    const check = await icuCheck(key, icuId);
    // Her own name on intervals.icu adds nothing for her; the coach's portal shows it.
    return NextResponse.json(
      check.state === 'connected' ? { state: check.state, conn: check.conn } : check,
    );
  }

  const days = Math.min(Math.max(parseInt(params.get('days') ?? '30', 10) || 30, 1), 120);
  // Only the calendar has a future; wellness and activities stop at today.
  const ahead =
    metric === 'events'
      ? Math.min(Math.max(parseInt(params.get('ahead') ?? '0', 10) || 0, 0), 14)
      : 0;
  const r = await icuGet(key, `/athlete/${icuId}/${metric}?${icuWindow(days, ahead)}`);
  if (!r.ok) {
    console.error('[vela] intervals.icu', metric, r.status);
    return NextResponse.json({ error: `intervals.icu ${r.status}` }, { status: 502 });
  }
  const data = r.data;

  if (metric === 'activities' && Array.isArray(data)) {
    return NextResponse.json(data.filter((a) => !icuWithheld(a)));
  }
  // Wellness is normalised to what the companion reads; the calendar passes through.
  if (metric === 'wellness' && Array.isArray(data)) {
    return NextResponse.json(
      data.filter(icuHasReading).map((w: Record<string, unknown>) => ({
        date: w.id ?? w.date,
        hrv: w.hrv,
        restingHR: w.restingHR,
        sleepSecs: w.sleepSecs,
        weight: w.weight,
      })),
    );
  }
  return NextResponse.json(data);
}
