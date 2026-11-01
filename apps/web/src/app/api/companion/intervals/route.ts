import { NextResponse } from 'next/server';
import { clientIdFor, notAClient, requireUser } from '@/lib/apiRoute';

/**
 * GET /api/companion/intervals?metric=wellness|activities|events&days=N
 *
 * The companion's window onto intervals.icu, for the signed-in athlete only. intervals.icu
 * takes HTTP Basic auth with the COACH's API key, which must never reach a browser — so
 * the athlete's page calls here with her own Supabase token, and this route reads her
 * intervals.icu id (from companion_profiles, under her own RLS) and fetches with the key.
 *
 * Answers 404 while intervals.icu is not connected for her — no key on the deployment, or
 * no id on file — and the companion then reads the same things from Vela instead (Strava
 * runs, Apple Health HRV, her programme). So this route can ship before the coach has a key.
 *
 * Env: INTERVALS_API_KEY (Settings → Developer Settings on intervals.icu). A coach key
 * reads an athlete once she has accepted the coaching request.
 */
const ICU = 'https://intervals.icu/api/v1';

// intervals.icu sits behind Cloudflare, which blocks non-browser user agents.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const METRICS = new Set(['wellness', 'activities', 'events']);

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function GET(req: Request) {
  const { supabase, userId, refused } = await requireUser(req);
  if (refused) return refused;

  const clientId = await clientIdFor(supabase, userId);
  if (!clientId) return notAClient('read their intervals.icu data');

  const key = process.env.INTERVALS_API_KEY;
  if (!key) return NextResponse.json({ error: 'intervals.icu is not connected' }, { status: 404 });

  const { data: profile } = await supabase
    .from('companion_profiles')
    .select('intervals_icu_id')
    .eq('client_id', clientId)
    .maybeSingle();
  const icuId = profile?.intervals_icu_id?.trim();
  // The id goes into a path: accept intervals.icu's own shapes only ("i12345" or digits).
  if (!icuId || !/^i?\d+$/.test(icuId)) {
    return NextResponse.json({ error: 'no intervals.icu id on file' }, { status: 404 });
  }

  const params = new URL(req.url).searchParams;
  const metricParam = params.get('metric') ?? 'wellness';
  const metric = METRICS.has(metricParam) ? metricParam : 'wellness';
  const days = Math.min(Math.max(parseInt(params.get('days') ?? '30', 10) || 30, 1), 120);
  const now = Date.now();

  const r = await fetch(
    `${ICU}/athlete/${icuId}/${metric}?oldest=${ymd(now - days * 864e5)}&newest=${ymd(now)}`,
    {
      headers: {
        Authorization: 'Basic ' + Buffer.from('API_KEY:' + key).toString('base64'),
        'User-Agent': UA,
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  );
  if (!r.ok) {
    console.error('[vela] intervals.icu', metric, r.status);
    return NextResponse.json({ error: `intervals.icu ${r.status}` }, { status: 502 });
  }
  const data: unknown = await r.json();

  // Wellness is normalised to what the companion reads; the rest passes through.
  if (metric === 'wellness' && Array.isArray(data)) {
    return NextResponse.json(
      data.map((w: Record<string, unknown>) => ({
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
