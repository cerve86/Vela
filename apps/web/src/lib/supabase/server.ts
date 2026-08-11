import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@vela/api/types';

/**
 * Server-side client. Reads the session from cookies so Server Components and Route
 * Handlers run every query as the signed-in coach, which means RLS — not application
 * code — decides what they can see.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot set cookies; middleware refreshes the session
            // instead, so swallowing this is correct rather than merely convenient.
          }
        },
      },
    },
  );
}
