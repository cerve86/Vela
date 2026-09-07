import { NextResponse } from 'next/server';
import { listClientsBrief } from '@vela/api';
import { requireCoach } from '@/lib/apiRoute';

/** GET /api/clients — the coach's active clients: id and name, nothing more. */
export async function GET(req: Request) {
  const { supabase, refused } = await requireCoach(req);
  if (refused) return refused;
  const clients = await listClientsBrief(supabase);
  return NextResponse.json({ clients: clients.map((c) => ({ id: c.id, name: c.name })) });
}
