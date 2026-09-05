import { NextResponse } from 'next/server';
import { EXERCISE_CATEGORIES, listExercises, type ExerciseCategory } from '@vela/api';
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
