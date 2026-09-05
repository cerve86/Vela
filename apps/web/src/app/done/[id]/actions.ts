'use server';

import { getSessionPlan } from '@vela/api';
import { adminClient, clientAsUser } from '@/lib/impersonate';

/** Marks a whole session complete from its calendar link. Every set counts as done. */
export async function markDoneAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const sessionId = String(formData.get('sessionId') ?? '');
  const token = String(formData.get('token') ?? '');
  if (!/^[0-9a-f-]{36}$/.test(sessionId) || !/^[0-9a-f]{48}$/.test(token))
    return { ok: false, error: 'That link is not valid.' };

  const admin = adminClient();
  if (!admin) return { ok: false, error: 'The server is not configured.' };
  const { data: row } = await admin
    .from('calendar_tokens')
    .select('client_id, profile_id, revoked_at')
    .eq('token', token)
    .maybeSingle();
  if (!row || row.revoked_at)
    return {
      ok: false,
      error: 'That link is no longer valid. Open the app to get a new calendar link.',
    };

  const asUser = await clientAsUser(row.profile_id);
  if (!asUser) return { ok: false, error: 'Could not sign you in from the link.' };

  const { data: session } = await asUser
    .from('sessions')
    .select('id, status')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: 'That session is not yours, or no longer exists.' };
  if (session.status === 'completed') return { ok: true };

  const plan = await getSessionPlan(asUser, sessionId);
  const sets = plan.reduce((n, i) => n + i.sets, 0);
  const { error } = await asUser
    .from('sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      sets_planned: sets,
      sets_done: sets,
      logged_via: 'calendar',
    })
    .eq('id', sessionId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
