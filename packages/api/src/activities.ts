import type { VelaClient } from './client';

/** A workout recorded by another service and imported as a session. */
export interface Activity {
  id: string;
  clientId: string;
  sessionId: string | null;
  source: 'strava';
  externalId: string;
  sportType: string;
  name: string;
  startedAt: string;
  localDate: string;
  elapsedSec: number;
  movingSec: number;
  distanceM: number | null;
  elevationGainM: number | null;
  avgHr: number | null;
  maxHr: number | null;
  avgCadence: number | null;
  avgWatts: number | null;
  maxWatts: number | null;
  weightedWatts: number | null;
  avgSpeedMps: number | null;
  calories: number | null;
  sufferScore: number | null;
  polyline: string | null;
}

const COLUMNS =
  'id, client_id, session_id, source, external_id, sport_type, name, started_at, local_date, elapsed_sec, moving_sec, distance_m, elevation_gain_m, avg_hr, max_hr, avg_cadence, avg_watts, max_watts, weighted_watts, avg_speed_mps, calories, suffer_score, polyline';

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function toActivity(r: Record<string, unknown>): Activity {
  return {
    id: r.id as string,
    clientId: r.client_id as string,
    sessionId: (r.session_id as string | null) ?? null,
    source: r.source as 'strava',
    externalId: r.external_id as string,
    sportType: r.sport_type as string,
    name: r.name as string,
    startedAt: r.started_at as string,
    localDate: r.local_date as string,
    elapsedSec: Number(r.elapsed_sec),
    movingSec: Number(r.moving_sec),
    distanceM: num(r.distance_m),
    elevationGainM: num(r.elevation_gain_m),
    avgHr: num(r.avg_hr),
    maxHr: num(r.max_hr),
    avgCadence: num(r.avg_cadence),
    avgWatts: num(r.avg_watts),
    maxWatts: num(r.max_watts),
    weightedWatts: num(r.weighted_watts),
    avgSpeedMps: num(r.avg_speed_mps),
    calories: num(r.calories),
    sufferScore: num(r.suffer_score),
    polyline: (r.polyline as string | null) ?? null,
  };
}

/** Newest first. RLS narrows to the caller's own, or her coach's clients. */
export async function listActivities(
  supabase: VelaClient,
  opts: { clientId?: string; from?: string; limit?: number } = {},
): Promise<Activity[]> {
  let q = supabase.from('activities').select(COLUMNS).order('started_at', { ascending: false });
  if (opts.clientId) q = q.eq('client_id', opts.clientId);
  if (opts.from) q = q.gte('local_date', opts.from);
  if (opts.limit) q = q.limit(opts.limit);
  const { data } = await q;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toActivity);
}

/** Whether — and as whom — a client's Strava is connected. Tokens are never in this row. */
export interface StravaLink {
  clientId: string;
  athleteId: number;
  athleteName: string | null;
  connectedAt: string;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export async function getStravaLink(
  supabase: VelaClient,
  clientId: string,
): Promise<StravaLink | null> {
  const { data } = await supabase
    .from('strava_links')
    .select('client_id, athlete_id, athlete_name, connected_at, last_synced_at, last_error')
    .eq('client_id', clientId)
    .maybeSingle();
  if (!data) return null;
  return {
    clientId: data.client_id,
    athleteId: Number(data.athlete_id),
    athleteName: data.athlete_name,
    connectedAt: data.connected_at,
    lastSyncedAt: data.last_synced_at,
    lastError: data.last_error,
  };
}

/**
 * The client's calendar feed token, minted on first call.
 *
 * The URLs are derived here so the app and the portal spell them identically: a
 * subscription URL for any calendar, its webcal:// twin for Apple's one-tap subscribe,
 * and Google Calendar's add-by-URL page.
 */
export async function ensureCalendarToken(
  supabase: VelaClient,
  opts: { rotate?: boolean } = {},
): Promise<{ token: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('ensure_calendar_token', {
    p_rotate: opts.rotate ?? false,
  });
  if (error) return { token: null, error: error.message };
  return { token: (data as string) ?? null, error: null };
}

export function calendarUrls(
  portalUrl: string,
  token: string,
): { https: string; webcal: string; google: string } {
  const https = `${portalUrl.replace(/\/+$/, '')}/api/calendar/${token}/vela.ics`;
  const webcal = https.replace(/^https?:\/\//, 'webcal://');
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
  };
}
