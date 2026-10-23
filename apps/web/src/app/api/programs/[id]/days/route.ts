import { NextResponse } from 'next/server';
import { addDay, getProgram, logAudit, notifyProgramEdited } from '@vela/api';
import { requireCoach } from '@/lib/apiRoute';
import {
  DAY_NOTES_MAX,
  DAY_TITLE_MAX,
  DISCIPLINE_LIST,
  parseDayNo,
  parseDiscipline,
  parseWeekNo,
} from '@/lib/programInput';

/**
 * POST /api/programs/{id}/days — add a day to a programme.
 *
 * Body: `{ weekNo, dayNo, title, discipline?, notes? }`. dayNo is the weekday, 1 = Monday.
 * A day may be notes only — a bike ladder, a long run described in words — and gets its
 * movements with POST …/items. Every client on the programme gets the session on her
 * calendar at once, if its date is still ahead. 201 with the day's id.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, via, refused } = await requireCoach(req);
  if (refused) return refused;
  const { id } = await params;

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send JSON.' }, { status: 400 });
  }
  const program = await getProgram(supabase, id);
  if (!program) return NextResponse.json({ error: 'No such programme.' }, { status: 404 });

  const weekNo = parseWeekNo(b.weekNo);
  const dayNo = parseDayNo(b.dayNo);
  const discipline = parseDiscipline(b.discipline);
  const title = typeof b.title === 'string' ? b.title.trim() : '';
  const notes = typeof b.notes === 'string' ? b.notes.trim() : null;
  if (weekNo === undefined || weekNo === 'invalid')
    return NextResponse.json({ error: 'weekNo must be 1–52.' }, { status: 400 });
  if (dayNo === undefined || dayNo === 'invalid')
    return NextResponse.json({ error: 'dayNo must be 1–7 (1 = Monday).' }, { status: 400 });
  if (discipline === 'invalid')
    return NextResponse.json(
      { error: `discipline is one of ${DISCIPLINE_LIST}.` },
      { status: 400 },
    );
  if (!title || title.length > DAY_TITLE_MAX)
    return NextResponse.json(
      { error: `title is required, up to ${DAY_TITLE_MAX} characters.` },
      { status: 400 },
    );
  if (notes && notes.length > DAY_NOTES_MAX)
    return NextResponse.json(
      { error: `notes may be up to ${DAY_NOTES_MAX} characters.` },
      { status: 400 },
    );

  const { id: dayId, error } = await addDay(supabase, id, {
    weekNo,
    dayNo,
    title,
    discipline: discipline ?? 'strength',
    notes,
  });
  if (error || !dayId)
    return NextResponse.json(
      { error: error ?? 'Could not add the day.' },
      { status: error?.includes('already has') ? 409 : 500 },
    );

  await notifyProgramEdited(supabase, { programId: id, programName: program.name, via });
  await logAudit(supabase, {
    actorId: userId,
    action: 'program.day_added',
    entity: 'program',
    entityId: id,
    via,
  });
  return NextResponse.json({ day: { id: dayId, weekNo, dayNo, title } }, { status: 201 });
}
