'use server';

import { revalidatePath } from 'next/cache';
import { sendMessage } from '@vela/api';
import { createServerSupabase } from '@/lib/supabase/server';

export interface RespondResult {
  ok: boolean;
  error?: string;
}

/**
 * Sends the coach's response to a session into the client's thread.
 *
 * This is the return leg. Until now the loop ran one way — the client logged a session and
 * the coach read it — and anything the coach wanted to say back had to leave the product
 * and become a text message, where it is not attached to the session, not visible to the
 * client's app, and not part of the record.
 *
 * The session id travels with the message, so "hold the impact work where it is" arrives
 * attached to the day it is about rather than as a remark the client has to place herself.
 *
 * `sender: 'coach'` is checked against the caller by the insert policy — a client cannot
 * write as a coach, and this action cannot write on behalf of a coach it is not. The
 * authority comes from the cookie-scoped client, not from this argument.
 */
export async function respondToSession(formData: FormData): Promise<RespondResult> {
  const clientId = String(formData.get('clientId') ?? '');
  const sessionId = String(formData.get('sessionId') ?? '') || null;
  const body = String(formData.get('body') ?? '').trim();

  if (!clientId) return { ok: false, error: 'Missing client.' };
  if (!body) return { ok: false, error: 'Write something first.' };
  if (body.length > 4000) return { ok: false, error: 'That is longer than a message can be.' };

  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { error } = await sendMessage(supabase, {
    clientId,
    sender: 'coach',
    body,
    sessionId,
  });

  if (error) return { ok: false, error };

  // The thread is rendered elsewhere in the portal; refresh it rather than leaving a stale
  // copy behind the coach's back.
  revalidatePath(`/clients/${clientId}/training`);
  revalidatePath('/messages');
  return { ok: true };
}
