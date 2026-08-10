'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@coachapp/api/types';

let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

/** Single browser client per tab — several instances would fight over token refresh. */
export function getBrowserSupabase() {
  cached ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return cached;
}
