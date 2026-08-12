'use server';

import { revalidatePath } from 'next/cache';
import {
  addDay,
  addItem,
  assignProgram,
  createProgram,
  deleteDay,
  deleteItem,
  getProgram,
  listExercises,
  listPrograms,
  updateItem,
  type Discipline,
} from '@vela/api';
import { createServerSupabase } from '@/lib/supabase/server';

export interface Result {
  ok: boolean;
  error?: string;
  id?: string;
}

async function ctx() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

export async function loadPrograms() {
  const { supabase } = await ctx();
  return listPrograms(supabase);
}

export async function loadProgram(id: string) {
  const { supabase } = await ctx();
  return getProgram(supabase, id);
}

export async function loadLibraryForPicker() {
  const { supabase, userId } = await ctx();
  return listExercises(supabase, userId);
}

export async function loadAssignableClients() {
  const { supabase } = await ctx();
  const { data } = await supabase
    .from('clients')
    .select('id, email, first_name_hint, last_name_hint, weeks_postpartum')
    .eq('status', 'active')
    .order('first_name_hint', { ascending: true });
  return (data ?? []).map((c) => ({
    id: c.id,
    name: `${c.first_name_hint ?? ''} ${c.last_name_hint ?? ''}`.trim() || c.email,
  }));
}

export async function createProgramAction(formData: FormData): Promise<Result> {
  const { supabase, userId } = await ctx();
  if (!userId) return { ok: false, error: 'Not signed in.' };

  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2) return { ok: false, error: 'Give the programme a name.' };

  const { id, error } = await createProgram(supabase, userId, {
    name,
    description: String(formData.get('description') ?? ''),
    durationWeeks: Number(formData.get('durationWeeks') ?? 4) || 4,
    isTemplate: formData.get('isTemplate') === 'on',
  });

  if (error || !id) return { ok: false, error: error ?? 'Could not create the programme.' };
  revalidatePath('/programs');
  return { ok: true, id };
}

export async function addDayAction(
  programId: string,
  input: { weekNo: number; dayNo: number; title: string; discipline: Discipline },
): Promise<Result> {
  const { supabase } = await ctx();
  const { error } = await addDay(supabase, programId, input);
  if (error) return { ok: false, error };
  revalidatePath(`/programs/${programId}`);
  return { ok: true };
}

export async function deleteDayAction(programId: string, dayId: string): Promise<Result> {
  const { supabase } = await ctx();
  const { error } = await deleteDay(supabase, dayId);
  if (error) return { ok: false, error };
  revalidatePath(`/programs/${programId}`);
  return { ok: true };
}

export async function addItemAction(
  programId: string,
  dayId: string,
  exerciseId: string,
  orderIndex: number,
): Promise<Result> {
  const { supabase } = await ctx();
  const { error } = await addItem(supabase, dayId, exerciseId, orderIndex);
  if (error) return { ok: false, error };
  revalidatePath(`/programs/${programId}`);
  return { ok: true };
}

export async function updateItemAction(
  programId: string,
  id: string,
  patch: Parameters<typeof updateItem>[2],
): Promise<Result> {
  const { supabase } = await ctx();
  const { error } = await updateItem(supabase, id, patch);
  if (error) return { ok: false, error };
  revalidatePath(`/programs/${programId}`);
  return { ok: true };
}

export async function deleteItemAction(programId: string, id: string): Promise<Result> {
  const { supabase } = await ctx();
  const { error } = await deleteItem(supabase, id);
  if (error) return { ok: false, error };
  revalidatePath(`/programs/${programId}`);
  return { ok: true };
}

export async function assignProgramAction(
  programId: string,
  clientId: string,
  startDate: string,
): Promise<Result> {
  const { supabase } = await ctx();
  const { assignmentId, error } = await assignProgram(supabase, programId, clientId, startDate);
  if (error || !assignmentId) return { ok: false, error: error ?? 'Could not assign.' };
  revalidatePath(`/programs/${programId}`);
  revalidatePath('/clients');
  return { ok: true, id: assignmentId };
}
