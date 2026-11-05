'use server';

import { revalidatePath } from 'next/cache';
import {
  friendlyError,
  listClientPlans,
  listFlags,
  logAudit,
  mondayOf,
  resolveFlag,
  saveClearedGates,
  saveFuelSettings,
  saveClientGates,
  sendMessage,
  setGateOverride,
  setPowerLevel,
  upsertClientPlan,
  type ClientGates,
  type ExerciseGate,
  type FuelSettings,
} from '@vela/api';
import { parseIcuId, type IcuConnection } from '@vela/shared';
import { icuAthletes, icuCheck, icuKey, type IcuAthlete } from '@/lib/intervals';
import { createServerSupabase } from '@/lib/supabase/server';

export interface Result {
  ok: boolean;
  error?: string;
}

export async function loadWeeklyPlans(clientId: string) {
  const supabase = await createServerSupabase();
  return listClientPlans(supabase, clientId);
}

/**
 * Save the week's plan and tell her.
 *
 * The plan is read live on the phone, so saving is the delivery; the message is what
 * makes her look — a line from her physio in the thread she already watches, with the
 * unread badge that comes with it.
 */
export async function saveWeeklyPlanAction(
  clientId: string,
  weekStart: string,
  body: string,
): Promise<Result> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const before = await listClientPlans(supabase, clientId, 60);
  const week = mondayOf(weekStart);
  const existed = before.some((p) => p.weekStart === week);

  const { error } = await upsertClientPlan(supabase, {
    coachId: user.id,
    clientId,
    weekStart: week,
    body,
    via: 'portal',
  });
  if (error) return { ok: false, error: friendlyError(error) };

  await sendMessage(supabase, {
    clientId,
    sender: 'coach',
    via: 'portal',
    body: existed
      ? `I've updated your plan for the week of ${pretty(week)} — it's on Today.`
      : `Your plan for the week of ${pretty(week)} is ready — it's on Today.`,
  });

  await logAudit(supabase, {
    actorId: user.id,
    action: 'plan.sent',
    entity: 'client',
    entityId: clientId,
    via: 'portal',
  });
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/**
 * Answer a flag. For a hold the answer is what her session becomes today, which she then
 * sees on her phone; for the others it records that the coach has seen it.
 */
export async function resolveFlagAction(
  flagId: string,
  input: {
    resolution: string;
    adjustTo?: 'gentle' | 'low_impact' | 'strength' | 'as_planned';
    note?: string | null;
  },
): Promise<Result> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const [flag] = (await listFlags(supabase, { open: true, limit: 200 })).filter(
    (f) => f.id === flagId,
  );
  if (!flag) return { ok: false, error: 'That flag is already resolved.' };
  const { error } = await resolveFlag(supabase, flag, input);
  if (error) return { ok: false, error: friendlyError(error) };
  await logAudit(supabase, {
    actorId: user.id,
    action: `flag.${input.adjustTo ?? input.resolution}`,
    entity: 'client',
    entityId: flag.clientId,
    via: 'portal',
  });
  revalidatePath(`/clients/${flag.clientId}`);
  revalidatePath('/clients');
  return { ok: true };
}

