import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface ClientRecord {
  id: string;
  email: string;
  condition: string | null;
  goal: string | null;
  status: string;
  /** Null when not postpartum; the app hides the return-to-running pathway then. */
  weeksPostpartum: number | null;
  deliveryType: string;
  breastfeeding: boolean;
}

interface SessionState {
  loading: boolean;
  session: Session | null;
  /** The client row linked to this account. Null until an invite has been accepted. */
  client: ClientRecord | null;
  /** Health-data consent granted and not revoked. Gates the main app. */
  hasConsent: boolean;
  /**
   * Reloads the session and returns what it found.
   *
   * The return value matters: signing in successfully is not the same as getting in, and a
   * caller that awaits this needs to know which happened without waiting for a re-render.
   */
  refresh: () => Promise<{ session: Session | null; client: ClientRecord | null }>;
}

const Ctx = createContext<SessionState>({
  loading: true,
  session: null,
  client: null,
  hasConsent: false,
  refresh: async () => ({ session: null, client: null }),
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [hasConsent, setHasConsent] = useState(false);

  async function load(current: Session | null): Promise<ClientRecord | null> {
    setSession(current);

    if (!current) {
      setClient(null);
      setHasConsent(false);
      setLoading(false);
      return null;
    }

    // No .eq('profile_id', …) here on purpose: RLS already restricts this to the
    // caller's own row, and relying on the policy rather than a client-side filter is
    // what makes a bug here harmless.
    const { data: row } = await supabase
      .from('clients')
      .select('id, email, condition, goal, status, weeks_postpartum, delivery_type, breastfeeding')
      .maybeSingle();

    const record: ClientRecord | null = row
      ? {
          id: row.id,
          email: row.email,
          condition: row.condition,
          goal: row.goal,
          status: row.status,
          weeksPostpartum: row.weeks_postpartum,
          deliveryType: row.delivery_type,
          breastfeeding: row.breastfeeding,
        }
      : null;

    setClient(record);

    if (row) {
      const { data: consents } = await supabase
        .from('consents')
        .select('type, revoked_at')
        .eq('type', 'health_data_processing')
        .is('revoked_at', null);
      setHasConsent((consents?.length ?? 0) > 0);
    } else {
      setHasConsent(false);
    }

    setLoading(false);
    return record;
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      load(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      loading,
      session,
      client,
      hasConsent,
      refresh: async () => {
        const { data } = await supabase.auth.getSession();
        const next = await load(data.session);
        return { session: data.session, client: next };
      },
    }),
    [loading, session, client, hasConsent],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  return useContext(Ctx);
}
