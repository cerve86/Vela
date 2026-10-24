'use server';

import { revalidatePath } from 'next/cache';
import {
  applyLibraryWorkbook,
  archiveExercise,
  createExercise,
  duplicateExercise,
  listExercises,
  saveCircuit,
  updateExercise,
  type ExerciseCategory,
  type ExerciseGate,
  type LibraryExercise,
  type LibraryImportSummary,
} from '@vela/api';
import { parseLibraryWorkbook } from '@vela/shared';
import { createServerSupabase } from '@/lib/supabase/server';
import { readWorkbook } from '@/lib/spreadsheet';

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
    // The curation fields are only on the form for her own movements; absent means unchanged.
    ...(formData.has('curation')
      ? {
          code: String(formData.get('code') ?? ''),
          domain: String(formData.get('domain') ?? ''),
          movementType: String(formData.get('movementType') ?? ''),
          phases: String(formData.get('phases') ?? '').split(','),
          dose: String(formData.get('dose') ?? ''),
          loadRule: String(formData.get('loadRule') ?? ''),
          ladder: ['l1', 'l2', 'l3', 'l4'].map((k) => String(formData.get(k) ?? '')),
          regression: String(formData.get('regression') ?? ''),
          why: String(formData.get('why') ?? ''),
          watchFor: String(formData.get('watchFor') ?? ''),
          gates: formData.getAll('gates').map(String) as ExerciseGate[],
          videoSource: (String(formData.get('videoSource') ?? '') || null) as
            'own' | 'stock' | null,
          videoUrl: String(formData.get('videoUrl') ?? ''),
          selected: formData.get('selected') === 'on',
        }
      : {}),
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

/** Puts one of her own movements in or out of her curated library. */
export async function setSelectedAction(id: string, selected: boolean): Promise<ActionResult> {
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('exercises').update({ selected }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/library');
  return { ok: true };
}

export interface ImportResult extends ActionResult {
  summary?: LibraryImportSummary;
}

/**
 * Reads her library workbook (Library, Domains, Assignment and, when there is one, a
 * Vela selection tab) and applies it. `dryRun` previews without writing.
 */
export async function importLibraryAction(formData: FormData): Promise<ImportResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, error: 'Choose the workbook first.' };
  let sheets;
  try {
    sheets = await readWorkbook(file);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not read that file.' };
  }
  const workbook = parseLibraryWorkbook(sheets);
  if (workbook.movements.length === 0)
    return { ok: false, error: workbook.warnings[0] ?? 'No movements found.' };
  const summary = await applyLibraryWorkbook(supabase, user.id, workbook, {
    dryRun: formData.get('dryRun') === '1',
  });
  if (formData.get('dryRun') !== '1') revalidatePath('/library');
  return { ok: true, summary };
}

/** A named circuit from movements in her library, each with its dose. */
export async function saveCircuitAction(input: {
  name: string;
  items: { exerciseId: string; dose: string | null }[];
  why?: string | null;
}): Promise<ActionResult> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  if (input.name.trim().length < 2) return { ok: false, error: 'Give the circuit a name.' };
  if (input.items.length < 2) return { ok: false, error: 'A circuit needs two movements or more.' };
  const { error } = await saveCircuit(supabase, user.id, input);
  if (error) return { ok: false, error };
  revalidatePath('/library');
  return { ok: true };
}
