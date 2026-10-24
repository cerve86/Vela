import { NextResponse } from 'next/server';
import { getSession, moveSession } from '@vela/api';
import { requireCoach } from '@/lib/apiRoute';
import { isIsoDate } from '@/lib/programInput';

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/sessions/{id}/move — move a planned session to another day.
 *
 * Body: `{ to, ripple? }`. With `ripple`, every planned session after it in the same
 * block moves by the same number of days. Only a session still planned, today or later,
 * moves, and never into the past; a moved session keeps its new day when the programme
 * changes. 200 with how many moved.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { supabase, refused } = await requireCoach(req);
  if (refused) return refused;
  const { id } = await params;

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send JSON.' }, { status: 400 });
  }
  if (!isIsoDate(b.to))
    return NextResponse.json({ error: 'to must be a date, YYYY-MM-DD.' }, { status: 400 });
  const ripple = b.ripple === true;

  const session = await getSession(supabase, id);
  if (!session) return NextResponse.json({ error: 'No such session.' }, { status: 404 });

  const { moved, error } = await moveSession(supabase, id, b.to, ripple);
  if (error) return NextResponse.json({ error }, { status: /not found/i.test(error) ? 404 : 422 });
  return NextResponse.json({
    moved,
    session: { id, title: session.title, from: session.scheduledDate, to: b.to },
  });
}
