import type { LibraryWorkbook } from '@vela/shared';
import type { VelaClient } from './client';
import {
  curationColumns,
  listExercises,
  type ExerciseGate,
  type LibraryExercise,
} from './exercises';
import { normaliseExerciseName } from './exerciseMatch';

/**
 * The coach's curated library: her domains, each client's priorities, the gates a client
 * has cleared, circuits, and the import of her library sheet.
 */

export interface Domain {
  code: string;
  name: string;
  purpose: string | null;
}

export async function listDomains(supabase: VelaClient): Promise<Domain[]> {
  const { data } = await supabase
    .from('exercise_domains')
    .select('code, name, purpose')
    .order('sort', { ascending: true });
  return (data ?? []).map((d) => ({ code: d.code, name: d.name, purpose: d.purpose }));
}

export interface ClientPriority {
  clientId: string;
  exerciseId: string;
  level: 'priority' | 'yes';
}

export async function listClientPriorities(
  supabase: VelaClient,
  clientId?: string,
): Promise<ClientPriority[]> {
  let q = supabase.from('client_exercise_priority').select('client_id, exercise_id, level');
  if (clientId) q = q.eq('client_id', clientId);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    clientId: r.client_id,
    exerciseId: r.exercise_id,
    level: r.level as ClientPriority['level'],
  }));
}

/** The gates the coach has cleared this client through. */
export async function saveClearedGates(
  supabase: VelaClient,
  clientId: string,
  gates: ExerciseGate[],
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('clients')
    .update({ cleared_gates: gates })
    .eq('id', clientId);
  return { error: error?.message ?? null };
}

export async function setGateOverride(
  supabase: VelaClient,
  assignmentId: string,
  gate: ExerciseGate,
  on: boolean,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_gate_override', {
    p_assignment: assignmentId,
    p_gate: gate,
    p_on: on,
  });
  return { error: error?.message ?? null };
}

/** What a client's live block holds behind gates she has not cleared, and the overrides. */
export async function gatedInBlock(
  supabase: VelaClient,
  clientId: string,
): Promise<{
  assignmentId: string | null;
  cleared: ExerciseGate[];
  overrides: ExerciseGate[];
  waiting: { name: string; gates: ExerciseGate[] }[];
}> {
  const [{ data: client }, { data: assignment }] = await Promise.all([
    supabase.from('clients').select('cleared_gates').eq('id', clientId).maybeSingle(),
    supabase
      .from('assignments')
      .select('id, program_id, gate_overrides')
      .eq('client_id', clientId)
      .eq('status', 'active')
      .maybeSingle(),
  ]);
  const cleared = (client?.cleared_gates ?? []) as ExerciseGate[];
  if (!assignment) return { assignmentId: null, cleared, overrides: [], waiting: [] };
  const overrides = (assignment.gate_overrides ?? []) as ExerciseGate[];
  const { data: items } = await supabase
    .from('program_items')
    .select('exercises ( name, gates ), program_days!inner ( program_id )')
    .eq('program_days.program_id', assignment.program_id);
  const open = new Set<string>([...cleared, ...overrides]);
  const seen = new Set<string>();
  const waiting: { name: string; gates: ExerciseGate[] }[] = [];
  for (const it of items ?? []) {
    const e = it.exercises as unknown as { name: string; gates: ExerciseGate[] } | null;
    if (!e || seen.has(e.name)) continue;
    const closed = (e.gates ?? []).filter((g) => !open.has(g));
    if (closed.length) {
      seen.add(e.name);
      waiting.push({ name: e.name, gates: closed });
    }
  }
  return { assignmentId: assignment.id, cleared, overrides, waiting };
}

/** A named circuit, prescribed as one item: its movements, each with a dose. */
export async function saveCircuit(
  supabase: VelaClient,
  coachId: string,
  input: {
    id?: string;
    name: string;
    items: { exerciseId: string; dose: string | null }[];
    why?: string | null;
    videoUrl?: string | null;
    videoSource?: 'own' | 'stock' | null;
  },
): Promise<{ error: string | null }> {
  const row = {
    name: input.name.trim(),
    category: 'strength' as const,
    kind: 'block',
    selected: true,
    equipment: 'Mixed',
    block_items: input.items.map((i) => ({ exercise_id: i.exerciseId, dose: i.dose })),
    ...curationColumns({
      why: input.why ?? null,
      videoUrl: input.videoUrl ?? null,
      videoSource: input.videoSource ?? null,
    }),
  };
  const { error } = input.id
    ? await supabase.from('exercises').update(row).eq('id', input.id)
    : await supabase.from('exercises').insert({ ...row, coach_id: coachId });
  return { error: error?.message ?? null };
}

