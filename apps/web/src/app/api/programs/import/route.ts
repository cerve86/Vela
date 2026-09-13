import { NextResponse } from 'next/server';
import {
  assignProgram,
  categoryForDiscipline,
  createExercisesNamed,
  findClientByEmail,
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
} from '@vela/shared';
import { requireCoach } from '@/lib/apiRoute';
import { readSpreadsheet } from '@/lib/spreadsheet';
import { toWrite } from '@/lib/programImport';

/**
 * POST /api/programs/import — the same import, for scripts and other systems.
 *
 * Two bodies are accepted. `application/json` carrying the programme shape in
 * `importProgramSchema`; or `multipart/form-data` with a `file` field holding a .xlsx or
 * .csv plus optional `name`, `description` and `isTemplate` fields, which is the upload
 * form's path without the form. The file may be a movement sheet or a plan sheet (one
 * row per dated session); the headers decide. Add `?dryRun=1` to validate and resolve
 * exercise names without creating anything; `?addMissing=1` to create the exercises the
 * library lacks as the coach's own; `?assign=1` to put a plan sheet on the calendar of
 * the client it names, from its first Monday.
 *
 * Authentication is the signed-in coach: the portal's session cookie, a Supabase access
 * token, or a personal API key from Settings, the last two as `Authorization: Bearer …`.
 * Either way every write goes through row level security as that coach, which is what
 * keeps this endpoint from needing any permission logic of its own.
 *
 * Responses:
 *   201 { id, summary }                the programme exists
 *   200 { ok: true, summary }          dry run passed
 *   400 { errors: [{ row, message }] } the body or file did not validate
 *   401 { error }                      no usable session
 *   422 { error, unmatched: [...] }    exercises not in the coach's library
 */
export async function POST(req: Request) {
  const { supabase, userId, refused } = await requireCoach(req);
  if (refused) return refused;

  const query = new URL(req.url).searchParams;
  const flag = (name: string) => ['1', 'true', 'on'].includes(query.get(name) ?? '');
  const dryRun = flag('dryRun');
  const addMissing = flag('addMissing');
  const wantAssign = flag('assign');
  const contentType = req.headers.get('content-type') ?? '';
  let assignTo: { clientId: string; startDate: string } | null = null;

  let candidate: unknown;
  if (contentType.includes('multipart/form-data')) {
    const fd = await req.formData();
    const file = fd.get('file');
    if (!(file instanceof File))
      return NextResponse.json(
        { errors: [{ row: 0, message: 'A "file" field holding a .xlsx or .csv is required.' }] },
        { status: 400 },
      );

    let table;
    try {
      table = await readSpreadsheet(file);
    } catch (e) {
      return NextResponse.json(
        {
          errors: [
            { row: 0, message: e instanceof Error ? e.message : 'Could not read the file.' },
          ],
        },
        { status: 400 },
      );
    }
    const fileName = file.name.replace(/\.(xlsx|csv|txt)$/i, '');
    let name = String(fd.get('name') ?? '').trim();
    let days;
    if (detectImportFormat(table.headers) === 'plan') {
      const parsed = parsePlanRows(table.headers, table.rows);
      if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });
      days = parsed.days;
      const client = parsed.athleteEmail
        ? await findClientByEmail(supabase, parsed.athleteEmail)
        : null;
      if (!name) {
        const who = client?.name.split(' ')[0] || parsed.athleteEmail?.split('@')[0] || fileName;
        name = `${who} — ${prettyPhase(parsed.phase) ?? `from ${parsed.startDate}`}`;
      }
      if (wantAssign) {
        if (!client)
          return NextResponse.json(
            {
              error: parsed.athleteEmail
                ? `No client of yours has the email ${parsed.athleteEmail}; nothing created.`
                : 'The sheet does not say who it is for; nothing created.',
            },
            { status: 422 },
          );
        assignTo = { clientId: client.id, startDate: parsed.startDate };
      }
    } else {
      const parsed = parseProgramRows(table.headers, table.rows);
      if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });
      days = parsed.days;
    }

    candidate = {
      name: name || fileName,
      description: String(fd.get('description') ?? '').trim() || undefined,
      isTemplate: ['1', 'true', 'on'].includes(String(fd.get('isTemplate') ?? '').toLowerCase()),
      days,
    };
  } else {
    try {
      candidate = await req.json();
    } catch {
      return NextResponse.json(
        { errors: [{ row: 0, message: 'Body must be JSON, or multipart/form-data with a file.' }] },
        { status: 400 },
      );
    }
  }

  const checked = importProgramSchema.safeParse(candidate);
  if (!checked.success) {
    return NextResponse.json(
      {
        errors: checked.error.issues.map((i) => ({
          row: 0,
          message: `${i.path.join('.') || 'programme'}: ${i.message}`,
        })),
      },
      { status: 400 },
    );
  }

  const { byName, unmatched } = await resolveExerciseNames(
    supabase,
    userId,
    checked.data.days.flatMap((d) => d.items.map((i) => i.exercise)),
  );
  if (unmatched.length > 0 && !addMissing) {
    return NextResponse.json(
      { error: 'Some exercises are not in your library.', unmatched },
      { status: 422 },
    );
  }

  const summary = summariseImport(checked.data.days);
  if (dryRun) return NextResponse.json({ ok: true, summary, unmatched, assign: assignTo });

  if (unmatched.length > 0) {
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
    if (created.error) return NextResponse.json({ error: created.error }, { status: 500 });
    for (const [k, v] of created.byName) byName.set(k, v);
  }

  const { id, error } = await importProgram(supabase, userId, toWrite(checked.data, byName));
  if (error || !id)
    return NextResponse.json(
      { error: error ?? 'Could not create the programme.' },
      { status: 500 },
    );

  let assigned = false;
  if (assignTo) {
    const res = await assignProgram(supabase, id, assignTo.clientId, assignTo.startDate);
    assigned = Boolean(res.assignmentId);
    if (assigned)
      await notifyProgramAssigned(supabase, {
        clientId: assignTo.clientId,
        programName: checked.data.name,
        startDate: assignTo.startDate,
        via: 'portal',
      });
  }

  return NextResponse.json({ id, summary, created: unmatched, assigned }, { status: 201 });
}
