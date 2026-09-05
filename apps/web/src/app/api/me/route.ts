import { NextResponse } from 'next/server';
import { requireCoach } from '@/lib/apiRoute';

/**
 * GET /api/me — who this credential acts as.
 *
 * The first call a new integration makes, and the one that turns "the key is refused" from
 * a guess into a fact. Nothing here that the coach cannot already see at the bottom of
 * her sidebar.
 */
export async function GET(req: Request) {
  const { supabase, userId, refused } = await requireCoach(req);
  if (refused) return refused;

  const [{ data: profile }, { data: coach }] = await Promise.all([
    supabase.from('profiles').select('first_name, last_name, role').eq('id', userId).maybeSingle(),
    supabase.from('coaches').select('practice_name').eq('id', userId).maybeSingle(),
  ]);

  return NextResponse.json({
    id: userId,
    firstName: profile?.first_name ?? '',
    lastName: profile?.last_name ?? '',
    role: profile?.role ?? 'client',
    practiceName: coach?.practice_name ?? null,
  });
}
