'use server';

import { revalidatePath } from 'next/cache';
import {
  addDay,
  addItem,
  assignProgram,
  createDescriptiveProgram,
  createProgram,
  deleteDay,
  deleteItem,
  deleteProgram,
  friendlyError,
  getProgram,
  listArchivedPrograms,
  logAudit,
  notifyProgramAssigned,
  notifyProgramEdited,
  notifyProgramUnassigned,
  restoreProgram,
  listAssignmentsFor,
  listExercises,
  listPrograms,
  unassignProgram,
  updateItem,
  updateProgramBody,
  createBundledProgram,
  type Discipline,
} from '@vela/api';
import {
  PROGRESSION_MODELS,
  planBundle,
  type BundleMovement,
  type ProgressionModel,
} from '@vela/shared';
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

/** The name, for a message to the client; null when the programme is not hers. */
async function programName(supabase: Awaited<ReturnType<typeof ctx>>['supabase'], id: string) {
  const { data } = await supabase.from('programs').select('name').eq('id', id).maybeSingle();
  return data?.name ?? null;
}

/** After any edit to a programme: tell the clients on it, once an hour at most. */
async function edited(supabase: Awaited<ReturnType<typeof ctx>>['supabase'], programId: string) {
  const name = await programName(supabase, programId);
  if (name) await notifyProgramEdited(supabase, { programId, programName: name, via: 'portal' });
}

