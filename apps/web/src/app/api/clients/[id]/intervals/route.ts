import { NextResponse } from 'next/server';
import { logAudit } from '@vela/api';
import { requireCoach } from '@/lib/apiRoute';
import { intervalsPushStatus, setIntervalsPush } from '@/lib/intervalsPush';

type Ctx = { params: Promise<{ id: string }> };

/** Hers, by RLS: a client of another coach reads as not found. */
async function linked(supabase: Parameters<typeof intervalsPushStatus>[0], clientId: string) {
  const { data: client } = await supabase
    .from('clients')
    .select('id, first_name_hint')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return null;
  const { data: profile } = await supabase
    .from('companion_profiles')
    .select('intervals_icu_id')
    .eq('client_id', clientId)
    .maybeSingle();
  return { firstName: client.first_name_hint, icuId: profile?.intervals_icu_id?.trim() || null };
}

/**
 * GET /api/clients/{id}/intervals — whether her sessions go to her intervals.icu
 * calendar: `{ linked, icuId, sending, onCalendar, syncedAt, error }`.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { supabase, refused } = await requireCoach(req);
  if (refused) return refused;
  const { id } = await params;
  const who = await linked(supabase, id);
  if (!who) return NextResponse.json({ error: 'No such client.' }, { status: 404 });
  const push = await intervalsPushStatus(supabase, id);
  return NextResponse.json({ linked: !!who.icuId, icuId: who.icuId, ...push });
}

/**
 * POST /api/clients/{id}/intervals — start or stop sending her sessions.
 *
 * Body: `{ send: true }` puts the next nine weeks of her Vela sessions on her intervals.icu
 * calendar now (and keeps them in step from then on); `{ send: false }` stops, and takes
 * the upcoming ones Vela made off it. 200 with what happened and where it stands; 409
 * when she isn't linked to intervals.icu, 502 when intervals.icu refused.
 */
export async function POST(req: Request, { params }: Ctx) {
  const { supabase, userId, via, refused } = await requireCoach(req);
  if (refused) return refused;
  const { id } = await params;

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Send JSON.' }, { status: 400 });
  }
  if (typeof b.send !== 'boolean')
    return NextResponse.json({ error: 'send is true or false.' }, { status: 400 });

  const who = await linked(supabase, id);
  if (!who) return NextResponse.json({ error: 'No such client.' }, { status: 404 });
  const name = who.firstName?.trim() || 'She';
  if (b.send && !who.icuId)
    return NextResponse.json(
      {
        error: `${name} isn't linked to intervals.icu yet. Link her on the Companion card of her page in the portal, once she has accepted the coach there.`,
      },
      { status: 409 },
    );

  const outcome = await setIntervalsPush(supabase, id, b.send);
  const push = await intervalsPushStatus(supabase, id);
  await logAudit(supabase, {
    actorId: userId,
    action: b.send ? 'intervals.push_on' : 'intervals.push_off',
    entity: 'client',
    entityId: id,
    via,
  });
  const failed = !['sent', 'stopped', 'busy'].includes(outcome.state);
  return NextResponse.json(
    failed && 'message' in outcome
      ? { ...push, outcome, error: outcome.message }
      : { ...push, outcome },
    { status: failed ? (outcome.state === 'unlinked' ? 409 : 502) : 200 },
  );
}
