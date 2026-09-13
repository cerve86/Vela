'use server';

import { revalidatePath } from 'next/cache';
import {
  assignProgram,
  categoryForDiscipline,
  createExercisesNamed,
  findClientByEmail,
  friendlyError,
  importProgram,
  normaliseExerciseName,
  notifyProgramAssigned,
  resolveExerciseNames,
} from '@vela/api';
import {
  detectImportFormat,
  importProgramSchema,
  parsePlanRows,
  parseProgramRows,
  prettyPhase,
  summariseImport,
  type ImportProgram,
  type ImportRowError,
} from '@vela/shared';
import { createServerSupabase } from '@/lib/supabase/server';
import { readSpreadsheet } from '@/lib/spreadsheet';
import { toWrite } from '@/lib/programImport';

export type ImportFormat = 'movements' | 'plan';

export interface PlanFacts {
  /** The athlete the sheet names, and her client row when it is one of the coach's. */
  athleteEmail: string | null;
  client: { id: string; name: string } | null;
  /** The Monday that puts every day on the date the sheet gave it. */
  startDate: string;
  restDays: number;
}

export type ImportPreview =
  | {
      ok: true;
      format: ImportFormat;
      program: ImportProgram;
      summary: ReturnType<typeof summariseImport>;
      /** Names in the file that matched nothing in her library. */
      unmatched: string[];
      /** Only for a plan sheet. */
      plan: PlanFacts | null;
    }
  | { ok: false; errors: ImportRowError[] };

export interface CommitOptions {
  /** Create the unmatched names in the library, as the coach's own, before importing. */
  addMissing: boolean;
  /** Put it on this client's calendar from this Monday, replacing what was there. */
  assign: { clientId: string; startDate: string } | null;
}

export interface CommitResult {
  ok: boolean;
  id?: string;
  assigned?: boolean;
  error?: string;
  unmatched?: string[];
}

async function ctx() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

/**
 * Reads the file and says what would be created, creating nothing.
 *
 * The preview is the point of the flow. A spreadsheet is written away from the app, and
 * the moment it meets the library is the first time anybody finds out that "SL bridge"
 * matches nothing and week 3 has no day 2. Showing that before the programme exists is
 * the difference between fixing a file and deleting a programme.
 *
 * Two shapes come through here. A movement sheet is the template; a plan sheet is one
 * row per dated session, the export a planning assistant makes for a physiotherapist,
 * and it also says who it is for and when it starts.
 */
export async function previewImportAction(formData: FormData): Promise<ImportPreview> {
  const { supabase, userId } = await ctx();
  if (!userId) return { ok: false, errors: [{ row: 0, message: 'Not signed in.' }] };

  const file = formData.get('file');
  if (!(file instanceof File))
    return { ok: false, errors: [{ row: 0, message: 'Choose a .xlsx or .csv file.' }] };

  let table: Awaited<ReturnType<typeof readSpreadsheet>>;
  try {
    table = await readSpreadsheet(file);
  } catch (e) {
    return {
      ok: false,
      errors: [{ row: 0, message: e instanceof Error ? e.message : 'Could not read the file.' }],
    };
  }

  const format = detectImportFormat(table.headers);
  const typedName = String(formData.get('name') ?? '').trim();
  const fileName = file.name.replace(/\.(xlsx|csv|txt)$/i, '');
  let days: ImportProgram['days'];
  let name = typedName || fileName;
  let plan: PlanFacts | null = null;

  if (format === 'plan') {
    const parsed = parsePlanRows(table.headers, table.rows);
    if (!parsed.ok) return parsed;
    days = parsed.days;
    const client = parsed.athleteEmail
      ? await findClientByEmail(supabase, parsed.athleteEmail)
      : null;
    plan = {
      athleteEmail: parsed.athleteEmail,
      client: client ? { id: client.id, name: client.name } : null,
      startDate: parsed.startDate,
      restDays: parsed.restDays,
    };
    if (!typedName) {
      const who = client?.name.split(' ')[0] || parsed.athleteEmail?.split('@')[0] || fileName;
      name = `${who} — ${prettyPhase(parsed.phase) ?? `from ${parsed.startDate}`}`;
    }
  } else {
    const parsed = parseProgramRows(table.headers, table.rows);
    if (!parsed.ok) return parsed;
    days = parsed.days;
  }

  const candidate = importProgramSchema.safeParse({
    name,
    description: String(formData.get('description') ?? '').trim() || undefined,
    isTemplate: formData.get('isTemplate') === 'on',
    days,
  });
  if (!candidate.success) {
    return {
      ok: false,
      errors: candidate.error.issues.map((i) => ({
        row: 0,
        message: `${i.path.join('.') || 'programme'}: ${i.message}`,
      })),
    };
  }

  const names = candidate.data.days.flatMap((d) => d.items.map((i) => i.exercise));
  const { unmatched } = await resolveExerciseNames(supabase, userId, names);

  return {
    ok: true,
    format,
    program: candidate.data,
    summary: summariseImport(candidate.data.days),
    unmatched,
    plan,
  };
}

/**
 * Creates the programme the preview described. Re-validates and re-resolves rather than
 * trusting the client's copy: the preview is a courtesy, the schema is the contract.
 *
 * Two things happen here only because the coach ticked them on the preview, having seen
 * the names and the client: unmatched exercises are made in her library, and the
 * programme is put on the client's calendar from the sheet's first Monday.
 */
export async function commitImportAction(
  program: ImportProgram,
  options: CommitOptions = { addMissing: false, assign: null },
): Promise<CommitResult> {
  const { supabase, userId } = await ctx();
  if (!userId) return { ok: false, error: 'Not signed in.' };

  const checked = importProgramSchema.safeParse(program);
  if (!checked.success)
    return { ok: false, error: checked.error.issues[0]?.message ?? 'Invalid programme.' };

  const { byName, unmatched } = await resolveExerciseNames(
    supabase,
    userId,
    checked.data.days.flatMap((d) => d.items.map((i) => i.exercise)),
  );
  if (unmatched.length > 0) {
    if (!options.addMissing)
      return { ok: false, error: 'Some exercises are not in your library.', unmatched };
    const created = await createExercisesNamed(
      supabase,
      userId,
      unmatched.map((name) => ({
        name,
        category: categoryForDiscipline(
          checked.data.days.find((d) =>
            d.items.some((i) => normaliseExerciseName(i.exercise) === normaliseExerciseName(name)),
          )?.discipline ?? 'strength',
        ),
      })),
    );
    if (created.error) return { ok: false, error: friendlyError(created.error) };
    for (const [k, v] of created.byName) byName.set(k, v);
    revalidatePath('/library');
  }

  const { id, error } = await importProgram(supabase, userId, toWrite(checked.data, byName));
  if (error || !id)
    return { ok: false, error: friendlyError(error ?? 'Could not create the programme.') };
  revalidatePath('/programs');

  if (options.assign) {
    const { clientId, startDate } = options.assign;
    const assigned = await assignProgram(supabase, id, clientId, startDate);
    if (assigned.error || !assigned.assignmentId) {
      return {
        ok: true,
        id,
        assigned: false,
        error: `The programme was created but not assigned: ${friendlyError(assigned.error ?? 'could not assign')}`,
      };
    }
    await notifyProgramAssigned(supabase, {
      clientId,
      programName: checked.data.name,
      startDate,
      via: 'portal',
    });
    revalidatePath(`/clients/${clientId}`);
    revalidatePath('/clients');
    return { ok: true, id, assigned: true };
  }

  return { ok: true, id, assigned: false };
}
