import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@vela/api/types';
import { disciplineForSport, matchPlannedSession } from '@vela/shared';

/**
 * Strava, server-side.
 *
 * The client secret never leaves this file's process: the app asks for an authorisation
 * URL, the athlete consents on Strava, and Strava sends the code here to be exchanged.
 * Tokens are stored by the service role in a table nothing signed-in can read.
 *
 * Importing runs as the client, through RLS. That is deliberate: a webhook or a "sync
 * now" tap both end up in `syncStrava` holding a client that IS her, and the only thing
 * the service role did was hand over her tokens.
 */

type Admin = SupabaseClient<Database>;
type AsUser = SupabaseClient<Database>;

export interface StravaConfig {
  clientId: string;
  clientSecret: string;
  verifyToken: string;
  apiBase: string;
}

export function stravaConfig(): StravaConfig | null {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    verifyToken: process.env.STRAVA_WEBHOOK_VERIFY_TOKEN ?? 'vela',
    apiBase: (process.env.STRAVA_API_BASE ?? 'https://www.strava.com').replace(/\/+$/, ''),
  };
}

/* ─────────────────────────────────────────────────────────────
 * The OAuth state: who is connecting, signed so the callback can trust it
 * ───────────────────────────────────────────────────────────── */

const STATE_TTL_MS = 10 * 60 * 1000;

export function signState(
  cfg: StravaConfig,
  clientId: string,
  userId: string,
  now = Date.now(),
): string {
  const body = `${clientId}.${userId}.${now + STATE_TTL_MS}`;
  const sig = createHmac('sha256', cfg.clientSecret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyState(
  cfg: StravaConfig,
  state: string,
  now = Date.now(),
): { clientId: string; userId: string } | null {
  const parts = state.split('.');
  if (parts.length !== 4) return null;
  const [clientId, userId, exp, sig] = parts as [string, string, string, string];
  const expected = createHmac('sha256', cfg.clientSecret)
    .update(`${clientId}.${userId}.${exp}`)
    .digest('base64url');
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected)))
    return null;
  if (Number(exp) < now) return null;
  return { clientId, userId };
}

export function authorizeUrl(cfg: StravaConfig, state: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: 'read,activity:read_all',
    state,
  });
  return `${cfg.apiBase}/oauth/authorize?${params}`;
}

/* ─────────────────────────────────────────────────────────────
 * Strava's API, the three calls this needs
 * ───────────────────────────────────────────────────────────── */

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  athlete?: { id: number; firstname?: string; lastname?: string };
}

async function tokenCall(cfg: StravaConfig, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${cfg.apiBase}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...body }),
  });
  if (!res.ok)
    throw new Error(`Strava token call failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as TokenResponse;
}

export function exchangeCode(cfg: StravaConfig, code: string) {
  return tokenCall(cfg, { code, grant_type: 'authorization_code' });
}

export function refreshTokens(cfg: StravaConfig, refreshToken: string) {
  return tokenCall(cfg, { refresh_token: refreshToken, grant_type: 'refresh_token' });
}

export async function deauthorize(cfg: StravaConfig, accessToken: string): Promise<void> {
  await fetch(`${cfg.apiBase}/oauth/deauthorize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => undefined);
}

/** A summary activity as Strava lists it — only the fields that are read. */
export interface StravaActivity {
  id: number;
  name: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  timezone?: string;
  elapsed_time: number;
  moving_time: number;
  distance?: number;
  total_elevation_gain?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number;
  average_speed?: number;
  calories?: number;
  suffer_score?: number;
  map?: { summary_polyline?: string };
}

