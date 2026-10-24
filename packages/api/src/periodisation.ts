import { POWER_LADDER_TEMPLATE, type Phase } from '@vela/shared';
import type { VelaClient } from './client';

/**
 * Phases and deload weeks on programmes, the conditional deload, the power ladder, the
 * coach's evidence list, and the starter templates. The rules are in the database; these
 * are thin calls onto them.
 */

export async function setProgramPhase(
  supabase: VelaClient,
  programId: string,
  phase: Phase | null,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('programs').update({ phase }).eq('id', programId);
  return { error: error?.message ?? null };
}

export async function setDeloadWeeks(
  supabase: VelaClient,
  programId: string,
  weeks: number[],
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('programs')
    .update({ deload_weeks: [...new Set(weeks)].filter((w) => w >= 2).sort((a, b) => a - b) })
    .eq('id', programId);
  return { error: error?.message ?? null };
}

/** Asks about any deload her clients are about to reach without the load weeks done. */
export async function raiseDeloadChecks(supabase: VelaClient): Promise<number> {
  const { data } = await supabase.rpc('raise_deload_checks');
  return data ?? 0;
}

/**
 * Her answer to a deload check, from the flag's session: the first session of the
 * deload week tells which block and which week.
 */
export async function decideDeloadForSession(
  supabase: VelaClient,
  sessionId: string,
  choice: 'deload' | 'repeat',
): Promise<{ error: string | null }> {
  const { data: s } = await supabase
    .from('sessions')
    .select('assignment_id, scheduled_date, original_date')
    .eq('id', sessionId)
    .maybeSingle();
  if (!s?.assignment_id) return { error: 'That session is not part of a block.' };
  const { data: a } = await supabase
    .from('assignments')
    .select('start_date')
    .eq('id', s.assignment_id)
    .maybeSingle();
  if (!a) return { error: 'That block is gone.' };
  const day = s.original_date ?? s.scheduled_date;
  const week =
    Math.floor(
      (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${a.start_date}T00:00:00Z`)) / (7 * 86_400_000),
    ) + 1;
  const { error } = await supabase.rpc('decide_deload', {
    p_assignment: s.assignment_id,
    p_week: week,
    p_choice: choice,
  });
  return { error: error?.message ?? null };
}

export interface PowerLadder {
  level: number | null;
  log: { level: number; note: string | null; createdAt: string }[];
}

export async function getPowerLadder(supabase: VelaClient, clientId: string): Promise<PowerLadder> {
  const [{ data: c }, { data: log }] = await Promise.all([
    supabase.from('clients').select('power_level').eq('id', clientId).maybeSingle(),
    supabase
      .from('power_level_log')
      .select('level, note, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(10),
  ]);
  return {
    level: c?.power_level ?? null,
    log: (log ?? []).map((r) => ({ level: r.level, note: r.note, createdAt: r.created_at })),
  };
}

export async function setPowerLevel(
  supabase: VelaClient,
  clientId: string,
  level: number,
  note?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('set_power_level', {
    p_client: clientId,
    p_level: level,
    p_note: note ?? undefined,
  });
  return { error: error?.message ?? null };
}

export interface EvidenceRef {
  id: string;
  topic: string;
  title: string;
  authors: string | null;
  year: number | null;
  source: string | null;
  url: string | null;
  note: string | null;
}

export async function listEvidence(supabase: VelaClient): Promise<EvidenceRef[]> {
  const { data } = await supabase
    .from('evidence_refs')
    .select('id, topic, title, authors, year, source, url, note')
    .order('topic')
    .order('year', { ascending: false, nullsFirst: false });
  return (data ?? []) as EvidenceRef[];
}

export async function saveEvidence(
  supabase: VelaClient,
  coachId: string,
  r: Omit<EvidenceRef, 'id'> & { id?: string },
): Promise<{ error: string | null }> {
  const row = {
    topic: r.topic.trim(),
    title: r.title.trim(),
    authors: r.authors?.trim() || null,
    year: r.year ?? null,
    source: r.source?.trim() || null,
    url: r.url?.trim() || null,
    note: r.note?.trim() || null,
  };
  const { error } = r.id
    ? await supabase.from('evidence_refs').update(row).eq('id', r.id)
    : await supabase.from('evidence_refs').insert({ ...row, coach_id: coachId });
  return { error: error?.message ?? null };
}

export async function deleteEvidence(
  supabase: VelaClient,
  id: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('evidence_refs').delete().eq('id', id);
  return { error: error?.message ?? null };
}

export const STARTER_TEMPLATES = [
  'Power & elasticity ladder (L1–L4 reference)',
  'Build block — road half (4 wk)',
  'Build block — trail (4 wk)',
] as const;

/**
 * The three starter templates from the spec, made once: the ladder as a written
 * reference, and the two build blocks as four-week shells (phase build, week 4 a deload)
 * for the coach to fill. Nothing is assigned. Returns the names it created.
 */
export async function createStarterTemplates(
  supabase: VelaClient,
  coachId: string,
): Promise<{ created: string[]; error: string | null }> {
  const { data: existing } = await supabase
    .from('programs')
    .select('name')
    .in('name', [...STARTER_TEMPLATES])
    .is('archived_at', null);
  const have = new Set((existing ?? []).map((p) => p.name));
  const rows = [
    {
      name: STARTER_TEMPLATES[0],
      description: 'Pull-from reference for the power and elasticity stages.',
      kind: 'descriptive',
      body: POWER_LADDER_TEMPLATE,
      duration_weeks: 4,
      phase: null,
      deload_weeks: [] as number[],
    },
    {
      name: STARTER_TEMPLATES[1],
      description: 'Three progressive load weeks and a conditional deload. Add the days.',
      kind: 'structured',
      body: null,
      duration_weeks: 4,
      phase: 'build',
      deload_weeks: [4],
    },
    {
      name: STARTER_TEMPLATES[2],
      description: 'Three progressive load weeks and a conditional deload. Add the days.',
      kind: 'structured',
      body: null,
      duration_weeks: 4,
      phase: 'build',
      deload_weeks: [4],
    },
  ].filter((r) => !have.has(r.name));
  if (rows.length === 0) return { created: [], error: null };
  const { error } = await supabase
    .from('programs')
    .insert(rows.map((r) => ({ ...r, coach_id: coachId, is_template: true })));
  return { created: error ? [] : rows.map((r) => r.name), error: error?.message ?? null };
}
