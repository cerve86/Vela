import { NextResponse } from 'next/server';
import { foodByBarcode, isPlausibleBarcode, lookupBarcode } from '@vela/api';
import { requireUser } from '@/lib/apiRoute';
import { adminClient } from '@/lib/impersonate';

/**
 * POST /api/foods/barcode — look a product up and cache it for everyone.
 *
 * The cache is shared by every practice, so its rows come from Open Food Facts through
 * this server and never from whoever scanned: a client could otherwise write any figures
 * for any barcode, and the first row per barcode is the one everyone reads. The caller
 * only proves she is signed in; the values are the product's.
 */
export async function POST(req: Request) {
  const { refused } = await requireUser(req);
  if (refused) return refused;
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: 'Server is not configured.' }, { status: 500 });

  let barcode = '';
  try {
    barcode = String(((await req.json()) as { barcode?: unknown }).barcode ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Send { barcode }.' }, { status: 400 });
  }
  if (!isPlausibleBarcode(barcode))
    return NextResponse.json({ error: "That doesn't look like a barcode." }, { status: 400 });

  const cached = await foodByBarcode(admin, barcode);
  if (cached) return NextResponse.json({ food: cached });

  const { product, error } = await lookupBarcode(barcode);
  if (error) return NextResponse.json({ error }, { status: 502 });
  if (!product) return NextResponse.json({ food: null });

  const { error: insertError } = await admin.from('foods').insert({
    coach_id: null,
    source: 'off',
    barcode: product.barcode,
    name: product.name.trim(),
    brand: product.brand?.trim() || null,
    serving_name: product.servingName?.trim() || null,
    serving_g: product.servingG ?? null,
    kcal_100g: product.per100g.kcal,
    protein_100g: product.per100g.proteinG,
    carbs_100g: product.per100g.carbsG,
    fat_100g: product.per100g.fatG,
  });
  // Two scans of one tin at once: the unique index settles it and both read the winner.
  if (insertError && insertError.code !== '23505')
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  return NextResponse.json({ food: await foodByBarcode(admin, barcode) });
}
