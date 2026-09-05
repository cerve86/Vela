import { NextResponse } from 'next/server';
import { getSessionPlan, listSessions } from '@vela/api';
import { buildIcs, type IcsEvent } from '@vela/shared';
import { adminClient, clientAsUser } from '@/lib/impersonate';

/**
 * GET /api/calendar/{token}/vela.ics — a client's planned sessions as a calendar feed.
 *
 * The token in the URL is the whole credential: it resolves to her, and from there the
 * sessions and their prescriptions are read as her through RLS. Each entry carries the
 * full exercise list in its notes and a link that marks the session done without the
 * app. Two weeks back so a finished session shows as confirmed; nine weeks ahead so a
 * whole block is visible.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = adminClient();
  if (!admin || !/^[0-9a-f]{48}$/.test(token))
    return new NextResponse('Not found', { status: 404 });

  const { data: row } = await admin
    .from('calendar_tokens')
    .select('client_id, profile_id, revoked_at')
    .eq('token', token)
    .maybeSingle();
  if (!row || row.revoked_at) return new NextResponse('Not found', { status: 404 });

  const asUser = await clientAsUser(row.profile_id);
  if (!asUser) return new NextResponse('Unavailable', { status: 503 });

  const today = new Date();
  const from = new Date(today.getTime() - 14 * 86_400_000).toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 63 * 86_400_000).toISOString().slice(0, 10);
  const sessions = await listSessions(asUser, { clientId: row.client_id, from, to });
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.vela-coaching.com';

  const events: IcsEvent[] = [];
  for (const s of sessions) {
    if (s.status === 'skipped') continue;
    const plan = await getSessionPlan(asUser, s.id);
    const lines = plan.map(
      (i) =>
        `${i.block}. ${i.exerciseName} — ${i.sets} × ${i.reps}` +
        (i.targetLoadKg ? `, ${i.targetLoadKg} kg` : '') +
        (i.targetRpe ? `, RPE ${i.targetRpe}` : '') +
        (i.tempo ? `, tempo ${i.tempo}` : '') +
        `, rest ${i.restSec}s` +
        (i.notes ? ` — ${i.notes}` : ''),
    );
    const doneUrl = `${site}/done/${s.id}?t=${token}`;
    const done = s.status === 'completed';
    const description = [
      done
        ? 'Done ✓'
        : lines.length
          ? 'Your session:'
          : 'No exercises listed for this session yet.',
      ...lines,
      '',
      done ? 'Logged in Vela.' : `Done it? Mark the whole session complete here:\n${doneUrl}`,
    ].join('\n');

    events.push({
      uid: `session-${s.id}@vela-coaching.com`,
      date: s.scheduledDate,
      summary: `${done ? '✓ ' : ''}${s.title} · Vela`,
      description,
      url: done ? undefined : doneUrl,
      status: done ? 'CONFIRMED' : 'TENTATIVE',
    });
  }

  const ics = buildIcs({
    name: 'Vela — training',
    prodId: '-//Vela//Training//EN',
    refreshMinutes: 60,
    events,
  });
  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="vela.ics"',
      'Cache-Control': 'private, max-age=900',
    },
  });
}
