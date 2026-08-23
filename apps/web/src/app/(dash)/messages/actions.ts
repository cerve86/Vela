'use server';

import { revalidatePath } from 'next/cache';
import { markRead, sendMessage } from '@vela/api';
import { createServerSupabase } from '@/lib/supabase/server';

export interface ReplyResult {
  ok: boolean;
  error?: string;
}

/** Sends the coach's reply into one client's thread. */
export async function replyToClient(formData: FormData): Promise<ReplyResult> {
  const clientId = String(formData.get('clientId') ?? '');
  const body = String(formData.get('body') ?? '').trim();

  if (!clientId) return { ok: false, error: 'Missing client.' };
  if (!body) return { ok: false, error: 'Write something first.' };
  if (body.length > 4000) return { ok: false, error: 'That is longer than a message can be.' };

  const supabase = await createServerSupabase();

  // `sender: 'coach'` is checked against the caller by the insert policy. This action
  // cannot write on behalf of a coach it is not signed in as.
  const { error } = await sendMessage(supabase, { clientId, sender: 'coach', body });
  if (error) return { ok: false, error };

  revalidatePath('/messages');
  return { ok: true };
}

/**
 * Marks a client's messages read.
 *
 * A separate action rather than something the page does while rendering: a server
 * component must not mutate during render, and marking a thread read is a consequence of
 * the coach opening it, not of the page being generated.
 */
export async function markThreadRead(clientId: string): Promise<void> {
  if (!clientId) return;
  const supabase = await createServerSupabase();
  await markRead(supabase, clientId, 'client');
  revalidatePath('/messages');
}
