import { NextResponse } from 'next/server';
import { FLAG_LABEL, type FlagKind } from '@vela/api';
import { clientIdFor, notAClient, requireUser } from '@/lib/apiRoute';
import { emailConfigured, sendEmail } from '@/lib/email';
import { adminClient } from '@/lib/impersonate';

/**
 * POST /api/flags/notify — called by the client's app after it writes a session, to get
 * any flag that write raised in front of her coach.
 *
 * The flags themselves were raised by the database; this route only emails. It acts on
 * the caller's own client row, reads the open flags no email has gone out for, and sends
 * the coach one message listing them. The client learns nothing from the answer: it says
 * how many emails went, never what they said. Without email configured, nothing is marked
 * sent, so the coach still sees every flag in the portal and a later call can send them.
 */
export async function POST(req: Request) {
  const { supabase, userId, refused } = await requireUser(req);
  if (refused) return refused;
  const clientId = await clientIdFor(supabase, userId);
  if (!clientId) return notAClient('notify a coach');
  if (!emailConfigured()) return NextResponse.json({ emailed: 0 });

  const admin = adminClient();
  if (!admin) return NextResponse.json({ emailed: 0 });

  const { data: flags } = await admin
    .from('coach_flags')
    .select('id, kind, detail, coach_id')
    .eq('client_id', clientId)
    .is('resolved_at', null)
    .is('notified_at', null)
    .order('created_at', { ascending: true });
  if (!flags || flags.length === 0) return NextResponse.json({ emailed: 0 });

  const { data: client } = await admin
    .from('clients')
    .select('first_name_hint, last_name_hint, email')
    .eq('id', clientId)
    .maybeSingle();
  const coachId = flags[0]!.coach_id;
  const { data: coachUser } = await admin.auth.admin.getUserById(coachId);
  const to = coachUser?.user?.email;
  if (!to) return NextResponse.json({ emailed: 0 });

  const name =
    `${client?.first_name_hint ?? ''} ${client?.last_name_hint ?? ''}`.trim() ||
    client?.email ||
    'A client';
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.vela-coaching.com';
  const lines = flags.map((f) => `• ${FLAG_LABEL[f.kind as FlagKind]}: ${f.detail}`);
  const { ok } = await sendEmail({
    to,
    subject: `Vela · ${name}: ${FLAG_LABEL[flags[0]!.kind as FlagKind].toLowerCase()}${flags.length > 1 ? ` and ${flags.length - 1} more` : ''}`,
    text: [
      `${name} needs your attention.`,
      '',
      ...lines,
      '',
      `Open her page to decide: ${site}/clients/${clientId}`,
      '',
      'Nothing has been sent to her. She sees your decision once you make it.',
    ].join('\n'),
  });
  if (ok) {
    await admin
      .from('coach_flags')
      .update({ notified_at: new Date().toISOString() })
      .in(
        'id',
        flags.map((f) => f.id),
      );
  }
  return NextResponse.json({ emailed: ok ? 1 : 0 });
}
