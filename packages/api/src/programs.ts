import type { VelaClient } from './client';
import { listExercises } from './exercises';

export type Discipline = 'strength' | 'run' | 'mobility' | 'rehab';

export const DISCIPLINES: { value: Discipline; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'run', label: 'Run' },
  { value: 'rehab', label: 'Rehab' },
  { value: 'mobility', label: 'Mobility' },
];

export const DISCIPLINE_LABEL: Record<Discipline, string> = Object.fromEntries(
  DISCIPLINES.map((d) => [d.value, d.label]),
) as Record<Discipline, string>;

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

/**
 * Structured: weeks of days of prescriptions, put on the calendar as sessions when
 * assigned. Descriptive: a piece of text the client reads through; assigning it puts the
 * text on her phone and nothing on the calendar.
 */
export type ProgramKind = 'structured' | 'descriptive';

export interface Program {
  id: string;
  name: string;
  description: string | null;
  durationWeeks: number;
  isTemplate: boolean;
  kind: ProgramKind;
  /** The text of a descriptive programme; null for a structured one. */
  body: string | null;
  days: ProgramDay[];
}

export interface ProgramSummary {
  id: string;
  name: string;
  description: string | null;
  durationWeeks: number;
  isTemplate: boolean;
  kind: ProgramKind;
  dayCount: number;
  itemCount: number;
}

