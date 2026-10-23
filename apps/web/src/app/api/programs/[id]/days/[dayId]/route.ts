import { NextResponse } from 'next/server';
import { deleteDay, getProgram, logAudit, notifyProgramEdited, updateDay } from '@vela/api';
import { requireCoach } from '@/lib/apiRoute';
import {
  DAY_NOTES_MAX,
  DAY_TITLE_MAX,
  DISCIPLINE_LIST,
  parseDayNo,
  parseDiscipline,
  parseWeekNo,
} from '@/lib/programInput';

type Ctx = { params: Promise<{ id: string; dayId: string }> };

/**
 * PATCH /api/programs/{id}/days/{dayId} — change a day in place: any of title,
 * discipline, notes, weekNo, dayNo. Her upcoming sessions follow: renamed, moved, or
 * re-disciplined; completed ones never change.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { supabase, userId, via, refused } = await requireCoach(req);
  if (refused) return refused;
  const { id, dayId } = await params;

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send JSON.' }, { status: 400 });
  }
  const program = await getProgram(supabase, id);
  const day = program?.days.find((d) => d.id === dayId);
  if (!program || !day)
    return NextResponse.json({ error: 'No such day in this programme.' }, { status: 404 });

  const weekNo = parseWeekNo(b.weekNo);
  const dayNo = parseDayNo(b.dayNo);
  const discipline = parseDiscipline(b.discipline);
  if (weekNo === 'invalid')
    return NextResponse.json({ error: 'weekNo must be 1–52.' }, { status: 400 });
  if (dayNo === 'invalid')
    return NextResponse.json({ error: 'dayNo must be 1–7 (1 = Monday).' }, { status: 400 });
  if (discipline === 'invalid')
    return NextResponse.json(
      { error: `discipline is one of ${DISCIPLINE_LIST}.` },
      { status: 400 },
    );
  let title: string | undefined;
  if (b.title !== undefined) {
    title = String(b.title).trim();
    if (!title || title.length > DAY_TITLE_MAX)
      return NextResponse.json(
        { error: `title must be 1–${DAY_TITLE_MAX} characters.` },
        { status: 400 },
      );
  }
  let notes: string | null | undefined;
  if (b.notes !== undefined) {
    notes = b.notes === null ? null : String(b.notes).trim() || null;
    if (notes && notes.length > DAY_NOTES_MAX)
      return NextResponse.json(
        { error: `notes may be up to ${DAY_NOTES_MAX} characters.` },
        { status: 400 },
      );
  }

  const { error } = await updateDay(supabase, dayId, { title, discipline, notes, weekNo, dayNo });
  if (error)
    return NextResponse.json({ error }, { status: error.includes('already has') ? 409 : 500 });

  await notifyProgramEdited(supabase, { programId: id, programName: program.name, via });
  await logAudit(supabase, {
    actorId: userId,
    action: 'program.day_updated',
    entity: 'program',
    entityId: id,
    via,
  });
  const after = await getProgram(supabase, id);
  return NextResponse.json({ day: after?.days.find((d) => d.id === dayId) ?? null });
}

/**
 * DELETE /api/programs/{id}/days/{dayId} — remove a day and its movements. Her upcoming
 * session for it leaves her calendar; a session already done on it stays in her history.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  const { supabase, userId, via, refused } = await requireCoach(req);
  if (refused) return refused;
  const { id, dayId } = await params;
  const program = await getProgram(supabase, id);
  const day = program?.days.find((d) => d.id === dayId);
  if (!program || !day)
    return NextResponse.json({ error: 'No such day in this programme.' }, { status: 404 });

  const { error } = await deleteDay(supabase, dayId);
  if (error) return NextResponse.json({ error }, { status: 500 });
  await notifyProgramEdited(supabase, { programId: id, programName: program.name, via });
  await logAudit(supabase, {
    actorId: userId,
    action: 'program.day_removed',
    entity: 'program',
    entityId: id,
    via,
  });
  return NextResponse.json({ removed: { weekNo: day.weekNo, dayNo: day.dayNo, title: day.title } });
}
