'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { createInvite, friendlyError, logAudit, type VelaClient } from '@vela/api';
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

  return emailInvitation(supabase, {
    email,
    firstName,
    lastName,
    coachName: `${coach?.first_name ?? ''} ${coach?.last_name ?? ''}`.trim() || 'Your coach',
    practiceName: coachRow?.practice_name ?? 'your practice',
  });
}

/**
 * Sends the invitation email for an invite that already exists.
 *
 * Shared by the first invitation and a reminder: the two differ only in whether the
 * invite row is new, and the email is the same either way.
 */
async function emailInvitation(
  supabase: VelaClient,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    coachName: string;
    practiceName: string;
  },
): Promise<InviteResult> {
  const { email, firstName, lastName } = input;
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

  // No invite token here any more: the email carries a six-digit OTP and acceptance is
  // keyed on the verified email address, so there is nothing secret to thread through.
  const metadata = {
    coach_name: input.coachName,
    practice_name: input.practiceName,
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

/** The coach's name and practice, as the invitation email signs them. */
async function coachWords(supabase: VelaClient, userId: string) {
  const [{ data: coach }, { data: coachRow }] = await Promise.all([
    supabase.from('profiles').select('first_name, last_name').eq('id', userId).maybeSingle(),
    supabase.from('coaches').select('practice_name').eq('id', userId).maybeSingle(),
  ]);
  return {
    coachName: `${coach?.first_name ?? ''} ${coach?.last_name ?? ''}`.trim() || 'Your coach',
    practiceName: coachRow?.practice_name ?? 'your practice',
  };
}

/**
 * Sends the invitation again to a client who has not yet accepted.
 *
 * A fresh invite is minted first — the old one is superseded and the fourteen days start
 * again — and then the same email goes out. Nothing else about her changes: the row,
 * the name her physio wrote, and any programme already assigned to her all stay.
 */
export async function remindClientAction(clientId: string): Promise<InviteResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: client } = await supabase
    .from('clients')
    .select('email, first_name_hint, last_name_hint, condition, goal, status')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return { ok: false, error: 'That client is no longer here.' };
  if (client.status !== 'invited')
    return { ok: false, error: 'They have already accepted — nothing to remind them of.' };

  const { error } = await createInvite(supabase, {
    email: client.email,
    firstName: client.first_name_hint ?? '',
    lastName: client.last_name_hint ?? '',
    condition: client.condition ?? undefined,
    goal: client.goal ?? undefined,
  });
  if (error) return { ok: false, error: friendlyError(error) };

  const words = await coachWords(supabase, user.id);
  const sent = await emailInvitation(supabase, {
    email: client.email,
    firstName: client.first_name_hint ?? '',
    lastName: client.last_name_hint ?? '',
    ...words,
  });
  if (sent.ok) revalidatePath('/clients');
  return sent;
}

/**
 * Removes a client who never accepted: the row and, by cascade, her invitation and
 * anything assigned to her in advance. Refused for anyone who has signed in — a client
 * with history is archived by other means, not deleted from a list.
 */
export async function deleteInvitedClientAction(
  clientId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: client } = await supabase
    .from('clients')
    .select('id, status, profile_id')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return { ok: true };
  if (client.status !== 'invited' || client.profile_id)
    return {
      ok: false,
      error: 'They have already accepted; only an unaccepted invitation can be deleted.',
    };

  const { error } = await supabase.from('clients').delete().eq('id', clientId);
  if (error) return { ok: false, error: friendlyError(error.message) };
  await logAudit(supabase, {
    actorId: user.id,
    action: 'client.invite_deleted',
    entity: 'client',
    entityId: clientId,
    via: 'portal',
  });
  revalidatePath('/clients');
  return { ok: true };
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
