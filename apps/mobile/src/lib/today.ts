import {
  TODAY,
  clientById,
  exercises,
  metricsByClient,
  nutritionByClient,
  nutritionTargetByClient,
  rollupByClient,
  sessionsByClient,
  sumMacros,
} from '@coachapp/shared';
import type { Metric, MetricType } from '@coachapp/shared';

/**
 * The signed-in client. Phase 1 replaces this with the Supabase session; every screen
 * already reads through here so that swap touches one file.
 */
export const CURRENT_CLIENT_ID = 'cl_1';

export const me = clientById.get(CURRENT_CLIENT_ID)!;
export const myRollup = rollupByClient.get(CURRENT_CLIENT_ID)!;

export interface PlannedItem {
  id: string;
  exerciseId: string;
  name: string;
  cues: string[];
  block: string;
  sets: number;
  reps: string;
  targetLoadKg: number | null;
  targetRpe: number | null;
  restSec: number;
  tempo: string | null;
}

/** Stand-in for the Phase 2 program builder — the prescription for today's session. */
export const todayPlan: PlannedItem[] = [
  {
    id: 'pi_1',
    exerciseId: 'ex_8',
    name: 'Split Squat',
    cues: exercises.find((e) => e.id === 'ex_8')?.cues ?? [],
    block: 'A',
    sets: 3,
    reps: '8-10',
    targetLoadKg: 22.5,
    targetRpe: 7,
    restSec: 90,
    tempo: '3-0-1',
  },
  {
    id: 'pi_2',
    exerciseId: 'ex_3',
    name: 'Nordic Hamstring Curl',
    cues: exercises.find((e) => e.id === 'ex_3')?.cues ?? [],
    block: 'A',
    sets: 3,
    reps: '5',
    targetLoadKg: null,
    targetRpe: 8,
    restSec: 90,
    tempo: '5-0-0',
  },
  {
    id: 'pi_3',
    exerciseId: 'ex_5',
    name: 'Single-Leg Calf Raise',
    cues: exercises.find((e) => e.id === 'ex_5')?.cues ?? [],
    block: 'B',
    sets: 3,
    reps: '12-15',
    targetLoadKg: 10,
    targetRpe: 7,
    restSec: 60,
    tempo: '3-1-1',
  },
  {
    id: 'pi_4',
    exerciseId: 'ex_6',
    name: 'Bird Dog',
    cues: exercises.find((e) => e.id === 'ex_6')?.cues ?? [],
    block: 'B',
    sets: 3,
    reps: '8 each side',
    targetLoadKg: null,
    targetRpe: 6,
    restSec: 45,
    tempo: null,
  },
];

export const todaySession = (sessionsByClient.get(CURRENT_CLIENT_ID) ?? []).find(
  (s) => s.scheduledDate === TODAY,
);

export function estimatedMinutes(): number {
  const working = todayPlan.reduce((n, i) => n + i.sets, 0);
  const rest = todayPlan.reduce((n, i) => n + i.sets * i.restSec, 0);
  return Math.round((working * 45 + rest) / 60);
}

export function latestMetricValue(type: MetricType): Metric | null {
  const metrics = (metricsByClient.get(CURRENT_CLIENT_ID) ?? []).filter((m) => m.type === type);
  return metrics.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0] ?? null;
}

export function todayNutrition() {
  const logs = (nutritionByClient.get(CURRENT_CLIENT_ID) ?? []).filter((l) => l.loggedOn === TODAY);
  const target = nutritionTargetByClient.get(CURRENT_CLIENT_ID)!;
  return { logs, actual: sumMacros(logs.map((l) => l.macros)), target };
}

/** Consecutive days back from today with a completed session or a nutrition entry. */
export function currentStreak(): number {
  const sessions = sessionsByClient.get(CURRENT_CLIENT_ID) ?? [];
  const done = new Set(
    sessions.filter((s) => s.status === 'completed').map((s) => s.scheduledDate),
  );
  const food = new Set((nutritionByClient.get(CURRENT_CLIENT_ID) ?? []).map((l) => l.loggedOn));

  let streak = 0;
  const d = new Date(`${TODAY}T00:00:00Z`);
  for (let i = 0; i < 60; i++) {
    const iso = d.toISOString().slice(0, 10);
    if (done.has(iso) || food.has(iso)) streak++;
    else if (i > 0) break;
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return streak;
}
