import { NextResponse } from 'next/server';
import { listPrograms } from '@vela/api';
import { requireCoach } from '@/lib/apiRoute';

/** GET /api/programs — the coach's programmes and templates, newest first. */
export async function GET(req: Request) {
  const { supabase, refused } = await requireCoach(req);
  if (refused) return refused;

  const programs = await listPrograms(supabase);
  return NextResponse.json({ programs });
}
