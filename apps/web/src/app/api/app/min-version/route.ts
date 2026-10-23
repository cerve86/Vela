import { NextResponse } from 'next/server';
import { MIN_APP_VERSION } from '@/lib/appVersion';

/**
 * GET /api/app/min-version — the oldest app build that shows everything a programme can
 * now carry. Raised whenever a release adds something the phone must render (day notes,
 * cross-training days, a new card), so an older build can ask its owner to update rather
 * than silently show a session without the instruction that changes it. Public: it says
 * nothing about anybody.
 */
export function GET() {
  return NextResponse.json(
    { minVersion: MIN_APP_VERSION },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
