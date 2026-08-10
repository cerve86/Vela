import type { CoachAppClient } from './client';

export interface CreatedInvite {
  inviteId: string;
  clientId: string;
  /** The raw token, returned exactly once. Email it; it can never be read again. */
  token: string;
}

export interface PendingInvite {
  id: string;
  clientId: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
}

export async function createInvite(
  supabase: CoachAppClient,
  input: {
    email: string;
    firstName: string;
    lastName: string;
    condition?: string;
    goal?: string;
  },
): Promise<{ invite: CreatedInvite | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_client_invite', {
    p_email: input.email,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    // The generated signature takes `string | undefined` for the defaulted params;
    // passing null would send an explicit SQL NULL rather than omitting the argument.
    p_condition: input.condition,
    p_goal: input.goal,
  });

  if (error) return { invite: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { invite: null, error: 'No invite returned' };

  return {
    invite: { inviteId: row.invite_id, clientId: row.client_id, token: row.token },
    error: null,
  };
}

/**
 * Redeems the pending invitation for the caller's verified email address.
 *
 * There is no token to pass: entering the six-digit code from the invitation email is
 * what proves control of the mailbox, and that is the only thing the old token proved.
 */
export async function acceptMyInvite(
  supabase: CoachAppClient,
): Promise<{ clientId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('accept_my_invite');
  if (error) return { clientId: null, error: error.message };
  return { clientId: data as string, error: null };
}

/** Verifies the six-digit invitation code. Signs the user in and marks the email verified. */
export async function verifyInviteCode(
  supabase: CoachAppClient,
  email: string,
  code: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'invite',
  });
  return { error: error?.message ?? null };
}

export async function listInvites(supabase: CoachAppClient): Promise<PendingInvite[]> {
  const { data } = await supabase
    .from('client_invites')
    .select('id, client_id, email, expires_at, created_at, accepted_at, revoked_at')
    .order('created_at', { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id,
    clientId: r.client_id,
    email: r.email,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    acceptedAt: r.accepted_at,
    revokedAt: r.revoked_at,
  }));
}

export async function revokeInvite(
  supabase: CoachAppClient,
  inviteId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('client_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', inviteId);
  return { error: error?.message ?? null };
}

export type ConsentType = 'tos' | 'privacy' | 'health_data_processing';

export async function recordConsent(
  supabase: CoachAppClient,
  types: ConsentType[],
  policyVersion: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('record_consent', {
    p_types: types,
    p_version: policyVersion,
  });
  return { error: error?.message ?? null };
}
