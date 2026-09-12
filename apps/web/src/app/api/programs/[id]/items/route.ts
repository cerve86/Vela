import { NextResponse } from 'next/server';
import {
  addItem,
  getProgram,
  logAudit,
  notifyProgramEdited,
  resolveExerciseNames,
  updateItem,
} from '@vela/api';
import { requireCoach } from '@/lib/apiRoute';

/**
 * POST /api/programs/{id}/items — add a prescription to a day of a programme.
 *
 * Body: `{ dayId, exercise, block?, sets, reps, loadKg?, rpe?, tempo?, restSec?, notes? }`.
 * The exercise is a library name, matched the way the import matches (case, spacing and
 * hyphens ignored); 422 with the name if it is not in her library. Sessions already on a
 * client's calendar read their prescriptions from the programme, so the change reaches
 * her next session. 201 with the item.
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
  const day = program.days.find((d) => d.id === b.dayId);
  if (!day) return NextResponse.json({ error: 'No such day in this programme.' }, { status: 400 });

  const exercise = typeof b.exercise === 'string' ? b.exercise.trim() : '';
  const sets = Number(b.sets);
  const reps = typeof b.reps === 'string' ? b.reps.trim() : String(b.reps ?? '');
  if (!exercise) return NextResponse.json({ error: 'exercise is required.' }, { status: 400 });
  if (!Number.isInteger(sets) || sets < 1 || sets > 20)
    return NextResponse.json(
      { error: 'sets must be a whole number from 1 to 20.' },
      { status: 400 },
    );
  if (!reps)
    return NextResponse.json(
      { error: 'reps is required (e.g. "8-10", "AMRAP", "30s").' },
      { status: 400 },
    );

  const { byName, unmatched } = await resolveExerciseNames(supabase, userId, [exercise]);
  if (unmatched.length > 0)
    return NextResponse.json({ error: 'Not in your library.', unmatched }, { status: 422 });
  const exerciseId = [...byName.values()][0]!;

  const orderIndex = day.items.length ? Math.max(...day.items.map((i) => i.orderIndex)) + 1 : 0;
  const { error: addError } = await addItem(supabase, day.id, exerciseId, orderIndex);
  if (addError) return NextResponse.json({ error: addError }, { status: 500 });

  const after = await getProgram(supabase, id);
  const created = after?.days
    .find((d) => d.id === day.id)
    ?.items.find((i) => i.orderIndex === orderIndex && i.exerciseId === exerciseId);
  if (!created)
    return NextResponse.json({ error: 'Added, but could not read it back.' }, { status: 500 });

  const patch = {
    block: typeof b.block === 'string' && b.block.trim() ? b.block.trim().toUpperCase() : 'A',
    sets,
    reps,
    targetLoadKg: b.loadKg == null ? null : Number(b.loadKg),
    targetRpe: b.rpe == null ? null : Number(b.rpe),
    tempo: typeof b.tempo === 'string' && b.tempo.trim() ? b.tempo.trim() : null,
    restSec: b.restSec == null ? 60 : Number(b.restSec),
    notes: typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null,
  };
  const { error } = await updateItem(supabase, created.id, patch);
  if (error) return NextResponse.json({ error }, { status: 500 });
  await notifyProgramEdited(supabase, { programId: id, programName: program.name, via });
  await logAudit(supabase, {
    actorId: userId,
    action: 'program.item_added',
    entity: 'program',
    entityId: id,
    via,
  });

  return NextResponse.json(
    { item: { ...created, ...patch, exerciseName: created.exerciseName } },
    { status: 201 },
  );
}