export async function fetchActivities(
  cfg: StravaConfig,
  accessToken: string,
  afterEpoch: number,
): Promise<StravaActivity[]> {
  const all: StravaActivity[] = [];
  for (let page = 1; page <= 10; page++) {
    const params = new URLSearchParams({
      after: String(afterEpoch),
      per_page: '100',
      page: String(page),
    });
    const res = await fetch(`${cfg.apiBase}/api/v3/athlete/activities?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Strava activities call failed: ${res.status}`);
    const batch = (await res.json()) as StravaActivity[];
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

/* ─────────────────────────────────────────────────────────────
 * Importing — as the client, through RLS
 * ───────────────────────────────────────────────────────────── */

/** The token row, refreshed if it is about to expire. */
async function usableAccessToken(
  cfg: StravaConfig,
  admin: Admin,
  clientId: string,
): Promise<string | null> {
  const { data: row } = await admin
    .from('strava_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('client_id', clientId)
    .maybeSingle();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() - 60_000 > Date.now()) return row.access_token;

  const fresh = await refreshTokens(cfg, row.refresh_token);
  await admin
    .from('strava_tokens')
    .update({
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token,
      expires_at: new Date(fresh.expires_at * 1000).toISOString(),
    })
    .eq('client_id', clientId);
  return fresh.access_token;
}

export interface SyncResult {
  imported: number;
  matched: number;
  skipped: number;
  error: string | null;
}

/**
 * Pulls what is new since the last sync and files it.
 *
 * Every activity becomes one row in `activities` and one session: the planned session it
 * fulfils if there is one on the same local day with the same discipline, otherwise a new
 * completed session of its own. Re-running is safe — the activity's Strava id is unique
 * per source — and the first sync reaches back 60 days so the record starts with context.
 */
export async function syncStrava(
  cfg: StravaConfig,
  admin: Admin,
  asUser: AsUser,
  clientId: string,
): Promise<SyncResult> {
  const result: SyncResult = { imported: 0, matched: 0, skipped: 0, error: null };

  const { data: link } = await admin
    .from('strava_links')
    .select('last_synced_at')
    .eq('client_id', clientId)
    .maybeSingle();
  const accessToken = await usableAccessToken(cfg, admin, clientId).catch((e: Error) => {
    result.error = e.message;
    return null;
  });
  if (!accessToken) {
    result.error ??= 'Strava is not connected.';
    await admin.from('strava_links').update({ last_error: result.error }).eq('client_id', clientId);
    return result;
  }

  // Overlap the window by a week: an activity uploaded late, or edited, is still caught.
  const since = link?.last_synced_at
    ? new Date(link.last_synced_at).getTime() - 7 * 86_400_000
    : Date.now() - 60 * 86_400_000;

  let activities: StravaActivity[];
  try {
    activities = await fetchActivities(cfg, accessToken, Math.floor(since / 1000));
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    await admin.from('strava_links').update({ last_error: result.error }).eq('client_id', clientId);
    return result;
  }

  if (activities.length > 0) {
    const ids = activities.map((a) => String(a.id));
    const { data: existing } = await asUser
      .from('activities')
      .select('external_id')
      .eq('source', 'strava')
      .in('external_id', ids);
    const seen = new Set((existing ?? []).map((r) => r.external_id));

    const dates = activities.map((a) => a.start_date_local.slice(0, 10)).sort();
    const { data: planned } = await asUser
      .from('sessions')
      .select('id, scheduled_date, discipline, status')
      .eq('client_id', clientId)
      .gte('scheduled_date', dates[0]!)
      .lte('scheduled_date', dates[dates.length - 1]!)
      .order('scheduled_date', { ascending: true });
    const open = (planned ?? []).map((s) => ({
      id: s.id,
      scheduledDate: s.scheduled_date,
      discipline: s.discipline,
      status: s.status,
    }));

    for (const a of activities.sort((x, y) => x.start_date.localeCompare(y.start_date))) {
      if (seen.has(String(a.id))) {
        result.skipped++;
        continue;
      }
      const localDate = a.start_date_local.slice(0, 10);
      const completedAt = new Date(
        new Date(a.start_date).getTime() + a.elapsed_time * 1000,
      ).toISOString();
      let sessionId = matchPlannedSession({ sportType: a.sport_type, localDate }, open);

      if (sessionId) {
        const { error } = await asUser
          .from('sessions')
          .update({
            status: 'completed',
            completed_at: completedAt,
            duration_sec: a.moving_time,
            logged_via: 'strava',
          })
          .eq('id', sessionId);
        if (error) sessionId = null;
        else {
          result.matched++;
          const s = open.find((o) => o.id === sessionId);
          if (s) s.status = 'completed';
        }
      }
      if (!sessionId) {
        const { data: created, error } = await asUser
          .from('sessions')
          .insert({
            client_id: clientId,
            title: a.name,
            discipline: disciplineForSport(a.sport_type),
            scheduled_date: localDate,
            status: 'completed',
            started_at: a.start_date,
            completed_at: completedAt,
            duration_sec: a.moving_time,
            logged_via: 'strava',
          })
          .select('id')
          .single();
        if (error || !created) {
          result.error = error?.message ?? 'Could not create the session.';
          continue;
        }
        sessionId = created.id;
      }

      const { error: actError } = await asUser.from('activities').insert({
        client_id: clientId,
        session_id: sessionId,
        source: 'strava',
        external_id: String(a.id),
        sport_type: a.sport_type,
        name: a.name,
        started_at: a.start_date,
        local_date: localDate,
        elapsed_sec: a.elapsed_time,
        moving_sec: a.moving_time,
        distance_m: a.distance ?? null,
        elevation_gain_m: a.total_elevation_gain ?? null,
        avg_hr: a.average_heartrate ?? null,
        max_hr: a.max_heartrate ?? null,
        avg_cadence: a.average_cadence ?? null,
        avg_watts: a.average_watts ?? null,
        max_watts: a.max_watts ?? null,
        weighted_watts: a.weighted_average_watts ?? null,
        avg_speed_mps: a.average_speed ?? null,
        calories: a.calories ?? null,
        suffer_score: a.suffer_score ?? null,
        polyline: a.map?.summary_polyline ?? null,
        raw: a as unknown as Database['public']['Tables']['activities']['Insert']['raw'],
      });
      if (actError) {
        result.error = actError.message;
        continue;
      }
      result.imported++;
    }
  }

  await admin
    .from('strava_links')
    .update({ last_synced_at: new Date().toISOString(), last_error: result.error })
    .eq('client_id', clientId);
  return result;
}