export interface LibraryImportSummary {
  created: string[];
  updated: string[];
  selected: number;
  domains: number;
  priorities: number;
  clientsMatched: string[];
  clientsUnmatched: string[];
  warnings: string[];
}

/**
 * Applies a parsed library sheet to the coach's library. A movement is found by its code
 * among her own, then by name among her own; otherwise it is created as hers. Shipped
 * exercises are never edited. Priorities replace what each named client had for the
 * movements on the sheet. With `dryRun`, nothing is written and the summary says what
 * would be.
 */
export async function applyLibraryWorkbook(
  supabase: VelaClient,
  coachId: string,
  w: LibraryWorkbook,
  opts: { dryRun: boolean },
): Promise<LibraryImportSummary> {
  const library = await listExercises(supabase, coachId);
  const mine = library.filter((e) => e.isMine);
  const byCode = new Map(mine.filter((e) => e.code).map((e) => [e.code!, e]));
  const byName = new Map(mine.map((e) => [normaliseExerciseName(e.name), e]));
  const selection = w.selection ? new Set(w.selection) : null;

  const created: string[] = [];
  const updated: string[] = [];
  const ids = new Map<string, string>();

  for (const m of w.movements) {
    const existing: LibraryExercise | undefined =
      byCode.get(m.code) ?? byName.get(normaliseExerciseName(m.name));
    const curation = curationColumns({
      code: m.code,
      domain: m.domain,
      movementType: m.type,
      dose: m.dose,
      loadRule: m.loadRule,
      ladder: m.ladder,
      regression: m.regression,
      why: m.why,
      ...(m.watchFor ? { watchFor: m.watchFor } : {}),
      ...(m.phases.length ? { phases: m.phases } : {}),
      ...(m.gates.length ? { gates: m.gates } : {}),
      selected: selection ? selection.has(m.code) : true,
    });
    if (existing) {
      updated.push(`${m.code} ${m.name}`);
      ids.set(m.code, existing.id);
      if (!opts.dryRun) {
        await supabase
          .from('exercises')
          .update({
            name: m.name,
            ...(m.type ? { category: m.category } : {}),
            ...(m.equipment ? { equipment: m.equipment } : {}),
            ...curation,
          })
          .eq('id', existing.id);
      }
    } else {
      created.push(`${m.code} ${m.name}`);
      if (!opts.dryRun) {
        const { data } = await supabase
          .from('exercises')
          .insert({
            coach_id: coachId,
            name: m.name,
            category: m.category,
            cues: [],
            muscle_groups: [],
            equipment: m.equipment ?? 'Bodyweight',
            ...curation,
          })
          .select('id')
          .single();
        if (data) ids.set(m.code, data.id);
      }
    }
  }

  if (!opts.dryRun && w.domains.length) {
    await supabase.from('exercise_domains').upsert(
      w.domains.map((d, i) => ({
        coach_id: coachId,
        code: d.code,
        name: d.name,
        purpose: d.purpose,
        sort: i,
      })),
      { onConflict: 'coach_id,code' },
    );
  }

  // Clients named on the Assignment tab, by first name among hers.
  const names = [...new Set(w.priorities.map((p) => p.clientName))];
  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name_hint, status')
    .neq('status', 'archived');
  const clientId = new Map<string, string>();
  for (const n of names) {
    const hits = (clients ?? []).filter(
      (c) => (c.first_name_hint ?? '').trim().toLowerCase() === n.trim().toLowerCase(),
    );
    if (hits.length === 1) clientId.set(n, hits[0]!.id);
  }

  let priorities = 0;
  for (const n of clientId.keys()) {
    const rows = w.priorities
      .filter((p) => p.clientName === n && ids.has(p.code))
      .map((p) => ({ client_id: clientId.get(n)!, exercise_id: ids.get(p.code)!, level: p.level }));
    priorities += opts.dryRun ? w.priorities.filter((p) => p.clientName === n).length : rows.length;
    if (!opts.dryRun) {
      await supabase
        .from('client_exercise_priority')
        .delete()
        .eq('client_id', clientId.get(n)!)
        .in('exercise_id', [...ids.values()]);
      if (rows.length) await supabase.from('client_exercise_priority').insert(rows);
    }
  }

  return {
    created,
    updated,
    selected: w.movements.filter((m) => (selection ? selection.has(m.code) : true)).length,
    domains: w.domains.length,
    priorities,
    clientsMatched: [...clientId.keys()],
    clientsUnmatched: names.filter((n) => !clientId.has(n)),
    warnings: w.warnings,
  };
}
