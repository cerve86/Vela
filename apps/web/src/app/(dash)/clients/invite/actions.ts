'use server';

import { createClient } from '@supabase/supabase-js';
import { createInvite } from '@vela/api';
import type { Database } from '@vela/api/types';
import { createServerSupabase } from '@/lib/supabase/server';

export interface InviteResult {
  ok: boolean;
  error?: string;
  email?: string;
  /** Something worth telling the coach about a successful invite that took a detour. */
  note?: string;
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
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
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
      error:
        'Invite created but the email could not be sent: SUPABASE_SERVICE_ROLE_KEY is not set.',
    };
  }

  const admin = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const coachName = `${coach?.first_name ?? ''} ${coach?.last_name ?? ''}`.trim() || 'Your coach';

  // No invite token here any more: the email carries a six-digit OTP and acceptance is
  // keyed on the verified email address, so there is nothing secret to thread through.
  const metadata = {
    coach_name: coachName,
    practice_name: coachRow?.practice_name ?? 'your practice',
    first_name: firstName,
    last_name: lastName,
  };

  /**
   * inviteUserByEmail renders the email from the auth user's STORED metadata rather
   * than the `data` passed on this call, so a re-invite would otherwise show a stale
   * coach or practice name. Overwriting it first keeps the email truthful.
   */
  const { data: existing } = await admin.auth.admin.listUsers();
  const priorUser = existing?.users.find((u) => u.email?.toLowerCase() === email);

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.vela-coaching.com';
  const welcome = `${site}/welcome`;

  if (priorUser?.email_confirmed_at) {
    /**
     * A verified account is one of two things, and they need different answers.
     *
     * Linked — the client row carries her profile — and she is simply a client already:
     * there is nothing to invite her to. Or verified but not linked to this practice: she
     * exists, so the auth API will not "invite" her again. What she gets instead is the
     * same welcome page an invitation leads to, reached through a set-password link, and
     * the invitation created above is accepted there. From her side the two emails ask
     * the same thing: choose a password.
     */
    const { data: linked } = await supabase
      .from('clients')
      .select('profile_id')
      .eq('email', email)
      .not('profile_id', 'is', null)
      .maybeSingle();
    if (linked) {
      return {
        ok: false,
        error: 'That email is already one of your clients — ask them to sign in to the app.',
      };
    }

    const anon = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { error: linkError } = await anon.auth.resetPasswordForEmail(email, {
      redirectTo: welcome,
    });
    if (linkError) {
      return { ok: false, error: `Could not email the invitation link: ${linkError.message}` };
    }
    return {
      ok: true,
      email,
      note: `${email} already had a Vela account, so they were emailed a link to choose a password and join your practice.`,
    };
  }

  if (priorUser) {
    const { error: updateError } = await admin.auth.admin.updateUserById(priorUser.id, {
      user_metadata: metadata,
    });
    if (updateError) {
      return { ok: false, error: `Could not refresh the invitation: ${updateError.message}` };
    }
  }

  /**
   * The invitation email carries a link to the welcome page, where she chooses a password
   * and the invitation is accepted. No code to type, no second email.
   */
  const { error: mailError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: metadata,
    redirectTo: welcome,
  });

  if (mailError) {
    return { ok: false, error: `Invite created but email failed: ${mailError.message}` };
  }

  return { ok: true, email };
}

export async function revokeInviteAction(
  inviteId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('client_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId);
  return error ? { ok: false, error: error.message } : { ok: true };
}
