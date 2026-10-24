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
  saveClientGates,
  sendMessage,
  setGateOverride,
  upsertClientPlan,
  type ClientGates,
  type ExerciseGate,
} from '@vela/api';
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
