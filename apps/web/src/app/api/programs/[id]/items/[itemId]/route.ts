import { NextResponse } from 'next/server';
import { deleteItem, getProgram, updateItem } from '@vela/api';
import { requireCoach } from '@/lib/apiRoute';

type Ctx = { params: Promise<{ id: string; itemId: string }> };

/** The item, if it is in this programme — which is also the ownership check, via RLS. */
async function find(supabase: Parameters<typeof getProgram>[0], programId: string, itemId: string) {
  const program = await getProgram(supabase, programId);
  if (!program) return { program: null, item: null };
  for (const d of program.days) {
    const item = d.items.find((i) => i.id === itemId);
    if (item) return { program, item, day: d };
  }
  return { program, item: null };
}

/**
 * PATCH /api/programs/{id}/items/{itemId} — change a prescription: any of sets, reps,
 * loadKg, rpe, tempo, restSec, notes, block. Sessions on a client's calendar read their
 * prescriptions from the programme, so the change reaches her next session.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const { supabase, refused } = await requireCoach(req);
  if (refused) return refused;
  const { id, itemId } = await params;

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send JSON.' }, { status: 400 });
  }
  const { item } = await find(supabase, id, itemId);
  if (!item)
    return NextResponse.json({ error: 'No such item in this programme.' }, { status: 404 });

  const patch: Parameters<typeof updateItem>[2] = {};
  if (b.sets !== undefined) {
    const sets = Number(b.sets);
    if (!Number.isInteger(sets) || sets < 1 || sets > 20)
      return NextResponse.json(
        { error: 'sets must be a whole number from 1 to 20.' },
        { status: 400 },
      );
    patch.sets = sets;
  }
  if (b.reps !== undefined) {
    const reps = String(b.reps).trim();
    if (!reps) return NextResponse.json({ error: 'reps cannot be empty.' }, { status: 400 });
    patch.reps = reps;
  }
  if (b.loadKg !== undefined) patch.targetLoadKg = b.loadKg === null ? null : Number(b.loadKg);
  if (b.rpe !== undefined) patch.targetRpe = b.rpe === null ? null : Number(b.rpe);
  if (b.tempo !== undefined) patch.tempo = b.tempo === null ? null : String(b.tempo).trim() || null;
  if (b.restSec !== undefined) patch.restSec = Number(b.restSec);
  if (b.notes !== undefined) patch.notes = b.notes === null ? null : String(b.notes).trim() || null;
  if (b.block !== undefined) patch.block = String(b.block).trim().toUpperCase() || 'A';
  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });

  const { error } = await updateItem(supabase, itemId, patch);
  if (error) return NextResponse.json({ error }, { status: 500 });
  const { item: after } = await find(supabase, id, itemId);
  return NextResponse.json({ item: after });
}

/** DELETE /api/programs/{id}/items/{itemId} — remove a prescription from its day. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { supabase, refused } = await requireCoach(req);
  if (refused) return refused;
  const { id, itemId } = await params;
  const { item } = await find(supabase, id, itemId);
  if (!item)
    return NextResponse.json({ error: 'No such item in this programme.' }, { status: 404 });
  const { error } = await deleteItem(supabase, itemId);
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ removed: item.exerciseName });
}