export async function loadArchivedPrograms() {
  const { supabase } = await ctx();
  return listArchivedPrograms(supabase);
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

export async function loadAssignmentsFor(programId: string) {
  const { supabase } = await ctx();
  return listAssignmentsFor(supabase, programId);
}

export async function unassignAction(programId: string, assignmentId: string): Promise<Result> {
  const { supabase, userId } = await ctx();
  const target = (await listAssignmentsFor(supabase, programId)).find((a) => a.id === assignmentId);
  const { error } = await unassignProgram(supabase, assignmentId);
  if (error) return { ok: false, error: friendlyError(error) };
  const name = await programName(supabase, programId);
  if (target && name)
    await notifyProgramUnassigned(supabase, { clientId: target.clientId, programName: name, via: 'portal' });
  if (userId)
    await logAudit(supabase, { actorId: userId, action: 'program.unassigned', entity: 'client', entityId: target?.clientId ?? null, via: 'portal' });
  revalidatePath(`/programs/${programId}`);
  revalidatePath('/clients');
  return { ok: true };
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

  // A descriptive programme is the text and nothing else: no days to build.
  if (formData.get('kind') === 'descriptive') {
    const { id, error } = await createDescriptiveProgram(supabase, userId, {
      name,
      description: String(formData.get('description') ?? ''),
      durationWeeks: Number(formData.get('durationWeeks') ?? 4) || 4,
      body: String(formData.get('body') ?? ''),
    });
    if (error || !id) return { ok: false, error: friendlyError(error ?? 'Could not create the programme.') };
    revalidatePath('/programs');
    return { ok: true, id };
  }

  const { id, error } = await createProgram(supabase, userId, {
    name,
    description: String(formData.get('description') ?? ''),
    durationWeeks: Number(formData.get('durationWeeks') ?? 4) || 4,
    isTemplate: formData.get('isTemplate') === 'on',
  });

  if (error || !id) return { ok: false, error: friendlyError(error ?? 'Could not create the programme.') };
  revalidatePath('/programs');
  return { ok: true, id };
}

export async function addDayAction(
  programId: string,
  input: { weekNo: number; dayNo: number; title: string; discipline: Discipline },
): Promise<Result> {
  const { supabase } = await ctx();
  const { error } = await addDay(supabase, programId, input);
  if (error) return { ok: false, error: friendlyError(error) };
  await edited(supabase, programId);
  revalidatePath(`/programs/${programId}`);
  return { ok: true };
}

export async function deleteDayAction(programId: string, dayId: string): Promise<Result> {
  const { supabase } = await ctx();
  const { error } = await deleteDay(supabase, dayId);
  if (error) return { ok: false, error: friendlyError(error) };
  await edited(supabase, programId);
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
  if (error) return { ok: false, error: friendlyError(error) };
  await edited(supabase, programId);
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
  if (error) return { ok: false, error: friendlyError(error) };
  await edited(supabase, programId);
  revalidatePath(`/programs/${programId}`);
  return { ok: true };
}

export async function deleteItemAction(programId: string, id: string): Promise<Result> {
  const { supabase } = await ctx();
  const { error } = await deleteItem(supabase, id);
  if (error) return { ok: false, error: friendlyError(error) };
  await edited(supabase, programId);
  revalidatePath(`/programs/${programId}`);
  return { ok: true };
}

export async function saveProgramBodyAction(programId: string, body: string): Promise<Result> {
  const { supabase } = await ctx();
  const { error } = await updateProgramBody(supabase, programId, body);
  if (error) return { ok: false, error: friendlyError(error) };
  await edited(supabase, programId);
  revalidatePath(`/programs/${programId}`);
  return { ok: true };
}

/** Archive: it leaves the list and can be restored from the bottom of it. */
export async function deleteProgramAction(
  programId: string,
): Promise<Result & { mode?: 'archived' }> {
  const { supabase } = await ctx();
  const { mode, error } = await deleteProgram(supabase, programId);
  if (error || !mode) return { ok: false, error: friendlyError(error ?? 'Could not archive.') };
  revalidatePath('/programs');
  revalidatePath(`/programs/${programId}`);
  return { ok: true, mode };
}

export async function restoreProgramAction(programId: string): Promise<Result> {
  const { supabase } = await ctx();
  const { error } = await restoreProgram(supabase, programId);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath('/programs');
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
  if (error || !assignmentId)
    return { ok: false, error: friendlyError(error ?? 'Could not assign.') };
  const name = await programName(supabase, programId);
  if (name) await notifyProgramAssigned(supabase, { clientId, programName: name, startDate, via: 'portal' });
  revalidatePath(`/programs/${programId}`);
  revalidatePath('/clients');
  return { ok: true, id: assignmentId };
}

/**
 * The one-shot path: selected movements become a programme and, optionally, an assignment.
 *
 * This exists because the step-by-step builder is the wrong tool for the common case. A
 * coach who knows what she wants had to create a programme, add a day, add five items to
 * it, add the next day, repeat for every week, then assign — dozens of interactions to
 * express one decision. Here she picks the movements, says how many weeks and which days,
 * picks a progression, and it is done and on the client's phone.
 *
 * The builder stays. It is still the right tool for editing one day of an existing block,
 * which is what a coach does after the first week has actually happened.
 */
export async function createBundleAction(formData: FormData): Promise<Result> {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const name = String(formData.get('name') ?? '').trim();
  const weeks = Number(formData.get('weeks') ?? 6);
  const model = String(formData.get('model') ?? 'hold') as ProgressionModel;
  const discipline = String(formData.get('discipline') ?? 'strength') as Discipline;
  const days = JSON.parse(String(formData.get('days') ?? '[]')) as number[];
  const movements = JSON.parse(String(formData.get('movements') ?? '[]')) as BundleMovement[];
  const assignTo = String(formData.get('assignTo') ?? '');
  const startDate = String(formData.get('startDate') ?? '');

  if (!name) return { ok: false, error: 'Give the block a name.' };
  if (movements.length === 0) return { ok: false, error: 'Pick at least one movement.' };
  if (days.length === 0) return { ok: false, error: 'Pick at least one training day.' };

  const plan = planBundle({ movements, days, weeks, model, title: name });
  if (plan.length === 0) return { ok: false, error: 'That combination produced no sessions.' };

  const { id, error } = await createBundledProgram(supabase, user.id, {
    name,
    description: `${movements.length} movements · ${days.length} days a week · ${
      PROGRESSION_MODELS.find((m) => m.value === model)?.label ?? model
    }`,
    weeks,
    discipline,
    days: plan.map((d) => ({
      weekNo: d.weekNo,
      dayNo: d.dayNo,
      title: d.title,
      items: d.items,
    })),
  });

  if (error || !id) return { ok: false, error: friendlyError(error ?? 'Could not create the block.') };

  // Assigning is what puts it on her phone. Optional, because a coach may be building a
  // template today and deciding who gets it next week.
  if (assignTo && startDate) {
    const { error: assignError } = await assignProgram(supabase, id, assignTo, startDate);
    if (assignError) {
      // The programme is real and saved; only the assignment failed. Say which.
      return { ok: false, error: `Block saved, but assigning it failed: ${assignError}` };
    }
  }

  revalidatePath('/programs');
  revalidatePath('/clients');
  return { ok: true, id };
}
