import { NextResponse } from 'next/server';
import { deleteProgram, getProgram } from '@vela/api';
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

/**
 * DELETE /api/programs/{id} — remove it from her list.
 *
 * Deleted outright when no client was ever assigned it; archived otherwise, so a plan
 * already on a phone carries on. The body says which: `{ "mode": "deleted" | "archived" }`.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, refused } = await requireCoach(req);
  if (refused) return refused;

  const { id } = await params;
  const { mode, error } = await deleteProgram(supabase, id);
  if (error === 'No such programme.') return NextResponse.json({ error }, { status: 404 });
  if (error || !mode)
    return NextResponse.json({ error: error ?? 'Could not delete.' }, { status: 500 });
  return NextResponse.json({ mode });
}
