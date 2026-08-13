import type { Macros } from './nutrition';

/**
 * Open Food Facts barcode lookup.
 *
 * A free, open product database with no key and no account. Their terms ask every client
 * to identify itself, so the User-Agent is not decoration — an anonymous caller is the
 * thing they block.
 *
 * Deliberately tolerant: this is crowd-sourced data and half the fields on any given
 * product are missing or nonsense. Anything we cannot read as a number is dropped rather
 * than coerced, and a product with no energy value is treated as a miss, because a food
 * that logs as 0 kcal is worse than one that fails to log at all.
 */
const ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product';

const USER_AGENT = 'Vela/0.1 (physiotherapy coaching app; contact@vela.io)';

export interface OffProduct {
  barcode: string;
  name: string;
  brand: string | null;
  servingName: string | null;
  servingG: number | null;
  per100g: Macros;
}

/** Barcodes are digits: EAN-8, UPC-A, EAN-13 and the 14-digit case. */
export function isPlausibleBarcode(code: string): boolean {
  return /^\d{8,14}$/.test(code.trim());
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** "150 g" / "1 pot (150g)" / "150ml" → 150. Anything else is left to the client. */
function parseServingGrams(quantity: unknown): number | null {
  if (typeof quantity !== 'string') return null;
  const m = /(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i.exec(quantity);
  if (!m) return null;
  const n = Number(m[1]!.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function lookupBarcode(
  barcode: string,
  opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<{ product: OffProduct | null; error: string | null }> {
  const code = barcode.trim();
  if (!isPlausibleBarcode(code)) {
    return { product: null, error: "That doesn't look like a barcode." };
  }

  const doFetch = opts.fetchImpl ?? fetch;
  const fields = [
    'code',
    'product_name',
    'brands',
    'serving_size',
    'nutriments',
  ].join(',');

  let payload: unknown;
  try {
    const res = await doFetch(`${ENDPOINT}/${encodeURIComponent(code)}.json?fields=${fields}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: opts.signal,
    });
    // 404 is the ordinary "we have never heard of this tin", not a failure worth an
    // error card that implies something broke.
    if (res.status === 404) return { product: null, error: null };
    if (!res.ok) return { product: null, error: `Open Food Facts returned ${res.status}.` };
    payload = await res.json();
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') return { product: null, error: null };
    return { product: null, error: 'Could not reach Open Food Facts. Check your connection.' };
  }

  const root = payload as { status?: number; product?: Record<string, unknown> };
  if (root.status !== 1 || !root.product) return { product: null, error: null };

  const p = root.product;
  const nutriments = (p.nutriments ?? {}) as Record<string, unknown>;

  // Their energy field comes in kcal or kJ depending on the contributor's locale.
  const kcal =
    num(nutriments['energy-kcal_100g']) ??
    (num(nutriments['energy-kj_100g']) !== null
      ? Math.round(num(nutriments['energy-kj_100g'])! / 4.184)
      : null);

  if (kcal === null) return { product: null, error: null };

  const name = typeof p.product_name === 'string' ? p.product_name.trim() : '';
  if (!name) return { product: null, error: null };

  const brands = typeof p.brands === 'string' ? p.brands.split(',')[0]?.trim() || null : null;
  const servingName = typeof p.serving_size === 'string' ? p.serving_size.trim() || null : null;

  return {
    product: {
      barcode: typeof p.code === 'string' ? p.code : code,
      name,
      brand: brands,
      servingName,
      servingG: parseServingGrams(servingName),
      per100g: {
        kcal,
        proteinG: num(nutriments.proteins_100g) ?? 0,
        carbsG: num(nutriments.carbohydrates_100g) ?? 0,
        fatG: num(nutriments.fat_100g) ?? 0,
      },
    },
    error: null,
  };
}
