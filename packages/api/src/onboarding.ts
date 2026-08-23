import type { VelaClient } from './client';

/**
 * Marks the caller's own client row as having finished the welcome flow.
 *
 * An RPC rather than an update, because `authenticated` holds table-wide UPDATE on
 * `clients` for the coach's sake and RLS cannot narrow an update to a single column. A
 * client-facing update policy would therefore let anyone reassign their own `coach_id`.
 * The definer function writes one column on the row `auth.uid()` resolves to, and there is
 * no policy permitting the direct write — see `mark_onboarded()`.
 *
 * Idempotent: calling it again returns the original moment rather than resetting it.
 */
export async function markOnboarded(
  supabase: VelaClient,
): Promise<{ onboardedAt: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('mark_onboarded');
  return {
    onboardedAt: (data as string | null) ?? null,
    error: error?.message ?? null,
  };
}
