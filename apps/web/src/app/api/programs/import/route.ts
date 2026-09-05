import { NextResponse } from 'next/server';
import { importProgram, resolveExerciseNames } from '@vela/api';
import { importProgramSchema, parseProgramRows, summariseImport } from '@vela/shared';
import { createRequestSupabase } from '@/lib/supabase/server';
import { readSpreadsheet } from '@/lib/spreadsheet';
import { toWrite } from '@/lib/programImport';

/**
 * POST /api/programs/import — the same import, for scripts and other systems.
 *
 * Two bodies are accepted. `application/json` carrying the programme shape in
 * `importProgramSchema`; or `multipart/form-data` with a `file` field holding a .xlsx or
 * .csv plus optional `name`, `description` and `isTemplate` fields, which is the upload
 * form's path without the form. Add `?dryRun=1` to validate and resolve exercise names
 * without creating anything.
 *
 * Authentication is the signed-in coach: either the portal's session cookie, or a
 * Supabase access token as `Authorization: Bearer …`. Either way every write goes through
 * row level security as that coach, which is what keeps this endpoint from needing any
 * permission logic of its own. There is no service key and no API key here to leak.
 *
 * Responses:
 *   201 { id, summary }                the programme exists
 *   200 { ok: true, summary }          dry run passed
 *   400 { errors: [{ row, message }] } the body or file did not validate
 *   401 { error }                      no usable session
 *   422 { error, unmatched: [...] }    exercises not in the coach's library
 */
export async function POST(req: Request) {
  const supabase = await createRequestSupabase(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in, or send a Supabase access token as a Bearer header.' }, { status: 401 });

  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';
  const contentType = req.headers.get('content-type') ?? '';

  let candidate: unknown;
  if (contentType.includes('multipart/form-data')) {
    const fd = await req.formData();
    const file = fd.get('file');
    if (!(file instanceof File)) return NextResponse.json({ errors: [{ row: 0, message: 'A "file" field holding a .xlsx or .csv is required.' }] }, { status: 400 });

    let table;
    try {
      table = await readSpreadsheet(file);
    } catch (e) {
      return NextResponse.json({ errors: [{ row: 0, message: e instanceof Error ? e.message : 'Could not read the file.' }] }, { status: 400 });
    }
    const parsed = parseProgramRows(table.headers, table.rows);
    if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });

    candidate = {
      name: String(fd.get('name') ?? '').trim() || file.name.replace(/\.(xlsx|csv|txt)$/i, ''),
      description: String(fd.get('description') ?? '').trim() || undefined,
      isTemplate: ['1', 'true', 'on'].includes(String(fd.get('isTemplate') ?? '').toLowerCase()),
      days: parsed.days,
    };
  } else {
    try {
      candidate = await req.json();
    } catch {
      return NextResponse.json({ errors: [{ row: 0, message: 'Body must be JSON, or multipart/form-data with a file.' }] }, { status: 400 });
    }
  }

  const checked = importProgramSchema.safeParse(candidate);
  if (!checked.success) {
    return NextResponse.json(
      { errors: checked.error.issues.map((i) => ({ row: 0, message: `${i.path.join('.') || 'programme'}: ${i.message}` })) },
      { status: 400 },
    );
  }

  const { byName, unmatched } = await resolveExerciseNames(
    supabase,
    user.id,
    checked.data.days.flatMap((d) => d.items.map((i) => i.exercise)),
  );
  if (unmatched.length > 0) {
    return NextResponse.json({ error: 'Some exercises are not in your library.', unmatched }, { status: 422 });
  }

  const summary = summariseImport(checked.data.days);
  if (dryRun) return NextResponse.json({ ok: true, summary });

  const { id, error } = await importProgram(supabase, user.id, toWrite(checked.data, byName));
  if (error || !id) return NextResponse.json({ error: error ?? 'Could not create the programme.' }, { status: 500 });

  return NextResponse.json({ id, summary }, { status: 201 });
}
