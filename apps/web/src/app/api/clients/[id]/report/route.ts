import { NextResponse } from 'next/server';
import { buildClientReport } from '@vela/api';
import { requireCoach } from '@/lib/apiRoute';

/**
 * GET /api/clients/{id}/report?days=28 — everything the portal knows about one client, as
 * data: profile, programme and weekly plans, sessions with pain and RPE, adherence, daily
 * reads, vitals by day, the HRV read through the decision tree, recorded activities,
 * meals by day, the last messages. Read as the coach; 404 for a client who is not hers.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, refused } = await requireCoach(req);
  if (refused) return refused;
  const { id } = await params;
  const days = Number(new URL(req.url).searchParams.get('days') ?? 28);
  const today = new Date().toISOString().slice(0, 10);
  const report = await buildClientReport(supabase, id, {
    today,
    days: Number.isFinite(days) ? days : 28,
  });
  if (!report) return NextResponse.json({ error: 'No such client.' }, { status: 404 });
  return NextResponse.json({ report });
}
