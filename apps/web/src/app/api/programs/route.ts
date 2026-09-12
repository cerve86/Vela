import { NextResponse } from 'next/server';
import { createDescriptiveProgram, listPrograms, logAudit } from '@vela/api';
import { requireCoach } from '@/lib/apiRoute';

/** GET /api/programs — the coach's programmes and templates, newest first. */
export async function GET(req: Request) {
  const { supabase, refused } = await requireCoach(req);
  if (refused) return refused;

  const programs = await listPrograms(supabase);
  return NextResponse.json({ programs });
}

/**
 * POST /api/programs — a descriptive programme: a name, weeks, and the text itself.
 *
 * The structured kind goes through /api/programs/import, which validates days and
 * matches exercises. This one has nothing to validate but the text being there.
 * 201 with the id and its link.
 */
export async function POST(req: Request) {
  const { supabase, userId, via, refused } = await requireCoach(req);
  if (refused) return refused;

  let payload: { name?: unknown; weeks?: unknown; description?: unknown; body?: unknown };
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Send JSON: { name, weeks, body }.' }, { status: 400 });
  }
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  const weeks = Number(payload.weeks ?? 4);
  if (name.length < 2)
    return NextResponse.json({ error: 'Give the programme a name.' }, { status: 400 });
  if (!body)
    return NextResponse.json(
      { error: 'The body is the programme; write what to do.' },
      { status: 400 },
    );
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52)
    return NextResponse.json(
      { error: 'weeks must be a whole number from 1 to 52.' },
      { status: 400 },
    );

  const { id, error } = await createDescriptiveProgram(supabase, userId, {
    name,
    description: typeof payload.description === 'string' ? payload.description : undefined,
    durationWeeks: weeks,
    body,
  });
  if (error || !id)
    return NextResponse.json({ error: error ?? 'Could not create.' }, { status: 500 });
  await logAudit(supabase, {
    actorId: userId,
    action: 'program.created',
    entity: 'program',
    entityId: id,
    via,
  });
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.vela-coaching.com';
  return NextResponse.json({ id, url: `${site}/programs/${id}` }, { status: 201 });
}
