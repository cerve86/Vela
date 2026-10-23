import { NextResponse } from 'next/server';
import {
  assignProgram,
  getProgram,
  logAudit,
  notifyProgramAssigned,
  notifyProgramUnassigned,
  unassignProgram,
} from '@vela/api';
import { requireCoach } from '@/lib/apiRoute';
import { isIsoDate } from '@/lib/programInput';

type Ctx = { params: Promise<{ id: string }> };

/** The Monday of the week a date falls in — what the database anchors an assignment on. */
function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const shift = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - shift * 86_400_000).toISOString().slice(0, 10);
}

/**
 * POST /api/clients/{id}/assignment — put a programme on a client's calendar.
 *
 * Body: `{ programId, startDate }`. The block runs from the Monday of startDate's week
 * (day 1 = Monday); days before startDate in that week are skipped. Replaces whatever
 * programme she was on: its upcoming sessions go, completed ones stay. She gets the usual
 * message. 201 with the assignment.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { supabase, userId, via, refused } = await requireCoach(req);
  if (refused) return refused;
  const { id: clientId } = await params;

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send JSON.' }, { status: 400 });
  }
  const programId = typeof b.programId === 'string' ? b.programId : '';
  if (!programId) return NextResponse.json({ error: 'programId is required.' }, { status: 400 });
  if (!isIsoDate(b.startDate))
    return NextResponse.json({ error: 'startDate must be a date, YYYY-MM-DD.' }, { status: 400 });
  const startDate = b.startDate;

  const program = await getProgram(supabase, programId);
  if (!program) return NextResponse.json({ error: 'No such programme.' }, { status: 404 });

  const { assignmentId, error } = await assignProgram(supabase, programId, clientId, startDate);
  if (error || !assignmentId)
    return NextResponse.json(
      { error: error ?? 'Could not assign.' },
      { status: /not found/i.test(error ?? '') ? 404 : 500 },
    );

  await notifyProgramAssigned(supabase, { clientId, programName: program.name, startDate, via });
  await logAudit(supabase, {
    actorId: userId,
    action: 'program.assigned',
    entity: 'client',
    entityId: clientId,
    via,
  });
  return NextResponse.json(
    {
      assignment: {
        id: assignmentId,
        programId,
        programName: program.name,
        weekOneMonday: mondayOf(startDate),
        firstDay: startDate,
      },
    },
    { status: 201 },
  );
}

/**
 * DELETE /api/clients/{id}/assignment — take her current programme off. Upcoming
 * sessions from it go; what she completed stays. She gets the usual message.
 */
export async function DELETE(req: Request, { params }: Ctx) {
  const { supabase, userId, via, refused } = await requireCoach(req);
  if (refused) return refused;
  const { id: clientId } = await params;

  const { data: active } = await supabase
    .from('assignments')
    .select('id, program_id, programs ( name )')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .maybeSingle();
  if (!active)
    return NextResponse.json({ error: 'She has no programme assigned.' }, { status: 404 });

  const { error } = await unassignProgram(supabase, active.id);
  if (error) return NextResponse.json({ error }, { status: 500 });
  const name = (active.programs as unknown as { name: string } | null)?.name ?? 'her programme';
  await notifyProgramUnassigned(supabase, { clientId, programName: name, via });
  await logAudit(supabase, {
    actorId: userId,
    action: 'program.unassigned',
    entity: 'client',
    entityId: clientId,
    via,
  });
  return NextResponse.json({ removed: { programId: active.program_id, programName: name } });
}
