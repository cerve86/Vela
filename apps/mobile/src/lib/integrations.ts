import { Linking } from 'react-native';
import {
  calendarUrls,
  ensureCalendarToken,
  getStravaLink,
  listActivities,
  type Activity,
  type StravaLink,
} from '@vela/api';
import { supabase } from './supabase';
import { useSession } from './session';
import { addDays, today, useAsync } from './data';

/**
 * The portal is where the secrets live — Strava's client secret, the calendar feed —
 * so the app talks to it with the same session it uses for the database. Every call
 * here is "as her", and the portal keeps it that way on its side.
 */
export const PORTAL_URL = (
  process.env.EXPO_PUBLIC_PORTAL_URL ?? 'https://www.vela-coaching.com'
).replace(/\/+$/, '');

async function portal<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: T }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`${PORTAL_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      Accept: 'application/json',
    },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body: body as T };
}

/* ─────────────────────────────────────────────────────────────
 * Strava
 * ───────────────────────────────────────────────────────────── */

export type StravaOutcome = { ok: true } | { ok: false; error: string };

const STRAVA_ERRORS: Record<string, string> = {
  not_configured: 'Strava is not set up on the server yet.',
  access_denied: 'You cancelled on Strava, so nothing was connected.',
  scope: 'Vela needs permission to read your activities. Please tick that box on Strava.',
  bad_state: 'That connection attempt expired. Try again.',
  exchange: 'Strava did not accept the connection. Try again in a moment.',
  store: 'Could not save the connection. Try again.',
  server: 'The server is not configured for Strava.',
};

/**
 * Opens Strava's consent screen in the system browser.
 *
 * The phone comes back by deep link — the portal's callback redirects to `vela://strava`,
 * which the `strava` route turns into a message on the Profile screen. No in-app browser
 * sheet, and so no native module: the build that is already on people's phones can do
 * this, and the flow is the one Strava's own guidelines describe.
 */
export async function connectStrava(): Promise<StravaOutcome> {
  const { ok, body } = await portal<{ url?: string; error?: string }>('/api/strava/connect', {
    method: 'POST',
  });
  if (!ok || !body?.url)
    return { ok: false, error: body?.error ?? 'Could not start the Strava connection.' };
  await Linking.openURL(body.url);
  return { ok: true };
}

/** The word for what came back on the deep link. */
export function stravaReturnMessage(
  param: string | undefined,
): { title: string; body: string } | null {
  if (!param) return null;
  if (param === 'connected') {
    return {
      title: 'Strava connected',
      body: 'Your runs and rides will appear as sessions from now on. The last 60 days have been imported.',
    };
  }
  const code = param.replace(/^error:/, '');
  return { title: 'Strava', body: STRAVA_ERRORS[code] ?? `Strava said: ${code}` };
}

export interface SyncOutcome {
  imported: number;
  matched: number;
  skipped: number;
  error: string | null;
}

export async function syncStrava(): Promise<SyncOutcome> {
  const { ok, body } = await portal<SyncOutcome & { error?: string }>('/api/strava/sync', {
    method: 'POST',
  });
  if (!ok && !body?.imported && body?.error)
    return { imported: 0, matched: 0, skipped: 0, error: body.error };
  return body ?? { imported: 0, matched: 0, skipped: 0, error: 'No answer from the server.' };
}

export async function disconnectStrava(): Promise<StravaOutcome> {
  const { ok, body } = await portal<{ error?: string }>('/api/strava/disconnect', {
    method: 'POST',
  });
  return ok ? { ok: true } : { ok: false, error: body?.error ?? 'Could not disconnect.' };
}

export function useStravaLink() {
  const { client } = useSession();
  return useAsync<StravaLink | null>(
    async () => (client ? getStravaLink(supabase, client.id) : null),
    null,
    [client?.id],
  );
}

/** Her recorded activities over the last `days`, newest first. */
export function useActivities(days = 14) {
  const { client } = useSession();
  const from = addDays(today(), -(days - 1));
  return useAsync<Activity[]>(
    async () => (client ? listActivities(supabase, { clientId: client.id, from, limit: 20 }) : []),
    [],
    [client?.id, from],
  );
}

/* ─────────────────────────────────────────────────────────────
 * Calendar
 * ───────────────────────────────────────────────────────────── */

export function useCalendarLinks() {
  const { client } = useSession();
  return useAsync<{ https: string; webcal: string; google: string } | null>(
    async () => {
      if (!client) return null;
      const { token } = await ensureCalendarToken(supabase);
      return token ? calendarUrls(PORTAL_URL, token) : null;
    },
    null,
    [client?.id],
  );
}

/** Apple Calendar subscribes on the spot from a webcal:// link. */
export function subscribeInAppleCalendar(links: { webcal: string }) {
  return Linking.openURL(links.webcal);
}

/** Google Calendar's add-by-URL page, with the feed already filled in. */
export function subscribeInGoogleCalendar(links: { google: string }) {
  return Linking.openURL(links.google);
}
