'use server';

import { getSessionPlan, type SessionPlanItem } from '@vela/api';
import { createServerSupabase } from '@/lib/supabase/server';

/** The prescription behind one session, for the panel's detail. RLS decides what she may see. */
export async function loadSessionPlanAction(sessionId: string): Promise<SessionPlanItem[]> {
  const supabase = await createServerSupabase();
  return getSessionPlan(supabase, sessionId);
}
