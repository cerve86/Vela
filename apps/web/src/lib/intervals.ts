import 'server-only';

import {
  icuHasReading,
  readIcuConnection,
  type IcuActivityLike,
  type IcuConnection,
  type IcuWellnessLike,
} from '@vela/shared';

/**
 * intervals.icu, server-side.
 *
 * Vela reads intervals.icu with the COACH's API key (INTERVALS_API_KEY, from Settings →
 * Developer Settings on intervals.icu), which reads every athlete who has accepted her as
 * coach. The key never reaches a browser: the athlete's companion asks through
 * /api/companion/intervals, the coach's portal through a server action, and both land here.
 */
// INTERVALS_API_BASE points Vela at a local stand-in for testing; unset, it is intervals.icu.
export const ICU = process.env.INTERVALS_API_BASE?.trim() || 'https://intervals.icu/api/v1';

// intervals.icu sits behind Cloudflare, which blocks non-browser user agents.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** intervals.icu's own id shapes: "i12345", or digits for older accounts. It goes into a path. */
export const ICU_ID = /^i?\d{1,12}$/;

/** How far back the connection check reads: two weeks of mornings, four weeks of training. */
export const CHECK_WELLNESS_DAYS = 14;
export const CHECK_ACTIVITY_DAYS = 28;

export function icuKey(): string | null {
  return process.env.INTERVALS_API_KEY?.trim() || null;
}

export type IcuResult<T> = { ok: true; data: T } | { ok: false; status: number };

export async function icuGet<T = unknown>(key: string, path: string): Promise<IcuResult<T>> {
  try {
    const r = await fetch(`${ICU}${path}`, {
      headers: {
        Authorization: 'Basic ' + Buffer.from('API_KEY:' + key).toString('base64'),
        'User-Agent': UA,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, status: r.status };
    return { ok: true, data: (await r.json()) as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * A write: POST, PUT or DELETE with a JSON body. The answer is parsed when there is one;
 * a write that answers with nothing is still ok.
 */
export async function icuSend<T = unknown>(
  key: string,
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<IcuResult<T | null>> {
  try {
    const r = await fetch(`${ICU}${path}`, {
      method,
      headers: {
        Authorization: 'Basic ' + Buffer.from('API_KEY:' + key).toString('base64'),
        'User-Agent': UA,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return { ok: false, status: r.status };
    const text = await r.text();
    return { ok: true, data: text ? (JSON.parse(text) as T) : null };
  } catch {
    return { ok: false, status: 0 };
  }
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * oldest/newest query params for the last `days` days (plus `ahead` days to come).
 *
 * intervals.icu files each day under the athlete's own date, and this server runs in UTC:
 * at 6:30am in Singapore it is still yesterday here, and newest=<UTC today> would leave
 * out the reading she took this morning. So the window is padded by a day at both ends;
 * readers key everything on her local date, so the extra day costs nothing.
 */
export function icuWindow(days: number, ahead = 0): string {
  const now = Date.now();
  return `oldest=${ymd(now - (days + 1) * 864e5)}&newest=${ymd(now + (1 + ahead) * 864e5)}`;
}

export type IcuCheck =
  | { state: 'connected'; name: string | null; conn: IcuConnection }
  /** intervals.icu refused: she hasn't accepted the coaching request, or the id is someone else's. */
  | { state: 'denied' }
  /** intervals.icu did not accept the coach's key itself. */
  | { state: 'bad-key' }
  | { state: 'error' };

/**
 * Whether intervals.icu is feeding Vela for one athlete: her name there, two weeks of
 * readings and four weeks of activities, read through `readIcuConnection`.
 */
export async function icuCheck(key: string, icuId: string): Promise<IcuCheck> {
  const [athlete, wellness, activities] = await Promise.all([
    icuGet<{ name?: string | null }>(key, `/athlete/${icuId}`),
    icuGet<IcuWellnessLike[]>(key, `/athlete/${icuId}/wellness?${icuWindow(CHECK_WELLNESS_DAYS)}`),
    icuGet<IcuActivityLike[]>(
      key,
      `/athlete/${icuId}/activities?${icuWindow(CHECK_ACTIVITY_DAYS)}`,
    ),
  ]);
  if (!athlete.ok) {
    if (athlete.status === 401) return { state: 'bad-key' };
    return athlete.status === 403 || athlete.status === 404
      ? { state: 'denied' }
      : { state: 'error' };
  }
  if (!wellness.ok || !activities.ok) return { state: 'error' };
  return {
    state: 'connected',
    name: athlete.data.name?.trim() || null,
    conn: readIcuConnection({
      wellness: Array.isArray(wellness.data) ? wellness.data.filter(icuHasReading) : [],
      activities: Array.isArray(activities.data) ? activities.data : [],
      days: CHECK_WELLNESS_DAYS,
    }),
  };
}

export interface IcuAthlete {
  id: string;
  name: string;
  email: string | null;
}

/**
 * The athletes the key's owner coaches or follows on intervals.icu, without the owner
 * herself (the list includes the caller; /athlete/0 is the caller). 'bad-key' when
 * intervals.icu refuses the key; 'error' when it can't be reached.
 */
export async function icuAthletes(
  key: string,
): Promise<{ ok: true; athletes: IcuAthlete[] } | { ok: false; state: 'bad-key' | 'error' }> {
  type Row = { id?: string | number; name?: string | null; email?: string | null };
  const [list, me] = await Promise.all([
    icuGet<Row[]>(key, '/athletes'),
    icuGet<Row>(key, '/athlete/0'),
  ]);
  if (!list.ok) return { ok: false, state: list.status === 401 ? 'bad-key' : 'error' };
  const self = me.ok && me.data.id != null ? String(me.data.id) : null;
  const athletes = (Array.isArray(list.data) ? list.data : [])
    .filter((a) => a.id != null && ICU_ID.test(String(a.id)) && String(a.id) !== self)
    .map((a) => ({
      id: String(a.id),
      name: a.name?.trim() || String(a.id),
      email: a.email?.trim() || null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, athletes };
}
