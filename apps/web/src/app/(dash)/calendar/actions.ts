'use server';

import { revalidatePath } from 'next/cache';
import {
  decideDeloadForSession,
  decideMoveRequest,
  friendlyError,
  getSessionPlan,
  moveSession,
  type SessionPlanItem,
} from '@vela/api';
import { createServerSupabase } from '@/lib/supabase/server';

/** The prescription behind one session, for the panel's detail. RLS decides what she may see. */
export async function loadSessionPlanAction(sessionId: string): Promise<SessionPlanItem[]> {
  const supabase = await createServerSupabase();
  return getSessionPlan(supabase, sessionId);
}

export interface MoveResult {
  ok: boolean;
  moved?: number;
  error?: string;
}

/**
 * Moves a planned session, alone or with the rest of its block. The database refuses a
 * record, a past session, a day in the past, or a client who is not hers.
 */
export async function moveSessionAction(
  sessionId: string,
  to: string,
  ripple: boolean,
): Promise<MoveResult> {
  const supabase = await createServerSupabase();
  const { moved, error } = await moveSession(supabase, sessionId, to, ripple);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath('/calendar');
  revalidatePath('/clients', 'layout');
  return { ok: true, moved };
}

/** Answers a client's request to move a session: to the day she asked, or keep it. */
export async function decideMoveAction(sessionId: string, accept: boolean): Promise<MoveResult> {
  const supabase = await createServerSupabase();
  const { error } = await decideMoveRequest(supabase, sessionId, accept);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath('/calendar');
  revalidatePath('/clients', 'layout');
  return { ok: true };
}

/** Her answer to a deload check: deload as planned, or repeat the last load week first. */
export async function decideDeloadAction(
  sessionId: string,
  choice: 'deload' | 'repeat',
): Promise<MoveResult> {
  const supabase = await createServerSupabase();
  const { error } = await decideDeloadForSession(supabase, sessionId, choice);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath('/calendar');
  revalidatePath('/clients', 'layout');
  return { ok: true };
}
