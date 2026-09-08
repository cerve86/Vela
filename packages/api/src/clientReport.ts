import { hrvGuidance, type HrvGuidance } from '@vela/shared';
import { listActivities, type Activity } from './activities';
import type { VelaClient } from './client';
import { listClientPlans, type ClientPlan } from './clientPlans';
import { listDailyReads, type DailyRead } from './dailyReads';
import { listMessages, type Message } from './messages';
import { listMetrics, type MetricType } from './metrics';
import { nutritionDays, type NutritionDay } from './nutrition';
import {
  getAssignedProgram,
  listSessions,
  type AssignedProgram,
  type ScheduledSession,
} from './programs';

/**
 * Everything the portal knows about one client, in one read, for the coach's assistant.
 *
 * The client page shows this a card at a time; an assistant reasoning about a week
 * needs it all at once and as data. Nothing here is computed differently from the page:
 * the same sessions, reads, vitals, activities, meals and messages, the same HRV read
 * through the decision tree. Read as the coach, so row security decides what is hers.
 */
export interface ClientReport {
  generatedAt: string;
  window: { from: string; to: string; days: number };
  client: {
    id: string;
    name: string;
    email: string;
    status: string;
    weeksPostpartum: number | null;
    deliveryType: string | null;
    breastfeeding: boolean;
    goal: string | null;
    condition: string | null;
    startedOn: string;
  };
  programme: AssignedProgram | null;
  weeklyPlans: ClientPlan[];
  adherence: {
    last7: { due: number; completed: number };
    last28: { due: number; completed: number };
  };
  sessions: ScheduledSession[];
  reads: DailyRead[];
  /** Daily series by local day, one value per day (the mean where the day had several). */
  vitals: Record<VitalKey, { day: string; value: number }[]>;
  hrv: HrvGuidance | null;
  activities: Activity[];
  nutrition: NutritionDay[];
  messages: Message[];
}

const VITALS = [
  'hrv_ms',
  'resting_hr',
  'respiratory_rate',
  'sleep_min',
  'sleep_deep_min',
  'sleep_rem_min',
  'sleep_awake_min',
  'weight_kg',
  'steps',
  'cardio_load',
  'active_energy_kcal',
] as const satisfies readonly MetricType[];
export type VitalKey = (typeof VITALS)[number];

export async function buildClientReport(
  supabase: VelaClient,
  clientId: string,
  opts: { today: string; days?: number },
): Promise<ClientReport | null> {
  const days = Math.max(7, Math.min(opts.days ?? 28, 90));
  const from = shift(opts.today, -(days - 1));
  const to = opts.today;

  const { data: c } = await supabase
    .from('clients')
    .select(
      'id, email, first_name_hint, last_name_hint, status, weeks_postpartum, delivery_type, breastfeeding, goal, condition, started_on',
    )
    .eq('id', clientId)
    .maybeSingle();
  if (!c) return null;

  const [sessions, reads, metrics, activities, nutrition, messages, plans, programme] =
    await Promise.all([
      listSessions(supabase, { clientId, from, to: shift(to, 14) }),
      listDailyReads(supabase, { clientId, from, to }),
      // Vitals go back at least four weeks whatever the window: the HRV read needs three
      // weeks of baseline before this one, or there is no range to read the week against.
      listMetrics(supabase, {
        clientId,
        types: VITALS,
        since: `${shift(to, -Math.max(days, 28) + 1)}T00:00:00Z`,
      }),
      listActivities(supabase, { clientId, from }),
      nutritionDays(supabase, clientId, shift(to, -13), to),
      listMessages(supabase, clientId, 10),
      listClientPlans(supabase, clientId, 4),
      getAssignedProgram(supabase, clientId),
    ]);

  // Vitals by local day, averaged: an imported row and a manual one for the same day
  // must not sum into a resting heart rate of 110.
  const vitals = Object.fromEntries(
    VITALS.map((k) => [k, [] as { day: string; value: number }[]]),
  ) as ClientReport['vitals'];
  const acc = new Map<string, { total: number; n: number }>();
  for (const m of metrics) {
    const key = `${m.type}|${m.recordedAt.slice(0, 10)}`;
    const e = acc.get(key) ?? { total: 0, n: 0 };
    e.total += m.value;
    e.n += 1;
    acc.set(key, e);
  }
  for (const [key, v] of acc) {
    const [type, day] = key.split('|') as [VitalKey, string];
    if (type in vitals) vitals[type].push({ day, value: Math.round((v.total / v.n) * 100) / 100 });
  }
  for (const k of VITALS) vitals[k].sort((a, b) => a.day.localeCompare(b.day));

  const prescribed = sessions.filter((s) => s.programDayId !== null);
  const adherenceOver = (since: string) => {
    const due = prescribed.filter(
      (s) =>
        s.scheduledDate >= since &&
        s.scheduledDate <= to &&
        (s.scheduledDate < to || s.status === 'completed' || s.status === 'skipped'),
    );
    return { due: due.length, completed: due.filter((s) => s.status === 'completed').length };
  };

  const completed = sessions.filter((s) => s.status === 'completed');
  const setsByDay = new Map<string, number>();
  for (const s of completed)
    setsByDay.set(s.scheduledDate, (setsByDay.get(s.scheduledDate) ?? 0) + (s.setsDone ?? 0));
  const readToday = reads.filter((r) => r.readOn === to).at(-1) ?? null;
  const hrv = hrvGuidance({
    today: to,
    hrv: vitals.hrv_ms,
    restingHr: vitals.resting_hr,
    load:
      vitals.cardio_load.length >= 3
        ? vitals.cardio_load
        : [...setsByDay].map(([day, value]) => ({ day, value })),
    sessions: completed.map((s) => ({
      day: s.scheduledDate,
      discipline: s.discipline,
      rpe: s.sessionRpe,
    })),
    readiness: readToday?.readiness ?? null,
  });

  return {
    generatedAt: new Date().toISOString(),
    window: { from, to, days },
    client: {
      id: c.id,
      email: c.email,
      name: `${c.first_name_hint ?? ''} ${c.last_name_hint ?? ''}`.trim() || c.email,
      status: c.status,
      weeksPostpartum: c.weeks_postpartum,
      deliveryType: c.delivery_type,
      breastfeeding: c.breastfeeding,
      goal: c.goal,
      condition: c.condition,
      startedOn: c.started_on,
    },
    programme,
    weeklyPlans: plans,
    adherence: { last7: adherenceOver(shift(to, -6)), last28: adherenceOver(from) },
    sessions,
    reads,
    vitals,
    hrv,
    activities,
    nutrition,
    messages: [...messages].reverse(),
  };
}

function shift(iso: string, by: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + by)).toISOString().slice(0, 10);
}
