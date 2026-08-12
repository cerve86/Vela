import type { VelaClient } from './client';

export type Discipline = 'strength' | 'run' | 'mobility' | 'rehab';

export const DISCIPLINES: { value: Discipline; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'run', label: 'Run' },
  { value: 'rehab', label: 'Rehab' },
  { value: 'mobility', label: 'Mobility' },
];

export interface ProgramItem {
  id: string;
  exerciseId: string;
  exerciseName: string;
  orderIndex: number;
  block: string;
  sets: number;
  reps: string;
  targetLoadKg: number | null;
  targetRpe: number | null;
  tempo: string | null;
  restSec: number;
  notes: string | null;
}

export interface ProgramDay {
  id: string;
  weekNo: number;
  dayNo: number;
  title: string;
  discipline: Discipline;
  notes: string | null;
  items: ProgramItem[];
}

export interface Program {
  id: string;
  name: string;
  description: string | null;
  durationWeeks: number;
  isTemplate: boolean;
  days: ProgramDay[];
}

export interface ProgramSummary {
  id: string;
  name: string;
  description: string | null;
  durationWeeks: number;
  isTemplate: boolean;
  dayCount: number;
  itemCount: number;
}

export async function listPrograms(supabase: VelaClient): Promise<ProgramSummary[]> {
  const { data } = await supabase
    .from('programs')
    .select('id, name, description, duration_weeks, is_template, program_days(id, program_items(id))')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  return (data ?? []).map((p) => {
    const days = (p.program_days ?? []) as { id: string; program_items: { id: string }[] }[];
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      durationWeeks: p.duration_weeks,
      isTemplate: p.is_template,
      dayCount: days.length,
      itemCount: days.reduce((n, d) => n + (d.program_items?.length ?? 0), 0),
    };
  });
}

/** One round trip for the whole programme — the builder needs all of it at once. */
export async function getProgram(supabase: VelaClient, id: string): Promise<Program | null> {
  const { data } = await supabase
    .from('programs')
    .select(
      `id, name, description, duration_weeks, is_template,
       program_days (
         id, week_no, day_no, title, discipline, notes,
         program_items (
           id, exercise_id, order_index, block, sets, reps,
           target_load_kg, target_rpe, tempo, rest_sec, notes,
           exercises ( name )
         )
       )`,
    )
    .eq('id', id)
    .maybeSingle();

  if (!data) return null;

  const days = ((data.program_days ?? []) as unknown[])
    .map((raw) => {
      const d = raw as {
        id: string;
        week_no: number;
        day_no: number;
        title: string;
        discipline: Discipline;
        notes: string | null;
        program_items: unknown[];
      };
      const items = (d.program_items ?? [])
        .map((rawItem) => {
          const i = rawItem as {
            id: string;
            exercise_id: string;
            order_index: number;
            block: string;
            sets: number;
            reps: string;
            target_load_kg: number | null;
            target_rpe: number | null;
            tempo: string | null;
            rest_sec: number;
            notes: string | null;
            exercises: { name: string } | null;
          };
          return {
            id: i.id,
            exerciseId: i.exercise_id,
            exerciseName: i.exercises?.name ?? 'Unknown exercise',
            orderIndex: i.order_index,
            block: i.block,
            sets: i.sets,
            reps: i.reps,
            targetLoadKg: i.target_load_kg,
            targetRpe: i.target_rpe,
            tempo: i.tempo,
            restSec: i.rest_sec,
            notes: i.notes,
          };
        })
        .sort((a, b) => a.orderIndex - b.orderIndex || a.block.localeCompare(b.block));

      return {
        id: d.id,
        weekNo: d.week_no,
        dayNo: d.day_no,
        title: d.title,
        discipline: d.discipline,
        notes: d.notes,
        items,
      };
    })
    .sort((a, b) => a.weekNo - b.weekNo || a.dayNo - b.dayNo);

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    durationWeeks: data.duration_weeks,
    isTemplate: data.is_template,
    days,
  };
}

export async function createProgram(
  supabase: VelaClient,
  coachId: string,
  input: { name: string; description?: string; durationWeeks: number; isTemplate: boolean },
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('programs')
    .insert({
      coach_id: coachId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      duration_weeks: input.durationWeeks,
      is_template: input.isTemplate,
    })
    .select('id')
    .single();

  return { id: data?.id ?? null, error: error?.message ?? null };
}

export async function addDay(
  supabase: VelaClient,
  programId: string,
  input: { weekNo: number; dayNo: number; title: string; discipline: Discipline },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('program_days').insert({
    program_id: programId,
    week_no: input.weekNo,
    day_no: input.dayNo,
    title: input.title.trim() || 'Session',
    discipline: input.discipline,
  });
  return {
    error: error
      ? error.message.includes('program_days_program_id_week_no_day_no_key')
        ? `Week ${input.weekNo} already has a day ${input.dayNo}.`
        : error.message
      : null,
  };
}

export async function deleteDay(supabase: VelaClient, dayId: string) {
  const { error } = await supabase.from('program_days').delete().eq('id', dayId);
  return { error: error?.message ?? null };
}

export async function addItem(
  supabase: VelaClient,
  dayId: string,
  exerciseId: string,
  orderIndex: number,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('program_items').insert({
    program_day_id: dayId,
    exercise_id: exerciseId,
    order_index: orderIndex,
  });
  return { error: error?.message ?? null };
}

export async function updateItem(
  supabase: VelaClient,
  id: string,
  patch: {
    block?: string;
    sets?: number;
    reps?: string;
    targetLoadKg?: number | null;
    targetRpe?: number | null;
    tempo?: string | null;
    restSec?: number;
    notes?: string | null;
    orderIndex?: number;
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('program_items')
    .update({
      block: patch.block,
      sets: patch.sets,
      reps: patch.reps,
      target_load_kg: patch.targetLoadKg,
      target_rpe: patch.targetRpe,
      tempo: patch.tempo,
      rest_sec: patch.restSec,
      notes: patch.notes,
      order_index: patch.orderIndex,
    })
    .eq('id', id);
  return { error: error?.message ?? null };
}

export async function deleteItem(supabase: VelaClient, id: string) {
  const { error } = await supabase.from('program_items').delete().eq('id', id);
  return { error: error?.message ?? null };
}

/** Returns the new assignment id. Generates the scheduled sessions server-side. */
export async function assignProgram(
  supabase: VelaClient,
  programId: string,
  clientId: string,
  startDate: string,
): Promise<{ assignmentId: string | null; error: string | null }> {
  const { data, error } = await supabase.rpc('assign_program', {
    p_program_id: programId,
    p_client_id: clientId,
    p_start_date: startDate,
  });
  return { assignmentId: (data as string) ?? null, error: error?.message ?? null };
}

export interface ScheduledSession {
  id: string;
  title: string;
  discipline: Discipline;
  scheduledDate: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'skipped';
}

export async function listSessions(
  supabase: VelaClient,
  opts: { clientId?: string; from?: string; to?: string } = {},
): Promise<ScheduledSession[]> {
  let q = supabase
    .from('sessions')
    .select('id, title, discipline, scheduled_date, status')
    .order('scheduled_date', { ascending: true });

  if (opts.clientId) q = q.eq('client_id', opts.clientId);
  if (opts.from) q = q.gte('scheduled_date', opts.from);
  if (opts.to) q = q.lte('scheduled_date', opts.to);

  const { data } = await q;
  return (data ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    discipline: s.discipline as Discipline,
    scheduledDate: s.scheduled_date,
    status: s.status as ScheduledSession['status'],
  }));
}
