import { NextResponse } from 'next/server';
import { getProgram } from '@vela/api';
import { requireCoach } from '@/lib/apiRoute';

/**
 * GET /api/programs/{id} — one programme in full: days, items, exercise names.
 *
 * 404 for a programme that is not hers as much as for one that does not exist; RLS
 * returns no row in both cases and there is no reason to tell them apart.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, refused } = await requireCoach(req);
  if (refused) return refused;

  const { id } = await params;
  const program = await getProgram(supabase, id);
  if (!program) return NextResponse.json({ error: 'No such programme.' }, { status: 404 });

  return NextResponse.json({ program });
}
