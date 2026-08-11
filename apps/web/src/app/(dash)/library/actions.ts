'use server';

import { revalidatePath } from 'next/cache';
import {
  archiveExercise,
  createExercise,
  duplicateExercise,
  listExercises,
  updateExercise,
  type ExerciseCategory,
  type LibraryExercise,
} from '@vela/api';
import { createServerSupabase } from '@/lib/supabase/server';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function parseForm(formData: FormData) {
  return {
    name: String(formData.get('name') ?? ''),
    category: String(formData.get('category') ?? 'strength') as ExerciseCategory,
    // One cue per line is far quicker to type than a repeating field set, and cues are
    // inherently a short ordered list.
    cues: String(formData.get('cues') ?? '')
      .split('\n')
      .map((c) => c.trim())
      .filter(Boolean),
    muscleGroups: String(formData.get('muscleGroups') ?? '')
      .split(',')
      .map((m) => m.trim().toLowerCase().replace(/\s+/g, '_'))
      .filter(Boolean),
    equipment: String(formData.get('equipment') ?? ''),
    notes: String(formData.get('notes') ?? ''),
  };
}

export async function saveExerciseAction(formData: FormData): Promise<ActionResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const input = parseForm(formData);
  if (input.name.trim().length < 2) {
    return { ok: false, error: 'Give the exercise a name.' };
  }

  const id = String(formData.get('id') ?? '');
  const { error } = id
    ? await updateExercise(supabase, id, input)
    : await createExercise(supabase, user.id, input);

  if (error) return { ok: false, error };
  revalidatePath('/library');
  return { ok: true };
}

export async function archiveExerciseAction(id: string): Promise<ActionResult> {
  const supabase = await createServerSupabase();
  const { error } = await archiveExercise(supabase, id);
  if (error) return { ok: false, error };
  revalidatePath('/library');
  return { ok: true };
}

export async function duplicateExerciseAction(source: LibraryExercise): Promise<ActionResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { error } = await duplicateExercise(supabase, user.id, source);
  if (error) return { ok: false, error };
  revalidatePath('/library');
  return { ok: true };
}

export async function loadLibrary(opts: {
  category?: ExerciseCategory;
  search?: string;
  mineOnly?: boolean;
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return listExercises(supabase, user?.id ?? null, opts);
}
