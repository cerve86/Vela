'use server';

import { createClient } from '@supabase/supabase-js';
import { createInvite } from '@coachapp/api';
import type { Database } from '@coachapp/api/types';
import { createServerSupabase } from '@/lib/supabase/server';

export interface InviteResult {
  ok: boolean;
  error?: string;
  email?: string;
}

/**
 * Creates the invite and sends the email, in that order.
 *
 * Two clients, deliberately:
 *   - the cookie-scoped client mints the invite AS THE COACH, so the RPC's own guards
 *     and RLS apply and a coach can only ever create invites for themselves;
 *   - a service-role client sends the email, because the Admin API is the only thing
 *     that can create an unconfirmed auth user and issue a token hash.
 *
 * The service-role key is read from a non-public env var and never leaves the server.
 */
export async function inviteClient(formData: FormData): Promise<InviteResult> {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const condition = String(formData.get('condition') ?? '').trim();
  const goal = String(formData.get('goal') ?? '').trim();

  if (!email || !firstName) {
    return { ok: false, error: 'A first name and email address are required.' };
  }

  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: coach } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', user.id)
    .maybeSingle();
  const { data: coachRow } = await supabase
    .from('coaches')
    .select('practice_name')
    .eq('id', user.id)
    .maybeSingle();

  const { invite, error } = await createInvite(supabase, {
    email,
    firstName,
    lastName,
    condition: condition || undefined,
    goal: goal || undefined,
  });

  if (error || !invite) {
    return { ok: false, error: error ?? 'Could not create the invite.' };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return {
      ok: false,
      error: 'Invite created but the email could not be sent: SUPABASE_SERVICE_ROLE_KEY is not set.',
    };
  }

  const admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const coachName = `${coach?.first_name ?? ''} ${coach?.last_name ?? ''}`.trim() || 'Your coach';

  const metadata = {
    invite_token: invite.token,
    coach_name: coachName,
    practice_name: coachRow?.practice_name ?? 'your practice',
    first_name: firstName,
    last_name: lastName,
  };

  /**
   * Re-invites need care. inviteUserByEmail renders the email from the auth user's
   * STORED metadata, not from the `data` passed on this call. So a second invite
   * happily mails the PREVIOUS token — which create_client_invite has just revoked,
   * leaving the client holding a link that can never be accepted.
   *
   * Overwriting the metadata first is what keeps the emailed token and the live invite
   * row in step.
   */
  const { data: existing } = await admin.auth.admin.listUsers();
  const priorUser = existing?.users.find((u) => u.email?.toLowerCase() === email);

  if (priorUser) {
    if (priorUser.email_confirmed_at) {
      return {
        ok: false,
        error: 'That email already has a verified CoachApp account — ask them to sign in instead.',
      };
    }
    const { error: updateError } = await admin.auth.admin.updateUserById(priorUser.id, {
      user_metadata: metadata,
    });
    if (updateError) {
      return { ok: false, error: `Could not refresh the invitation: ${updateError.message}` };
    }
  }

  const { error: mailError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: metadata,
    redirectTo: 'coachapp://invite',
  });

  if (mailError) {
    return { ok: false, error: `Invite created but email failed: ${mailError.message}` };
  }

  return { ok: true, email };
}

export async function revokeInviteAction(inviteId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('client_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
