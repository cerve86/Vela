import 'server-only';

import { after } from 'next/server';
import type { VelaClient } from '@vela/api';
import {
  planIntervalsSync,
  pushWindow,
  type PushItem,
  type PushSession,
  type PushSessionStatus,
  type TrackedEvent,
} from '@vela/shared';
import { icuKey, icuSend } from '@/lib/intervals';

/**
 * Her planned sessions → her intervals.icu calendar.
 *
 * One sync brings the next nine weeks of her intervals.icu calendar in line with Vela:
 * new sessions created, changed ones updated in place, gone ones deleted. What to do is
 * decided by `planIntervalsSync` (packages/shared); this file reads Vela, talks to
 * intervals.icu with the coach's key and keeps `intervals_events` honest.
 *
 * Everything runs as the coach (her Supabase session, so RLS decides which athletes she
 * can sync) and only one sync per athlete runs at a time: `intervals_sync_claim` takes a
 * lock, and a sync asked for while one is running makes the running one go round again.
 */

export type PushOutcome =
  | {
      state: 'sent';
      onCalendar: number;
      withSteps: number;
      created: number;
      updated: number;
      removed: number;
    }
  | { state: 'stopped'; removed: number }
  /** Another sync for her is running, and will include whatever just changed. */
  | { state: 'busy' }
  | { state: 'no-key' | 'unlinked' | 'bad-key' | 'denied' | 'error'; message: string };

const MESSAGES = {
  'no-key': 'intervals.icu isn’t switched on for Vela.',
  unlinked: 'She isn’t linked to an intervals.icu athlete.',
  'bad-key': 'intervals.icu didn’t accept Vela’s API key.',
  denied:
    'intervals.icu didn’t let Vela change her calendar. Check she has accepted you as her coach there.',
  error: 'Couldn’t reach intervals.icu. Vela tries again on the next change.',
} as const;

type Failure = keyof typeof MESSAGES;

class SyncFailure extends Error {
  constructor(readonly state: Exclude<Failure, 'no-key' | 'unlinked'>) {
    super(MESSAGES[state]);
  }
}

/** intervals.icu's refusal, in the three ways that need different words. */
function failure(status: number): SyncFailure {
  if (status === 401) return new SyncFailure('bad-key');
  if (status === 403 || status === 404) return new SyncFailure('denied');
  return new SyncFailure('error');
}

function companionUrl(): string {
  return `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.vela-coaching.com'}/companion`;
}

/** Runs `fn` over `items`, `limit` at a time. */
async function inBatches<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += limit)
    await Promise.all(items.slice(i, i + limit).map(fn));
}

/**
 * Brings her intervals.icu calendar in line with Vela, now. With sending off (or her
 * unlinked) it takes off every upcoming event Vela made, which is how "stop" works.
 */
export async function syncIntervals(supabase: VelaClient, clientId: string): Promise<PushOutcome> {
  const key = icuKey();
  if (!key) return { state: 'no-key', message: MESSAGES['no-key'] };

  const { data: claimed, error: claimError } = await supabase.rpc('intervals_sync_claim', {
    p_client_id: clientId,
  });
  if (claimError) {
    console.error('[vela] intervals sync claim failed:', claimError.message);
    return { state: 'error', message: MESSAGES.error };
  }
  if (!claimed) return { state: 'busy' };

  // Round again while changes arrive during the sync; the lock lapses on its own after
  // two minutes should anything here never come back.
  for (let round = 0; ; round++) {
    let outcome: PushOutcome;
    try {
      outcome = await syncOnce(supabase, key, clientId);
    } catch (e) {
      outcome =
        e instanceof SyncFailure
          ? { state: e.state, message: e.message }
          : { state: 'error', message: MESSAGES.error };
      if (!(e instanceof SyncFailure)) console.error('[vela] intervals sync failed:', e);
    }
    const ok = outcome.state === 'sent' || outcome.state === 'stopped';
    const { data: released } = await supabase.rpc('intervals_sync_release', {
      p_client_id: clientId,
      p_ok: ok,
      p_error: ok || !('message' in outcome) ? undefined : outcome.message,
    });
    if (released !== false || round >= 4) return outcome;
  }
}

