import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type VelaClient = SupabaseClient<Database>;

export interface ClientOptions {
  url: string;
  anonKey: string;
  /**
   * React Native has no localStorage, so the mobile app injects AsyncStorage here.
   * Web leaves it undefined and gets the browser default.
   */
  storage?: {
    getItem: (key: string) => Promise<string | null> | string | null;
    setItem: (key: string, value: string) => Promise<void> | void;
    removeItem: (key: string) => Promise<void> | void;
  };
  /** Mobile must not try to read tokens out of a URL fragment. */
  detectSessionInUrl?: boolean;
}

/**
 * One client factory for both surfaces. The anon key is a public credential — it is
 * compiled into the shipped app by design, and every table it can reach is guarded by
 * row level security. The service_role key must never appear in either app.
 */
export function createVelaClient(opts: ClientOptions): VelaClient {
  return createClient<Database>(opts.url, opts.anonKey, {
    auth: {
      storage: opts.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: opts.detectSessionInUrl ?? true,
      flowType: 'pkce',
    },
  });
}
