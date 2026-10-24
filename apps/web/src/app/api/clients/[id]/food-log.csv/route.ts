import { NextResponse } from 'next/server';
import { foodLogCsv } from '@vela/api';
import { requireCoach } from '@/lib/apiRoute';

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/clients/{id}/food-log.csv — everything she logged in the food diary, as CSV.
 * The export that comes before calorie tracking is switched off; switching it off deletes
 * nothing, so this is also how to read it back later.
 */
export async function GET(req: Request, { params }: Ctx) {
  const { supabase, refused } = await requireCoach(req);
  if (refused) return refused;
  const { id } = await params;
  const { data: client } = await supabase.from('clients').select('id').eq('id', id).maybeSingle();
  if (!client) return NextResponse.json({ error: 'No such client.' }, { status: 404 });
  return new NextResponse(await foodLogCsv(supabase, id), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="food-log-${id.slice(0, 8)}.csv"`,
    },
  });
}