async function syncOnce(supabase: VelaClient, key: string, clientId: string): Promise<PushOutcome> {
  const now = Date.now();
  const window = pushWindow(now);

  // Every read is checked: a sync that misread "no sessions" would empty her calendar.
  const [profileRes, sessionsRes, rowsRes] = await Promise.all([
    supabase
      .from('companion_profiles')
      .select('intervals_icu_id, intervals_push')
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase
      .from('sessions')
      .select(
        'id, title, discipline, scheduled_date, status, program_day_id, program_days(notes, watch_steps)',
      )
      .eq('client_id', clientId)
      .gte('scheduled_date', window.from)
      .lte('scheduled_date', window.to),
    supabase
      .from('intervals_events')
      .select('session_id, icu_athlete_id, icu_event_id, event_date, signature, synced_at')
      .eq('client_id', clientId),
  ]);
  const failedRead = profileRes.error ?? sessionsRes.error ?? rowsRes.error;
  if (failedRead) throw new Error(failedRead.message);
  const profile = profileRes.data;
  const icuId = profile?.intervals_icu_id?.trim() || null;
  const sending = profile?.intervals_push === true;
  const sessions = sessionsRes.data ?? [];
  const rows = rowsRes.data ?? [];

  // Prescriptions only for what will be sent (same ownership rule as the calendar feed).
  const live =
    sending && icuId ? sessions.filter((s) => s.status === 'scheduled' && s.program_day_id) : [];
  const items = new Map<string, PushItem[]>();
  if (live.length) {
    const { data, error } = await supabase.rpc('get_session_plans', {
      p_session_ids: live.map((s) => s.id),
    });
    if (error) throw new Error(error.message);
    for (const raw of (data as unknown[] | null) ?? []) {
      const r = raw as Record<string, unknown>;
      const id = r.session_id as string;
      items.set(id, [
        ...(items.get(id) ?? []),
        {
          block: r.block as string,
          exerciseName: r.exercise_name as string,
          sets: r.sets as number,
          reps: r.reps as string,
          targetLoadKg: r.target_load_kg === null ? null : Number(r.target_load_kg),
          targetRpe: r.target_rpe === null ? null : Number(r.target_rpe),
          tempo: (r.tempo as string | null) ?? null,
          restSec: r.rest_sec as number,
          notes: (r.notes as string | null) ?? null,
        },
      ]);
    }
  }

  const pushSessions: PushSession[] = sessions.map((s) => {
    const day = s.program_days as { notes: string | null; watch_steps: string | null } | null;
    return {
      id: s.id,
      title: s.title,
      discipline: s.discipline,
      scheduledDate: s.scheduled_date,
      status: s.status as PushSessionStatus,
      dayNotes: day?.notes ?? null,
      watchSteps: day?.watch_steps ?? null,
      items: items.get(s.id) ?? [],
    };
  });
  const tracked: TrackedEvent[] = rows.map((r) => ({
    sessionId: r.session_id,
    icuAthleteId: r.icu_athlete_id,
    icuEventId: r.icu_event_id,
    eventDate: r.event_date,
    signature: r.signature,
    syncedAt: r.synced_at,
  }));

  const plan = planIntervalsSync({
    sending,
    icuId,
    sessions: pushSessions,
    tracked,
    windowStart: window.from,
    now,
    companionUrl: companionUrl(),
  });

  // 1. Off her calendar: what went, and everything when sending stopped. intervals.icu
  //    ignores ids it no longer has. An athlete who has since dropped the coach refuses;
  //    there is nothing left to tidy there, so the rows go anyway.
  const byAthlete = new Map<string, number[]>();
  for (const r of plan.remove)
    if (r.icuEventId !== null)
      byAthlete.set(r.icuAthleteId, [...(byAthlete.get(r.icuAthleteId) ?? []), r.icuEventId]);
  for (const [athlete, ids] of byAthlete) {
    const res = await icuSend(
      key,
      'PUT',
      `/athlete/${athlete}/events/bulk-delete`,
      ids.map((id) => ({ id })),
    );
    if (!res.ok && res.status !== 403 && res.status !== 404) throw failure(res.status);
  }
  const drop = [...plan.remove.map((r) => r.sessionId), ...plan.forget];
  if (drop.length) {
    const { error } = await supabase
      .from('intervals_events')
      .delete()
      .eq('client_id', clientId)
      .in('session_id', drop);
    if (error) throw new Error(error.message);
  }

  if (!sending || !icuId) return { state: 'stopped', removed: plan.remove.length };

  // 2. Onto her calendar: claim each row first, so a sync that somehow overlaps this one
  //    cannot create the same session twice, then create them in one call.
  const stamp = new Date().toISOString();
  const fresh = plan.create.filter((c) => !c.retry);
  const retry = plan.create.filter((c) => c.retry);
  const claimedIds = new Set<string>();
  if (fresh.length) {
    const { data, error } = await supabase
      .from('intervals_events')
      .upsert(
        fresh.map((c) => ({
          client_id: clientId,
          session_id: c.sessionId,
          icu_athlete_id: icuId,
          icu_event_id: null,
          event_date: c.date,
          signature: c.signature,
          synced_at: stamp,
        })),
        { onConflict: 'client_id,session_id', ignoreDuplicates: true },
      )
      .select('session_id');
    if (error) throw new Error(error.message);
    for (const r of data ?? []) claimedIds.add(r.session_id);
  }
  if (retry.length) {
    const { data, error } = await supabase
      .from('intervals_events')
      .update({ synced_at: stamp, icu_athlete_id: icuId })
      .eq('client_id', clientId)
      .is('icu_event_id', null)
      .in(
        'session_id',
        retry.map((c) => c.sessionId),
      )
      .select('session_id');
    if (error) throw new Error(error.message);
    for (const r of data ?? []) claimedIds.add(r.session_id);
  }
  const toCreate = plan.create.filter((c) => claimedIds.has(c.sessionId));

  let created = 0;
  for (let i = 0; i < toCreate.length; i += 50) {
    const chunk = toCreate.slice(i, i + 50);
    const res = await icuSend<{ id?: number; external_id?: string | null }[]>(
      key,
      'POST',
      `/athlete/${icuId}/events/bulk`,
      chunk.map((c) => c.event),
    );
    if (!res.ok) {
      // Let the claims go, so the next sync creates them rather than waiting them out.
      await supabase
        .from('intervals_events')
        .delete()
        .eq('client_id', clientId)
        .is('icu_event_id', null)
        .in(
          'session_id',
          toCreate.slice(i).map((c) => c.sessionId),
        );
      throw failure(res.status);
    }
    // Matched by our label; failing that by position, which intervals.icu keeps.
    const back = res.data ?? [];
    const made = new Map(
      back
        .filter((e) => e.id != null && e.external_id)
        .map((e) => [e.external_id as string, e.id as number]),
    );
    await inBatches(chunk, 8, async (c) => {
      const at = chunk.indexOf(c);
      const id =
        made.get(c.event.external_id) ??
        (back.length === chunk.length && back[at]?.id != null ? back[at].id : undefined);
      if (id === undefined) return;
      created++;
      await supabase
        .from('intervals_events')
        .update({ icu_event_id: id, signature: c.signature, event_date: c.date, synced_at: stamp })
        .eq('client_id', clientId)
        .eq('session_id', c.sessionId);
    });
  }

  // 3. Changed in place. An event someone deleted on intervals.icu is made again.
  let updated = 0;
  const refusals: SyncFailure[] = [];
  await inBatches(plan.update, 4, async (u) => {
    let res = await icuSend<{ id?: number }>(
      key,
      'PUT',
      `/athlete/${icuId}/events/${u.icuEventId}`,
      u.event,
    );
    let eventId = u.icuEventId;
    if (!res.ok && res.status === 404) {
      res = await icuSend<{ id?: number }>(key, 'POST', `/athlete/${icuId}/events`, u.event);
      if (res.ok && res.data?.id != null) eventId = res.data.id;
    }
    if (!res.ok) {
      refusals.push(failure(res.status));
      return;
    }
    updated++;
    await supabase
      .from('intervals_events')
      .update({
        icu_event_id: eventId,
        signature: u.signature,
        event_date: u.date,
        synced_at: stamp,
      })
      .eq('client_id', clientId)
      .eq('session_id', u.sessionId);
  });
  if (refusals.length) throw refusals[0];

  const { count } = await supabase
    .from('intervals_events')
    .select('session_id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .not('icu_event_id', 'is', null)
    .gte('event_date', window.from);

  return {
    state: 'sent',
    onCalendar: count ?? 0,
    withSteps: pushSessions.filter((s) => s.status === 'scheduled' && s.watchSteps?.trim()).length,
    created,
    updated,
    removed: plan.remove.length,
  };
}

/**
 * After the response: syncs her (or, with no client, every athlete this coach sends
 * sessions for) once the change that called this is saved. Every write that moves a
 * session — assigning, moving, editing a programme — ends with this, so her watch follows
 * Vela without anyone pressing anything.
 */
export function syncIntervalsLater(supabase: VelaClient, clientId?: string): void {
  if (!icuKey()) return;
  after(async () => {
    try {
      let q = supabase
        .from('companion_profiles')
        .select('client_id')
        .eq('intervals_push', true)
        .not('intervals_icu_id', 'is', null);
      if (clientId) q = q.eq('client_id', clientId);
      const { data } = await q;
      for (const { client_id } of data ?? []) await syncIntervals(supabase, client_id);
    } catch (e) {
      console.error('[vela] intervals sync after a change failed:', e);
    }
  });
}

/** Where sending stands for her, for the Companion card and the assistant. */
export interface PushStatus {
  sending: boolean;
  onCalendar: number;
  syncedAt: string | null;
  error: string | null;
}

export async function intervalsPushStatus(
  supabase: VelaClient,
  clientId: string,
): Promise<PushStatus> {
  const { from } = pushWindow(Date.now());
  const [{ data: profile }, { count }] = await Promise.all([
    supabase
      .from('companion_profiles')
      .select('intervals_push, intervals_synced_at, intervals_sync_error')
      .eq('client_id', clientId)
      .maybeSingle(),
    supabase
      .from('intervals_events')
      .select('session_id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .not('icu_event_id', 'is', null)
      .gte('event_date', from),
  ]);
  return {
    sending: profile?.intervals_push === true,
    onCalendar: count ?? 0,
    syncedAt: profile?.intervals_synced_at ?? null,
    error: profile?.intervals_sync_error ?? null,
  };
}

/**
 * Turns sending on or off for her and syncs straight away: on puts the next nine weeks on
 * her intervals.icu calendar, off takes them off again. Refused for an athlete who isn't
 * linked, since there is no calendar to write to.
 */
export async function setIntervalsPush(
  supabase: VelaClient,
  clientId: string,
  send: boolean,
): Promise<PushOutcome> {
  if (!icuKey()) return { state: 'no-key', message: MESSAGES['no-key'] };
  const { data: profile } = await supabase
    .from('companion_profiles')
    .select('intervals_icu_id')
    .eq('client_id', clientId)
    .maybeSingle();
  if (send && !profile?.intervals_icu_id?.trim())
    return { state: 'unlinked', message: MESSAGES.unlinked };
  if (!profile) return { state: 'stopped', removed: 0 };
  const { error } = await supabase
    .from('companion_profiles')
    .update({ intervals_push: send, updated_at: new Date().toISOString() })
    .eq('client_id', clientId);
  if (error) return { state: 'error', message: error.message };
  return syncIntervals(supabase, clientId);
}
