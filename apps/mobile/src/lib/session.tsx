import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { acceptMyInvite } from '@vela/api';
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
  /** Null until the welcome flow has been finished. Gates onboarding, once. */
  onboardedAt: string | null;
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

type ClientRow = {
  id: string;
  email: string;
  condition: string | null;
  goal: string | null;
  status: string;
  weeks_postpartum: number | null;
  delivery_type: string;
  breastfeeding: boolean;
  onboarded_at: string | null;
};

// No .eq('profile_id', …) here on purpose: RLS already restricts this to the caller's
// own row, and relying on the policy rather than a client-side filter is what makes a
// bug here harmless.
async function fetchClientRow(): Promise<ClientRow | null> {
  const { data } = await supabase
    .from('clients')
    .select(
      'id, email, condition, goal, status, weeks_postpartum, delivery_type, breastfeeding, onboarded_at',
    )
    .maybeSingle();
  return data ?? null;
}

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

    let row = await fetchClientRow();

    /**
     * Signed in, but no client row: finish the invitation here rather than bouncing.
     *
     * Only the invite screen used to call accept_my_invite. The link in the invitation
     * email and the sign-in screen's code both verify the address just as well, and
     * Supabase confirms the account either way — leaving a verified user whose client
     * row was never linked. The gate then sent her back to sign-in, and the portal
     * refused the coach a re-invite because the account "already exists". Nobody could
     * get out. Accepting on every door closes that: the function only succeeds when a
     * pending invitation matches this verified email, so a coach signing into the
     * client app by mistake simply gets its "no pending invitation" and stays where
     * she was. One attempt per load; a failure here is not an error to show.
     */
    if (!row) {
      const { clientId } = await acceptMyInvite(supabase);
      if (clientId) row = await fetchClientRow();
    }

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
          onboardedAt: row.onboarded_at,
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
