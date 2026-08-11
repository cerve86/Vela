import type { VelaClient } from './client';

export type ExerciseCategory =
  | 'pelvic_floor'
  | 'strength'
  | 'plyometric'
  | 'running'
  | 'mobility';

export const EXERCISE_CATEGORIES: { value: ExerciseCategory; label: string }[] = [
  { value: 'pelvic_floor', label: 'Pelvic floor & core' },
  { value: 'strength', label: 'Strength' },
  { value: 'plyometric', label: 'Impact & plyometric' },
  { value: 'running', label: 'Running' },
  { value: 'mobility', label: 'Mobility' },
];

export interface LibraryExercise {
  id: string;
  /** null = shipped with Vela and read-only for the coach. */
  coachId: string | null;
  name: string;
  category: ExerciseCategory;
  cues: string[];
  muscleGroups: string[];
  equipment: string;
  videoPath: string | null;
  notes: string | null;
  /** Derived, not stored: drives whether edit and delete are offered. */
  isMine: boolean;
}

export interface ExerciseInput {
  name: string;
  category: ExerciseCategory;
  cues: string[];
  muscleGroups: string[];
  equipment: string;
  notes?: string | null;
}

/**
 * Lists the shipped library plus the coach's own, in one query.
 *
 * There is no coach_id filter here on purpose — the read policy returns exactly
 * "public rows plus mine", so the database decides visibility rather than this code.
 */
export async function listExercises(
  supabase: VelaClient,
  currentCoachId: string | null,
  opts: { category?: ExerciseCategory; search?: string; mineOnly?: boolean } = {},
): Promise<LibraryExercise[]> {
  let q = supabase
    .from('exercises')
    .select('id, coach_id, name, category, cues, muscle_groups, equipment, video_path, notes')
    .is('archived_at', null)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (opts.category) q = q.eq('category', opts.category);
  if (opts.search) q = q.ilike('name', `%${opts.search}%`);
  if (opts.mineOnly) q = q.not('coach_id', 'is', null);

  const { data } = await q;

  return (data ?? []).map((r) => ({
    id: r.id,
    coachId: r.coach_id,
    name: r.name,
    category: r.category as ExerciseCategory,
    cues: r.cues ?? [],
    muscleGroups: r.muscle_groups ?? [],
    equipment: r.equipment,
    videoPath: r.video_path,
    notes: r.notes,
    isMine: r.coach_id !== null && r.coach_id === currentCoachId,
  }));
}

export async function createExercise(
  supabase: VelaClient,
  coachId: string,
  input: ExerciseInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('exercises').insert({
    coach_id: coachId,
    name: input.name.trim(),
    category: input.category,
    cues: input.cues.filter((c) => c.trim().length > 0),
    muscle_groups: input.muscleGroups,
    equipment: input.equipment.trim() || 'Bodyweight',
    notes: input.notes?.trim() || null,
  });
  return { error: error ? friendly(error.message) : null };
}

export async function updateExercise(
  supabase: VelaClient,
  id: string,
  input: ExerciseInput,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('exercises')
    .update({
      name: input.name.trim(),
      category: input.category,
      cues: input.cues.filter((c) => c.trim().length > 0),
      muscle_groups: input.muscleGroups,
      equipment: input.equipment.trim() || 'Bodyweight',
      notes: input.notes?.trim() || null,
    })
    .eq('id', id);
  return { error: error ? friendly(error.message) : null };
}

/**
 * Archive rather than delete. A programme written six months ago still references this
 * exercise, and hard-deleting it would silently rewrite a client's training history.
 */
export async function archiveExercise(
  supabase: VelaClient,
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('exercises')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);
  return { error: error ? friendly(error.message) : null };
}

/** Duplicating a shipped exercise is how a coach customises one without editing it. */
export async function duplicateExercise(
  supabase: VelaClient,
  coachId: string,
  source: LibraryExercise,
): Promise<{ error: string | null }> {
  return createExercise(supabase, coachId, {
    name: `${source.name} (my version)`,
    category: source.category,
    cues: source.cues,
    muscleGroups: source.muscleGroups,
    equipment: source.equipment,
    notes: source.notes,
  });
}

function friendly(message: string): string {
  if (message.includes('exercises_name_per_owner')) {
    return 'You already have an exercise with that name.';
  }
  return message;
}
