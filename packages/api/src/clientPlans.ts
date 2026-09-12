import type { VelaClient } from './client';

/**
 * The weekly plan: one piece of text per client per week, in the physiotherapist's own
 * words. The lightest channel she has — no programme to assign and take off each week;
 * the week is the key, and last week's stays as history. Read live on the phone.
 */
export interface ClientPlan {
  id: string;
  clientId: string;
  /** The Monday of the week it is for, ISO date. */
  weekStart: string;
  body: string;
  updatedAt: string;
  /** Written in the portal, or sent by the coach's assistant with her key. */
  via: 'portal' | 'assistant';
}

const COLUMNS = 'id, client_id, week_start, body, updated_at, via';

function toPlan(r: {
  id: string;
  client_id: string;
  week_start: string;
  body: string;
  updated_at: string;
  via: string;
}): ClientPlan {
  return {
    id: r.id,
    clientId: r.client_id,
    weekStart: r.week_start,
    body: r.body,
    updatedAt: r.updated_at,
    via: r.via as ClientPlan['via'],
  };
}

/** The Monday of the week containing an ISO date, as an ISO date. */
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
  const day = dt.getUTCDay(); // 0 Sunday … 6 Saturday
  dt.setUTCDate(dt.getUTCDate() - ((day + 6) % 7));
  return dt.toISOString().slice(0, 10);
}

/** Newest first. */
export async function listClientPlans(
  supabase: VelaClient,
  clientId: string,
  limit = 12,
): Promise<ClientPlan[]> {
  const { data } = await supabase
    .from('client_plans')
    .select(COLUMNS)
    .eq('client_id', clientId)
    .order('week_start', { ascending: false })
    .limit(limit);
  return (data ?? []).map(toPlan);
}

/**
 * The plan to show today: this week's if there is one, otherwise the most recent — a
 * plan written on Friday for next week, or last week's while this week's is not yet
 * written. Null when nothing has ever been written.
 */
export async function currentClientPlan(
  supabase: VelaClient,
  clientId: string,
  today: string,
): Promise<ClientPlan | null> {
  const plans = await listClientPlans(supabase, clientId, 3);
  const thisWeek = mondayOf(today);
  return plans.find((p) => p.weekStart === thisWeek) ?? plans[0] ?? null;
}

/** Write or rewrite the plan for a week. */
export async function upsertClientPlan(
  supabase: VelaClient,
  input: {
    coachId: string;
    clientId: string;
    weekStart: string;
    body: string;
    via?: 'portal' | 'assistant';
  },
): Promise<{ plan: ClientPlan | null; error: string | null }> {
  const body = input.body.trim();
  if (!body) return { plan: null, error: 'Write the plan first.' };
  const { data, error } = await supabase
    .from('client_plans')
    .upsert(
      {
        coach_id: input.coachId,
        client_id: input.clientId,
        week_start: mondayOf(input.weekStart),
        body,
        via: input.via ?? 'portal',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,week_start' },
    )
    .select(COLUMNS)
    .single();
  return { plan: data ? toPlan(data) : null, error: error?.message ?? null };
}

/** The coach's active clients, by name — for a picker or an assistant's list. */
export async function listClientsBrief(
  supabase: VelaClient,
): Promise<{ id: string; name: string; email: string }[]> {
  const { data } = await supabase
    .from('clients')
    .select('id, email, first_name_hint, last_name_hint')
    .eq('status', 'active')
    .order('first_name_hint', { ascending: true });
  return (data ?? []).map((c) => ({
    id: c.id,
    name: `${c.first_name_hint ?? ''} ${c.last_name_hint ?? ''}`.trim() || c.email,
    email: c.email,
  }));
}