/** Her pain thresholds and the pelvic-floor gate, as the coach sets them. */
export async function saveGatesAction(clientId: string, gates: ClientGates): Promise<Result> {
  const supabase = await createServerSupabase();
  const clean: ClientGates = {
    pfGate: gates.pfGate,
    painThresholds: gates.painThresholds
      .filter((t) => t.location.trim() && Number.isFinite(t.max))
      .map((t) => ({
        location: t.location.trim().toLowerCase(),
        max: Math.max(0, Math.min(10, Math.round(t.max))),
      })),
  };
  const { error } = await saveClientGates(supabase, clientId, clean);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

/** The movement gates the coach has cleared this client through. */
export async function saveClearedGatesAction(
  clientId: string,
  gates: ExerciseGate[],
): Promise<Result> {
  const supabase = await createServerSupabase();
  const { error } = await saveClearedGates(
    supabase,
    clientId,
    gates.filter((g) => g === 'pelvic_floor' || g === 'shin'),
  );
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

/** Lets gated movements of one block through before the gate is cleared, or stops them. */
export async function setGateOverrideAction(
  clientId: string,
  assignmentId: string,
  gate: ExerciseGate,
  on: boolean,
): Promise<Result> {
  const supabase = await createServerSupabase();
  const { error } = await setGateOverride(supabase, assignmentId, gate, on);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

/** Restrictive-pattern flag and calorie tracking, for one client. */
export async function saveFuelSettingsAction(
  clientId: string,
  settings: FuelSettings,
): Promise<Result> {
  const supabase = await createServerSupabase();
  const { error } = await saveFuelSettings(supabase, clientId, settings);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

/** Moves her on the power ladder. The database refuses a jump or an uncleared gate. */
export async function setPowerLevelAction(
  clientId: string,
  level: number,
  note: string,
): Promise<Result> {
  const supabase = await createServerSupabase();
  const { error } = await setPowerLevel(supabase, clientId, level, note);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

/**
 * Her race, for the countdown on the companion's Progress. Both empty clears it. Upserted
 * with only these columns, so her intervals.icu id and weight on the same row are kept.
 */
export async function saveCompanionRaceAction(
  clientId: string,
  race: { name: string; date: string },
): Promise<Result> {
  const name = race.name.trim().slice(0, 80) || null;
  const date = race.date.trim() || null;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))))
    return { ok: false, error: 'That date does not look right.' };
  if (name && !date) return { ok: false, error: 'Add the race date too, for the countdown.' };
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('companion_profiles').upsert(
    {
      client_id: clientId,
      race_name: name,
      race_date: date,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' },
  );
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

export type IntervalsAthlete = IcuAthlete & {
  /** The first name of the other client this intervals.icu athlete is already linked to. */
  linkedTo: string | null;
};

/** Where her intervals.icu link stands, for the Companion card. */
export type IntervalsCheck =
  /** No INTERVALS_API_KEY on the deployment: nothing can be read for anyone yet. */
  | { state: 'no-key'; icuId: string | null }
  /** intervals.icu refused the key itself. */
  | { state: 'bad-key'; icuId: string | null }
  /** No id on file: the athletes she could be, with the likely one first. */
  | { state: 'unlinked'; athletes: IntervalsAthlete[]; suggested: string | null; listFailed: boolean }
  /** An id on file that intervals.icu won't share: the coaching request isn't accepted yet. */
  | { state: 'denied'; icuId: string }
  | { state: 'error'; icuId: string | null }
  | { state: 'connected'; icuId: string; name: string | null; conn: IcuConnection };

const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Reads her intervals.icu link live: whether intervals.icu shares her data, and what is
 * actually arriving (readings, activities, anything Strava keeps back). With no link yet,
 * lists the coach's intervals.icu athletes, suggesting the one whose email (or name)
 * matches hers, so the coach picks rather than types an id.
 */
export async function checkIntervalsAction(clientId: string): Promise<IntervalsCheck> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: 'error', icuId: null };

  // RLS: the coach reads her own clients' rows only, so "linked" means linked by her.
  const [{ data: client }, { data: linked }] = await Promise.all([
    supabase
      .from('clients')
      .select('email, first_name_hint, last_name_hint')
      .eq('id', clientId)
      .maybeSingle(),
    supabase
      .from('companion_profiles')
      .select('client_id, intervals_icu_id, clients(email, first_name_hint)')
      .not('intervals_icu_id', 'is', null),
  ]);
  if (!client) return { state: 'error', icuId: null };
  const icuId = linked?.find((p) => p.client_id === clientId)?.intervals_icu_id?.trim() || null;

  const key = icuKey();
  if (!key) return { state: 'no-key', icuId };

  if (icuId) {
    const check = await icuCheck(key, icuId);
    if (check.state === 'connected') return { ...check, icuId };
    if (check.state === 'denied') return { state: 'denied', icuId };
    return { state: check.state, icuId };
  }

  const list = await icuAthletes(key);
  if (!list.ok) {
    if (list.state === 'bad-key') return { state: 'bad-key', icuId: null };
    return { state: 'unlinked', athletes: [], suggested: null, listFailed: true };
  }
  const takenBy = new Map(
    (linked ?? [])
      .filter((p) => p.client_id !== clientId && p.intervals_icu_id)
      .map((p) => [
        p.intervals_icu_id!.trim().toLowerCase(),
        p.clients?.first_name_hint?.trim() || p.clients?.email?.split('@')[0] || 'another client',
      ]),
  );
  const athletes = list.athletes.map((a) => ({ ...a, linkedTo: takenBy.get(a.id.toLowerCase()) ?? null }));
  const free = athletes.filter((a) => !a.linkedTo);
  const full = lower(`${client.first_name_hint ?? ''} ${client.last_name_hint ?? ''}`);
  const first = lower(client.first_name_hint);
  const byFirst = first ? free.filter((a) => lower(a.name).split(/\s+/)[0] === first) : [];
  const suggested =
    free.find((a) => a.email && lower(a.email) === lower(client.email)) ??
    (full ? free.find((a) => lower(a.name) === full) : undefined) ??
    (byFirst.length === 1 ? byFirst[0] : undefined);
  return { state: 'unlinked', athletes, suggested: suggested?.id ?? null, listFailed: false };
}

/**
 * Links her to an intervals.icu athlete: the id, or a pasted intervals.icu link with it
 * in. One intervals.icu athlete links to one client, so two athletes can never read each
 * other's watch. Upserted with only this column, so her race and weight are kept.
 */
export async function linkIntervalsAction(clientId: string, input: string): Promise<Result> {
  const icuId = parseIcuId(input);
  if (!icuId)
    return {
      ok: false,
      error: 'That doesn\'t look like an intervals.icu athlete ID. It looks like i12345.',
    };
  const supabase = await createServerSupabase();
  const { data: other } = await supabase
    .from('companion_profiles')
    .select('client_id, clients(email, first_name_hint)')
    .eq('intervals_icu_id', icuId)
    .neq('client_id', clientId)
    .limit(1)
    .maybeSingle();
  if (other) {
    const who = other.clients?.first_name_hint?.trim() || other.clients?.email || 'another client';
    return { ok: false, error: `That intervals.icu athlete is already linked to ${who}.` };
  }
  const { error } = await supabase
    .from('companion_profiles')
    .upsert(
      { client_id: clientId, intervals_icu_id: icuId, updated_at: new Date().toISOString() },
      { onConflict: 'client_id' },
    );
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}

/** Unlinks her: the companion goes back to what Vela itself holds (Strava, Apple Health). */
export async function unlinkIntervalsAction(clientId: string): Promise<Result> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('companion_profiles')
    .update({ intervals_icu_id: null, updated_at: new Date().toISOString() })
    .eq('client_id', clientId);
  if (error) return { ok: false, error: friendlyError(error.message) };
  revalidatePath(`/clients/${clientId}`);
  return { ok: true };
}
