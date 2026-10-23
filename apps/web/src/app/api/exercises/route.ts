import { NextResponse } from 'next/server';
import {
  EXERCISE_CATEGORIES,
  createExercise,
  listExercises,
  logAudit,
  normaliseExerciseName,
  type ExerciseCategory,
} from '@vela/api';
import { requireCoach } from '@/lib/apiRoute';

/**
 * GET /api/exercises?search=&category= — the library as this coach sees it: everything
 * shipped with Vela plus her own.
 *
 * An import matches movements to these names and refuses anything it cannot find, so a
 * tool drafting a programme reads this first. The response is deliberately the same
 * shape the portal's library page works from.
 */
export async function GET(req: Request) {
  const { supabase, userId, refused } = await requireCoach(req);
  if (refused) return refused;

  const params = new URL(req.url).searchParams;
  const search = params.get('search')?.trim() || undefined;
  const rawCategory = params.get('category')?.trim();
  const category = EXERCISE_CATEGORIES.find((c) => c.value === rawCategory)?.value as
    ExerciseCategory | undefined;
  if (rawCategory && !category) {
    return NextResponse.json(
      {
        error: `Unknown category "${rawCategory}". One of: ${EXERCISE_CATEGORIES.map((c) => c.value).join(', ')}.`,
      },
      { status: 400 },
    );
  }

  const exercises = await listExercises(supabase, userId, { search, category });
  return NextResponse.json({
    exercises: exercises.map((e) => ({
      id: e.id,
      name: e.name,
      category: e.category,
      equipment: e.equipment,
      muscleGroups: e.muscleGroups,
      cues: e.cues,
      isMine: e.isMine,
    })),
  });
}

/**
 * POST /api/exercises — add a movement to this coach's own library.
 *
 * Body: `{ name, category, cue?, equipment?, notes? }`. Refused with 409 when a movement
 * of the same name (case, spacing, hyphens aside) is already hers or shipped, so a typo
 * never becomes a second copy. 201 with the exercise.
 */
export async function POST(req: Request) {
  const { supabase, userId, via, refused } = await requireCoach(req);
  if (refused) return refused;

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send JSON.' }, { status: 400 });
  }
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length < 2 || name.length > 120)
    return NextResponse.json({ error: 'name must be 2–120 characters.' }, { status: 400 });
  const category = EXERCISE_CATEGORIES.find((c) => c.value === b.category)?.value as
    ExerciseCategory | undefined;
  if (!category)
    return NextResponse.json(
      { error: `category is one of ${EXERCISE_CATEGORIES.map((c) => c.value).join(', ')}.` },
      { status: 400 },
    );
  const cue = typeof b.cue === 'string' ? b.cue.trim().slice(0, 240) : '';
  const equipment = typeof b.equipment === 'string' ? b.equipment.trim().slice(0, 60) : '';
  const notes = typeof b.notes === 'string' ? b.notes.trim().slice(0, 1000) : null;

  const library = await listExercises(supabase, userId);
  const key = normaliseExerciseName(name);
  const clash = library.find((e) => normaliseExerciseName(e.name) === key);
  if (clash)
    return NextResponse.json(
      {
        error: `"${clash.name}" is already in the library.`,
        exercise: { id: clash.id, name: clash.name },
      },
      { status: 409 },
    );

  const { error } = await createExercise(supabase, userId, {
    name,
    category,
    cues: cue ? [cue] : [],
    muscleGroups: [],
    equipment,
    notes,
  });
  if (error) return NextResponse.json({ error }, { status: 500 });
  const created = (await listExercises(supabase, userId, { mineOnly: true })).find(
    (e) => normaliseExerciseName(e.name) === key,
  );
  await logAudit(supabase, {
    actorId: userId,
    action: 'exercise.created',
    entity: 'exercise',
    entityId: created?.id ?? null,
    via,
  });
  return NextResponse.json(
    { exercise: { id: created?.id ?? null, name, category, equipment: equipment || 'Bodyweight' } },
    { status: 201 },
  );
}
