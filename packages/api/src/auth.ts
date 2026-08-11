import type { VelaClient } from './client';

export type Role = 'coach' | 'client';

export interface SessionUser {
  id: string;
  email: string;
  emailVerified: boolean;
  role: Role;
  firstName: string;
  lastName: string;
}

/**
 * Sends a magic link. This single mechanism does double duty: signing in, and proving
 * the person controls the mailbox — the click *is* the verification.
 *
 * `shouldCreateUser` is deliberately explicit at every call site. The portal must not
 * silently mint accounts for typo'd coach addresses, while invite acceptance must be
 * able to create the invited person's account on first use.
 */
export async function sendMagicLink(
  supabase: VelaClient,
  email: string,
  opts: { redirectTo: string; shouldCreateUser: boolean },
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: opts.redirectTo, shouldCreateUser: opts.shouldCreateUser },
  });
  return { error: error?.message ?? null };
}

/** Verifies a 6-digit code instead of a link — the reliable path on a phone, where a
 *  tapped link can open the wrong browser and lose the app's PKCE verifier. */
export async function verifyEmailOtp(
  supabase: VelaClient,
  email: string,
  token: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });
  return { error: error?.message ?? null };
}

export async function getSessionUser(supabase: VelaClient): Promise<SessionUser | null> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? '',
    emailVerified: Boolean(user.email_confirmed_at),
    role: (profile?.role as Role) ?? 'client',
    firstName: profile?.first_name ?? '',
    lastName: profile?.last_name ?? '',
  };
}

export async function signOut(supabase: VelaClient): Promise<void> {
  await supabase.auth.signOut();
}

/** GDPR Article 17. Hard delete, cascading, executed as the caller. */
export async function deleteMyAccount(
  supabase: VelaClient,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('delete_my_account');
  return { error: error?.message ?? null };
}

/** GDPR Article 15/20 — everything held about the signed-in client, as one object. */
export async function exportMyData(supabase: VelaClient): Promise<Record<string, unknown>> {
  const { data: client } = await supabase.from('clients').select('*').maybeSingle();
  const { data: profile } = await supabase.from('profiles').select('*').maybeSingle();
  const { data: consents } = await supabase.from('consents').select('*');
  return {
    exportedAt: new Date().toISOString(),
    profile,
    client,
    consents,
  };
}
