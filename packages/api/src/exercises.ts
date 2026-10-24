import type { VelaClient } from './client';

export type ExerciseCategory = 'pelvic_floor' | 'strength' | 'plyometric' | 'running' | 'mobility';

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
  /** The coach's code for it, "FA1", from her library sheet. */
  code: string | null;
  domain: string | null;
  movementType: string | null;
  phases: string[];
  dose: string | null;
  loadRule: string | null;
  /** L1–L4. */
  ladder: string[];
  regression: string | null;
  why: string | null;
  watchFor: string | null;
  gates: ExerciseGate[];
  videoSource: 'own' | 'stock' | null;
  videoUrl: string | null;
  /** In her curated library, as opposed to the wider catalogue. */
  selected: boolean;
  kind: 'movement' | 'block';
  blockItems: { exerciseId: string; dose: string | null }[];
}

export type ExerciseGate = 'pelvic_floor' | 'shin';

export const GATE_LABEL: Record<ExerciseGate, string> = {
  pelvic_floor: 'Pelvic-floor gate',
  shin: 'Shin gate',
};

/** What a coach can set about a movement beyond its name and category. */
export interface ExerciseCuration {
  code?: string | null;
  domain?: string | null;
  movementType?: string | null;
  phases?: string[];
  dose?: string | null;
  loadRule?: string | null;
  ladder?: string[];
  regression?: string | null;
  why?: string | null;
  watchFor?: string | null;
  gates?: ExerciseGate[];
  videoSource?: 'own' | 'stock' | null;
  videoUrl?: string | null;
  selected?: boolean;
}

export interface ExerciseInput extends ExerciseCuration {
  name: string;
  category: ExerciseCategory;
  cues: string[];
  muscleGroups: string[];
  equipment: string;
  notes?: string | null;
}

const CURATION_COLUMNS =
  'code, domain, movement_type, phases, dose, load_rule, ladder, regression, why, watch_for, gates, video_source, video_url, selected, kind, block_items';

const blank = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);

/** The curation fields as columns, only those the input sets. */
export function curationColumns(c: ExerciseCuration) {
  const out: Record<string, unknown> = {};
  if (c.code !== undefined) out.code = blank(c.code)?.toUpperCase() ?? null;
  if (c.domain !== undefined) out.domain = blank(c.domain);
  if (c.movementType !== undefined) out.movement_type = blank(c.movementType);
  if (c.phases !== undefined)
    out.phases = c.phases.map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (c.dose !== undefined) out.dose = blank(c.dose);
  if (c.loadRule !== undefined) out.load_rule = blank(c.loadRule);
  if (c.ladder !== undefined)
    out.ladder = c.ladder
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 4);
  if (c.regression !== undefined) out.regression = blank(c.regression);
  if (c.why !== undefined) out.why = blank(c.why);
  if (c.watchFor !== undefined) out.watch_for = blank(c.watchFor);
  if (c.gates !== undefined) out.gates = c.gates;
  if (c.videoSource !== undefined) out.video_source = c.videoSource;
  if (c.videoUrl !== undefined) out.video_url = blank(c.videoUrl);
  if (c.selected !== undefined) out.selected = c.selected;
  return out;
}

export function toLibraryExercise(
  r: Record<string, unknown>,
  currentCoachId: string | null,
): LibraryExercise {
  return {
    id: r.id as string,
    coachId: (r.coach_id as string | null) ?? null,
    name: r.name as string,
    category: r.category as ExerciseCategory,
    cues: (r.cues as string[]) ?? [],
    muscleGroups: (r.muscle_groups as string[]) ?? [],
    equipment: r.equipment as string,
    videoPath: (r.video_path as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    isMine: r.coach_id !== null && r.coach_id === currentCoachId,
    code: (r.code as string | null) ?? null,
    domain: (r.domain as string | null) ?? null,
    movementType: (r.movement_type as string | null) ?? null,
    phases: (r.phases as string[]) ?? [],
    dose: (r.dose as string | null) ?? null,
    loadRule: (r.load_rule as string | null) ?? null,
    ladder: (r.ladder as string[]) ?? [],
    regression: (r.regression as string | null) ?? null,
    why: (r.why as string | null) ?? null,
    watchFor: (r.watch_for as string | null) ?? null,
    gates: (r.gates as ExerciseGate[]) ?? [],
    videoSource: (r.video_source as 'own' | 'stock' | null) ?? null,
    videoUrl: (r.video_url as string | null) ?? null,
    selected: r.selected === true,
    kind: r.kind === 'block' ? 'block' : 'movement',
    blockItems: ((r.block_items as { exercise_id: string; dose: string | null }[]) ?? []).map(
      (b) => ({ exerciseId: b.exercise_id, dose: b.dose ?? null }),
    ),
  };
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
    .select(
      `id, coach_id, name, category, cues, muscle_groups, equipment, video_path, notes, ${CURATION_COLUMNS}`,
    )
    .is('archived_at', null)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (opts.category) q = q.eq('category', opts.category);
  if (opts.search) q = q.ilike('name', `%${opts.search}%`);
  if (opts.mineOnly) q = q.not('coach_id', 'is', null);

  const { data } = await q;
  return (data ?? []).map((r) => toLibraryExercise(r as Record<string, unknown>, currentCoachId));
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
    ...curationColumns(input),
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
      ...curationColumns(input),
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
    code: null,
    domain: source.domain,
    movementType: source.movementType,
    phases: source.phases,
    dose: source.dose,
    loadRule: source.loadRule,
    ladder: source.ladder,
    regression: source.regression,
    why: source.why,
    watchFor: source.watchFor,
    gates: source.gates,
    videoSource: source.videoSource,
    videoUrl: source.videoUrl,
    selected: source.selected,
  });
}

function friendly(message: string): string {
  if (message.includes('exercises_name_per_owner')) {
    return 'You already have an exercise with that name.';
  }
  if (message.includes('exercises_code_per_owner')) {
    return 'You already have a movement with that code.';
  }
  return message;
}
