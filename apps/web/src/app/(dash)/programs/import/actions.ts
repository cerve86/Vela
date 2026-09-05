'use server';

import { revalidatePath } from 'next/cache';
import { importProgram, resolveExerciseNames } from '@vela/api';
import {
  importProgramSchema,
  parseProgramRows,
  summariseImport,
  type ImportProgram,
  type ImportRowError,
} from '@vela/shared';
import { createServerSupabase } from '@/lib/supabase/server';
import { readSpreadsheet } from '@/lib/spreadsheet';
import { toWrite } from '@/lib/programImport';

export type ImportPreview =
  | {
      ok: true;
      program: ImportProgram;
      summary: ReturnType<typeof summariseImport>;
      /** Names in the file that matched nothing in her library. Blocks the import. */
      unmatched: string[];
    }
  | { ok: false; errors: ImportRowError[] };

export interface CommitResult {
  ok: boolean;
  id?: string;
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
 */
export async function previewImportAction(formData: FormData): Promise<ImportPreview> {
  const { supabase, userId } = await ctx();
  if (!userId) return { ok: false, errors: [{ row: 0, message: 'Not signed in.' }] };

  const file = formData.get('file');
  if (!(file instanceof File)) return { ok: false, errors: [{ row: 0, message: 'Choose a .xlsx or .csv file.' }] };

  let table: Awaited<ReturnType<typeof readSpreadsheet>>;
  try {
    table = await readSpreadsheet(file);
  } catch (e) {
    return { ok: false, errors: [{ row: 0, message: e instanceof Error ? e.message : 'Could not read the file.' }] };
  }

  const parsed = parseProgramRows(table.headers, table.rows);
  if (!parsed.ok) return parsed;

  const name = String(formData.get('name') ?? '').trim() || file.name.replace(/\.(xlsx|csv|txt)$/i, '');
  const candidate = importProgramSchema.safeParse({
    name,
    description: String(formData.get('description') ?? '').trim() || undefined,
    isTemplate: formData.get('isTemplate') === 'on',
    days: parsed.days,
  });
  if (!candidate.success) {
    return {
      ok: false,
      errors: candidate.error.issues.map((i) => ({ row: 0, message: `${i.path.join('.') || 'programme'}: ${i.message}` })),
    };
  }

  const names = candidate.data.days.flatMap((d) => d.items.map((i) => i.exercise));
  const { unmatched } = await resolveExerciseNames(supabase, userId, names);

  return { ok: true, program: candidate.data, summary: summariseImport(candidate.data.days), unmatched };
}

/**
 * Creates the programme the preview described. Re-validates and re-resolves rather than
 * trusting the client's copy: the preview is a courtesy, the schema is the contract.
 */
export async function commitImportAction(program: ImportProgram): Promise<CommitResult> {
  const { supabase, userId } = await ctx();
  if (!userId) return { ok: false, error: 'Not signed in.' };

  const checked = importProgramSchema.safeParse(program);
  if (!checked.success) return { ok: false, error: checked.error.issues[0]?.message ?? 'Invalid programme.' };

  const { byName, unmatched } = await resolveExerciseNames(
    supabase,
    userId,
    checked.data.days.flatMap((d) => d.items.map((i) => i.exercise)),
  );
  if (unmatched.length > 0) return { ok: false, error: 'Some exercises are not in your library.', unmatched };

  const { id, error } = await importProgram(supabase, userId, toWrite(checked.data, byName));
  if (error || !id) return { ok: false, error: error ?? 'Could not create the programme.' };

  revalidatePath('/programs');
  return { ok: true, id };
}
