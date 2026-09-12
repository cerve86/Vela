'use server';

import { revalidatePath } from 'next/cache';
import {
  friendlyError,
  listClientPlans,
  logAudit,
  mondayOf,
  sendMessage,
  upsertClientPlan,
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
