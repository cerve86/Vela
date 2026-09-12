import { NextResponse } from 'next/server';
import { listClientPlans, logAudit, mondayOf, sendMessage, upsertClientPlan } from '@vela/api';
import { requireCoach } from '@/lib/apiRoute';

/**
 * PUT /api/clients/{id}/plan — the week's plan for one client, in the coach's words.
 *
 * Body: `{ body, weekStart? }`; weekStart defaults to this week and is snapped to its
 * Monday. Saved straight to her phone, with a message in the thread saying it is there.
 * The client id comes from GET /api/clients. 200 with the plan.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, userId, via, refused } = await requireCoach(req);
  if (refused) return refused;
  const { id } = await params;

  let payload: { body?: unknown; weekStart?: unknown };
  try {
    payload = (await req.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: 'Send JSON: { body, weekStart? }.' }, { status: 400 });
  }
  const body = typeof payload.body === 'string' ? payload.body.trim() : '';
  if (!body) return NextResponse.json({ error: 'Write the plan first.' }, { status: 400 });
  const today = new Date().toISOString().slice(0, 10);
  const weekStart =
    typeof payload.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(payload.weekStart)
      ? mondayOf(payload.weekStart)
      : mondayOf(today);

  const existed = (await listClientPlans(supabase, id, 60)).some((p) => p.weekStart === weekStart);
  const { plan, error } = await upsertClientPlan(supabase, {
    coachId: userId,
    clientId: id,
    weekStart,
    body,
    via,
  });
  // A client who is not hers: the row policy refuses the write, which reads as "no such
  // client" from where she stands — there is nothing to tell apart.
  if (error && /row-level security|violates foreign key/i.test(error))
    return NextResponse.json({ error: 'No such client.' }, { status: 404 });
  if (error || !plan)
    return NextResponse.json({ error: error ?? 'No such client.' }, { status: 500 });

  await sendMessage(supabase, {
    clientId: id,
    sender: 'coach',
    via,
    body: existed
      ? `I've updated your plan for the week of ${weekStart} — it's on Today.`
      : `Your plan for the week of ${weekStart} is ready — it's on Today.`,
  });

  await logAudit(supabase, {
    actorId: userId,
    action: 'plan.sent',
    entity: 'client',
    entityId: id,
    via,
  });
  return NextResponse.json({ plan });
}