export async function listPrograms(supabase: VelaClient): Promise<ProgramSummary[]> {
  const { data } = await supabase
    .from('programs')
    .select(
      'id, name, description, duration_weeks, is_template, kind, program_days(id, program_items(id))',
    )
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
      kind: p.kind as ProgramKind,
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
      `id, name, description, duration_weeks, is_template, kind, body,
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
    kind: data.kind as ProgramKind,
    body: data.body,
    days,
  };
}

/** A descriptive programme: a name, how long it runs, and the text itself. */
export async function createDescriptiveProgram(
  supabase: VelaClient,
  coachId: string,
  input: { name: string; description?: string; durationWeeks: number; body: string },
): Promise<{ id: string | null; error: string | null }> {
  const body = input.body.trim();
  if (!body) return { id: null, error: 'Write what to do first.' };
  const { data, error } = await supabase
    .from('programs')
    .insert({
      coach_id: coachId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      duration_weeks: input.durationWeeks,
      is_template: false,
      kind: 'descriptive',
      body,
    })
    .select('id')
    .single();
  return { id: data?.id ?? null, error: error?.message ?? null };
}

export async function updateProgramBody(
  supabase: VelaClient,
  id: string,
  body: string,
): Promise<{ error: string | null }> {
  const text = body.trim();
  if (!text) return { error: 'Write what to do first.' };
  const { error } = await supabase
    .from('programs')
    .update({ body: text, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('kind', 'descriptive');
  return { error: error?.message ?? null };
}

export interface AssignedProgram {
  id: string;
  name: string;
  description: string | null;
  kind: ProgramKind;
  body: string | null;
  durationWeeks: number;
  startDate: string;
}

/**
 * The programme a client is on right now, read as her: her active assignment and the
 * programme it points at. Null between programmes. The phone uses this to show a
 * descriptive programme's text; a structured one shows as sessions and needs nothing here.
 */
export async function getAssignedProgram(
  supabase: VelaClient,
  clientId: string,
): Promise<AssignedProgram | null> {
  const { data } = await supabase
    .from('assignments')
    .select('start_date, programs ( id, name, description, kind, body, duration_weeks )')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const p = (data?.programs ?? null) as {
    id: string;
    name: string;
    description: string | null;
    kind: string;
    body: string | null;
    duration_weeks: number;
  } | null;
  if (!data || !p) return null;
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    kind: p.kind as ProgramKind,
    body: p.body,
    durationWeeks: p.duration_weeks,
    startDate: data.start_date,
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

/**
 * Remove a programme from the coach's list.
 *
 * A programme nobody was ever assigned is deleted outright, days and items with it. One
 * that has been assigned is archived instead: the assignment and the sessions already
 * on a client's calendar keep pointing at its days, so deleting it would either fail
 * (the assignment forbids it) or take a live plan off a phone. Archived, it leaves the
 * list and the API but the client's week carries on. The result says which happened.
 */
export async function deleteProgram(
  supabase: VelaClient,
  id: string,
): Promise<{ mode: 'deleted' | 'archived' | null; error: string | null }> {
  const { count, error: countError } = await supabase
    .from('assignments')
    .select('id', { count: 'exact', head: true })
    .eq('program_id', id);
  if (countError) return { mode: null, error: countError.message };

  if ((count ?? 0) > 0) {
    const { error, data } = await supabase
      .from('programs')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', id)
      .is('archived_at', null)
      .select('id');
    if (error) return { mode: null, error: error.message };
    if (!data || data.length === 0) return { mode: null, error: 'No such programme.' };
    return { mode: 'archived', error: null };
  }

  const { error, data } = await supabase.from('programs').delete().eq('id', id).select('id');
  if (error) return { mode: null, error: error.message };
  if (!data || data.length === 0) return { mode: null, error: 'No such programme.' };
  return { mode: 'deleted', error: null };
}

export interface ProgramAssignment {
  id: string;
  clientId: string;
  clientName: string;
  startDate: string;
}

/** Who is on this programme now — active assignments, with the client's name. */
export async function listAssignmentsFor(
  supabase: VelaClient,
  programId: string,
): Promise<ProgramAssignment[]> {
  const { data } = await supabase
    .from('assignments')
    .select('id, client_id, start_date, clients ( email, first_name_hint, last_name_hint )')
    .eq('program_id', programId)
    .eq('status', 'active')
    .order('start_date', { ascending: false });
  return (data ?? []).map((a) => {
    const c = (a.clients ?? null) as {
      email: string;
      first_name_hint: string | null;
      last_name_hint: string | null;
    } | null;
    return {
      id: a.id,
      clientId: a.client_id,
      clientName: c
        ? `${c.first_name_hint ?? ''} ${c.last_name_hint ?? ''}`.trim() || c.email
        : '—',
      startDate: a.start_date,
    };
  });
}

/**
 * Take a programme off a client: the assignment is cancelled and her future scheduled
 * sessions from it removed; what she completed stays. Server-side, like assigning.
 */
export async function unassignProgram(
  supabase: VelaClient,
  assignmentId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('unassign_program', { p_assignment_id: assignmentId });
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
  /** Null until she logs the session; the before/after pair is what the coach reads. */
  painBefore: number | null;
  painAfter: number | null;
  /**
   * How much of the prescription she actually ticked, and how long it took.
   *
   * Not set-by-set logs — there is still no row per set, so nothing here says which
   * movement she stopped on or what load she used. What it does say is the difference
   * between "completed" meaning nine sets and "completed" meaning three, which the status
   * alone could never carry.
   */
  setsDone: number | null;
  setsPlanned: number | null;
  durationSec: number | null;
  /** Null for a session that was never prescribed — one filed for a recorded activity. */
  programDayId: string | null;
  /** Where the completion came from. Only prescribed sessions count towards adherence. */
  loggedVia: 'app' | 'strava' | 'calendar';
  /** How hard she said it was, 1–10, when she said. */
  sessionRpe: number | null;
}

const SESSION_COLUMNS =
  'id, title, discipline, scheduled_date, status, pain_before, pain_after, sets_done, sets_planned, duration_sec, program_day_id, logged_via, session_rpe';

function toSession(row: {
  id: string;
  title: string;
  discipline: string;
  scheduled_date: string;
  status: string;
  pain_before: number | null;
  pain_after: number | null;
  sets_done: number | null;
  sets_planned: number | null;
  duration_sec: number | null;
  program_day_id: string | null;
  logged_via: string;
  session_rpe: number | string | null;
}): ScheduledSession {
  return {
    id: row.id,
    title: row.title,
    discipline: row.discipline as Discipline,
    scheduledDate: row.scheduled_date,
    status: row.status as ScheduledSession['status'],
    painBefore: row.pain_before === null ? null : Number(row.pain_before),
    painAfter: row.pain_after === null ? null : Number(row.pain_after),
    setsDone: row.sets_done === null ? null : Number(row.sets_done),
    setsPlanned: row.sets_planned === null ? null : Number(row.sets_planned),
    durationSec: row.duration_sec === null ? null : Number(row.duration_sec),
    programDayId: row.program_day_id,
    loggedVia: row.logged_via as ScheduledSession['loggedVia'],
    sessionRpe: row.session_rpe === null ? null : Number(row.session_rpe),
  };
}

/** One session by id. RLS decides whether the caller may see it, so no filter here. */
export async function getSession(
  supabase: VelaClient,
  sessionId: string,
): Promise<ScheduledSession | null> {
  const { data } = await supabase
    .from('sessions')
    .select(SESSION_COLUMNS)
    .eq('id', sessionId)
    .maybeSingle();
  return data ? toSession(data) : null;
}

export async function listSessions(
  supabase: VelaClient,
  opts: { clientId?: string; from?: string; to?: string } = {},
): Promise<ScheduledSession[]> {
  // created_at as the tie-break: two sessions on one date (a planned one and a recorded
  // activity's) must come back in a stable order, or "today's session" is a coin toss.
  let q = supabase
    .from('sessions')
    .select(SESSION_COLUMNS)
    .order('scheduled_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (opts.clientId) q = q.eq('client_id', opts.clientId);
  if (opts.from) q = q.gte('scheduled_date', opts.from);
  if (opts.to) q = q.lte('scheduled_date', opts.to);

  const { data } = await q;
  return (data ?? []).map(toSession);
}

/**
 * Creates a whole programme from a bundle of movements, in three queries.
 *
 * The existing `addDay` / `addItem` pair writes one row per call, which is right when a
 * coach is editing a single day in the builder and wrong here: a six-week block on three
 * days with five movements is 18 days and 90 items, and 108 sequential round trips is not
 * a save, it is a wait. Days first, then items keyed back to the day rows the insert
 * returned.
 *
 * Not a transaction, which is worth being straight about. If the item insert fails the
 * programme exists with empty days — visible, editable and deletable in the builder rather
 * than invisible and orphaned. Wrapping it properly needs an RPC; the failure mode here is
 * recoverable by hand, so it can wait.
 */
export async function createBundledProgram(
  supabase: VelaClient,
  coachId: string,
  input: {
    name: string;
    description?: string;
    weeks: number;
    discipline: Discipline;
    days: {
      weekNo: number;
      dayNo: number;
      title: string;
      items: {
        exerciseId: string;
        sets: number;
        reps: string;
        restSec: number;
        targetLoadKg: number | null;
        orderIndex: number;
      }[];
    }[];
  },
): Promise<{ id: string | null; error: string | null }> {
  const { id, error: programError } = await createProgram(supabase, coachId, {
    name: input.name,
    description: input.description,
    durationWeeks: input.weeks,
    isTemplate: false,
  });
  if (programError || !id)
    return { id: null, error: programError ?? 'Could not create programme.' };

  const { data: dayRows, error: dayError } = await supabase
    .from('program_days')
    .insert(
      input.days.map((d) => ({
        program_id: id,
        week_no: d.weekNo,
        day_no: d.dayNo,
        title: d.title,
        discipline: input.discipline,
      })),
    )
    .select('id, week_no, day_no');

  if (dayError) return { id, error: dayError.message };

  const dayId = new Map((dayRows ?? []).map((r) => [`${r.week_no}:${r.day_no}`, r.id]));

  const items = input.days.flatMap((d) => {
    const parent = dayId.get(`${d.weekNo}:${d.dayNo}`);
    if (!parent) return [];
    return d.items.map((i) => ({
      program_day_id: parent,
      exercise_id: i.exerciseId,
      order_index: i.orderIndex,
      sets: i.sets,
      reps: i.reps,
      rest_sec: i.restSec,
      target_load_kg: i.targetLoadKg,
    }));
  });

  if (items.length > 0) {
    const { error: itemError } = await supabase.from('program_items').insert(items);
    if (itemError) return { id, error: itemError.message };
  }

  return { id, error: null };
}

/* ─────────────────────────────────────────────────────────────
 * Importing a whole programme — from a spreadsheet or JSON
 * ───────────────────────────────────────────────────────────── */

/** Library names as a coach types them, made comparable: case, spacing and hyphens aside. */
export function normaliseExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[-–—_/]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches exercise names to library rows, the coach's own taking precedence over shipped.
 *
 * Names rather than ids because that is what a spreadsheet holds and what a script has:
 * nobody writes a programme in UUIDs. Matching is deliberately forgiving about case,
 * spacing and hyphens and deliberately strict about everything else — "Single leg bridge"
 * finds "Single-Leg Bridge", but "SL bridge" does not, because guessing which of three
 * bridges was meant is how a client ends up doing the wrong exercise.
 */
export async function resolveExerciseNames(
  supabase: VelaClient,
  coachId: string,
  names: string[],
): Promise<{ byName: Map<string, string>; unmatched: string[] }> {
  const library = await listExercises(supabase, coachId);

  const index = new Map<string, string>();
  for (const e of library) {
    const key = normaliseExerciseName(e.name);
    // A coach's own exercise shadows a shipped one of the same name: she made it on purpose.
    if (!index.has(key) || e.isMine) index.set(key, e.id);
  }

  const byName = new Map<string, string>();
  const unmatched: string[] = [];
  for (const raw of names) {
    const key = normaliseExerciseName(raw);
    const id = index.get(key);
    if (id) byName.set(key, id);
    else if (!unmatched.some((u) => normaliseExerciseName(u) === key)) unmatched.push(raw);
  }
  return { byName, unmatched };
}

export interface ImportedProgramInput {
  name: string;
  description?: string;
  isTemplate: boolean;
  days: {
    weekNo: number;
    dayNo: number;
    title: string;
    discipline: Discipline;
    items: {
      exerciseId: string;
      block: string;
      sets: number;
      reps: string;
      targetLoadKg: number | null;
      targetRpe: number | null;
      tempo: string | null;
      restSec: number;
      notes: string | null;
    }[];
  }[];
}

/**
 * Writes an imported programme in three queries: the programme, its days, its items.
 *
 * The same shape as `createBundledProgram`, with the two things an import has that a
 * bundle does not: a discipline per day rather than per programme, and the full item —
 * block, RPE, tempo, notes — rather than the bundle's four fields.
 *
 * Still not a transaction, but it cleans up after itself where the bundle does not. A
 * bundle that half-saves is something the coach was in the middle of and can see; an
 * import that half-saves is a programme she has never looked at, appearing in her list
 * with empty days. So a failed item insert deletes the programme (days cascade) and
 * reports the error, and she is back exactly where she started with the file.
 */
export async function importProgram(
  supabase: VelaClient,
  coachId: string,
  input: ImportedProgramInput,
): Promise<{ id: string | null; error: string | null }> {
  const weeks = Math.max(1, ...input.days.map((d) => d.weekNo));

  const { id, error: programError } = await createProgram(supabase, coachId, {
    name: input.name,
    description: input.description,
    durationWeeks: weeks,
    isTemplate: input.isTemplate,
  });
  if (programError || !id)
    return { id: null, error: programError ?? 'Could not create the programme.' };

  const rollBack = async (error: string) => {
    await supabase.from('programs').delete().eq('id', id);
    return { id: null, error };
  };

  const { data: dayRows, error: dayError } = await supabase
    .from('program_days')
    .insert(
      input.days.map((d) => ({
        program_id: id,
        week_no: d.weekNo,
        day_no: d.dayNo,
        title: d.title,
        discipline: d.discipline,
      })),
    )
    .select('id, week_no, day_no');
  if (dayError) return rollBack(dayError.message);

  const dayId = new Map((dayRows ?? []).map((r) => [`${r.week_no}:${r.day_no}`, r.id]));

  const items = input.days.flatMap((d) => {
    const parent = dayId.get(`${d.weekNo}:${d.dayNo}`);
    if (!parent) return [];
    return d.items.map((i, orderIndex) => ({
      program_day_id: parent,
      exercise_id: i.exerciseId,
      order_index: orderIndex,
      block: i.block,
      sets: i.sets,
      reps: i.reps,
      target_load_kg: i.targetLoadKg,
      target_rpe: i.targetRpe,
      tempo: i.tempo,
      rest_sec: i.restSec,
      notes: i.notes,
    }));
  });

  if (items.length > 0) {
    const { error: itemError } = await supabase.from('program_items').insert(items);
    if (itemError) return rollBack(itemError.message);
  }

  return { id, error: null };
}
