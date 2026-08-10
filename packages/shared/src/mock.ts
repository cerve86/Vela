import {
  acwr,
  adherence,
  deriveAlerts,
  mean,
  painTrend,
  round,
  volumeLoad,
} from './domain';
import type {
  Client,
  ClientRollup,
  Exercise,
  Metric,
  MetricType,
  NutritionLog,
  Session,
  SetLog,
} from './types';

/**
 * Deterministic seed data for the prototype. No Math.random and no `new Date()` —
 * the portal and the iOS app must render the same numbers, and a screenshot taken
 * tomorrow must match one taken today.
 *
 * Everything here is replaced by Supabase queries in Phase 1; the shapes are the
 * contract, so swapping the source is a one-file change per surface.
 */

export const TODAY = '2026-08-10';
const COACH_ID = 'coach_1';

/** Mulberry32 — small, fast, reproducible. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function daysAgo(n: number, from: string = TODAY): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Exercise library
// ---------------------------------------------------------------------------

export const exercises: Exercise[] = [
  {
    id: 'ex_1',
    name: 'Barbell Back Squat',
    cues: ['Brace before descending', 'Knees track over toes', 'Full depth without pelvic tuck'],
    muscleGroups: ['quads', 'glutes', 'core'],
    equipment: 'Barbell',
    videoPath: null,
    coachId: null,
    isRehab: false,
  },
  {
    id: 'ex_2',
    name: 'Romanian Deadlift',
    cues: ['Hinge from the hip', 'Neutral spine', 'Bar stays close to the legs'],
    muscleGroups: ['hamstrings', 'glutes', 'back'],
    equipment: 'Barbell',
    videoPath: null,
    coachId: null,
    isRehab: false,
  },
  {
    id: 'ex_3',
    name: 'Nordic Hamstring Curl',
    cues: ['Lower as slowly as you can control', 'Hips extended throughout'],
    muscleGroups: ['hamstrings'],
    equipment: 'Bodyweight',
    videoPath: null,
    coachId: COACH_ID,
    isRehab: true,
  },
  {
    id: 'ex_4',
    name: 'Copenhagen Plank',
    cues: ['Stack shoulder over elbow', 'Top leg drives down into the bench'],
    muscleGroups: ['hips', 'core'],
    equipment: 'Bench',
    videoPath: null,
    coachId: COACH_ID,
    isRehab: true,
  },
  {
    id: 'ex_5',
    name: 'Single-Leg Calf Raise',
    cues: ['Full range through the ankle', '3s lower'],
    muscleGroups: ['calves'],
    equipment: 'Step',
    videoPath: null,
    coachId: null,
    isRehab: true,
  },
  {
    id: 'ex_6',
    name: 'Bird Dog',
    cues: ['Ribs down', 'No rotation through the pelvis'],
    muscleGroups: ['core', 'back'],
    equipment: 'Bodyweight',
    videoPath: null,
    coachId: null,
    isRehab: true,
  },
  {
    id: 'ex_7',
    name: 'Cable External Rotation',
    cues: ['Elbow pinned to the side', 'Slow return'],
    muscleGroups: ['shoulders'],
    equipment: 'Cable',
    videoPath: null,
    coachId: null,
    isRehab: true,
  },
  {
    id: 'ex_8',
    name: 'Split Squat',
    cues: ['Torso upright', 'Front shin vertical at the bottom'],
    muscleGroups: ['quads', 'glutes'],
    equipment: 'Dumbbell',
    videoPath: null,
    coachId: null,
    isRehab: false,
  },
  {
    id: 'ex_9',
    name: 'Dead Bug',
    cues: ['Low back stays flat', 'Exhale as the limb extends'],
    muscleGroups: ['core'],
    equipment: 'Bodyweight',
    videoPath: null,
    coachId: null,
    isRehab: true,
  },
  {
    id: 'ex_10',
    name: 'Seated Row',
    cues: ['Shoulder blades back and down', 'No trunk swing'],
    muscleGroups: ['back', 'biceps'],
    equipment: 'Cable',
    videoPath: null,
    coachId: null,
    isRehab: false,
  },
];

export const exerciseById = new Map(exercises.map((e) => [e.id, e]));

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

interface ClientProfile extends Client {
  /** Prototype-only knobs that shape the generated history */
  _adherence: number;
  _basePain: number;
  _painDrift: number;
  _startWeight: number;
  _weightDrift: number;
  _loadSpike: boolean;
  _inactiveDays: number;
}

function makeClient(
  id: string,
  firstName: string,
  lastName: string,
  dateOfBirth: string,
  sex: Client['sex'],
  heightCm: number,
  condition: string,
  goal: string,
  knobs: Pick<
    ClientProfile,
    | '_adherence'
    | '_basePain'
    | '_painDrift'
    | '_startWeight'
    | '_weightDrift'
    | '_loadSpike'
    | '_inactiveDays'
  >,
  status: Client['status'] = 'active',
): ClientProfile {
  return {
    id,
    coachId: COACH_ID,
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
    avatarUrl: null,
    dateOfBirth,
    sex,
    heightCm,
    condition,
    goal,
    status,
    startedOn: daysAgo(90),
    ...knobs,
  };
}

export const clients: ClientProfile[] = [
  makeClient(
    'cl_1',
    'Marta',
    'Rossi',
    '1992-03-14',
    'female',
    168,
    'ACL reconstruction — 14 weeks post-op',
    'Return to recreational football',
    {
      _adherence: 0.94,
      _basePain: 2,
      _painDrift: -1.2,
      _startWeight: 62.4,
      _weightDrift: 0.4,
      _loadSpike: false,
      _inactiveDays: 0,
    },
  ),
  makeClient(
    'cl_2',
    'Luca',
    'Bianchi',
    '1979-11-02',
    'male',
    181,
    'Chronic low back pain — L4/L5 disc bulge',
    'Pain-free desk work and lifting his kids',
    {
      _adherence: 0.42,
      _basePain: 5,
      _painDrift: 2.1,
      _startWeight: 94.2,
      _weightDrift: 1.1,
      _loadSpike: false,
      _inactiveDays: 2,
    },
  ),
  makeClient(
    'cl_3',
    'Sofia',
    'Greco',
    '1997-06-25',
    'female',
    172,
    'Rotator cuff tendinopathy — right shoulder',
    'Overhead pressing without pain',
    {
      _adherence: 0.86,
      _basePain: 3,
      _painDrift: -1.0,
      _startWeight: 64.8,
      _weightDrift: -0.6,
      _loadSpike: false,
      _inactiveDays: 1,
    },
  ),
  makeClient(
    'cl_4',
    'Davide',
    'Conti',
    '1974-01-19',
    'male',
    176,
    'Knee osteoarthritis — medial compartment',
    'Walk 5km without swelling',
    {
      _adherence: 0.63,
      _basePain: 4,
      _painDrift: -0.3,
      _startWeight: 88.5,
      _weightDrift: -2.3,
      _loadSpike: false,
      _inactiveDays: 3,
    },
  ),
  makeClient(
    'cl_5',
    'Elena',
    'Ferrari',
    '1985-09-08',
    'female',
    165,
    'Post-partum pelvic floor rehab',
    'Return to running 10km',
    {
      _adherence: 0.9,
      _basePain: 1,
      _painDrift: -0.5,
      _startWeight: 68.1,
      _weightDrift: -3.2,
      _loadSpike: false,
      _inactiveDays: 0,
    },
  ),
  makeClient(
    'cl_6',
    'Marco',
    'Riva',
    '2003-04-30',
    'male',
    184,
    'Grade II hamstring strain — return to sport',
    'Full sprint clearance for pre-season',
    {
      _adherence: 0.97,
      _basePain: 2,
      _painDrift: 0.4,
      _startWeight: 78.9,
      _weightDrift: 0.8,
      _loadSpike: true,
      _inactiveDays: 0,
    },
  ),
  makeClient(
    'cl_7',
    'Giulia',
    'Moretti',
    '1988-12-11',
    'female',
    170,
    'Cervical radiculopathy — C6 distribution',
    'Sleep through the night without arm pain',
    {
      _adherence: 0.35,
      _basePain: 4,
      _painDrift: 0.8,
      _startWeight: 66.0,
      _weightDrift: 0.2,
      _loadSpike: false,
      _inactiveDays: 8,
    },
  ),
  makeClient(
    'cl_8',
    'Andrea',
    'Costa',
    '1965-07-22',
    'male',
    174,
    'Total hip replacement — 9 weeks post-op',
    'Climb stairs unaided, return to cycling',
    {
      _adherence: 0.88,
      _basePain: 3,
      _painDrift: -1.6,
      _startWeight: 81.3,
      _weightDrift: -1.4,
      _loadSpike: false,
      _inactiveDays: 1,
    },
  ),
];

export const clientById = new Map<string, Client>(clients.map((c) => [c.id, c]));

// ---------------------------------------------------------------------------
// Generated history
// ---------------------------------------------------------------------------

const HISTORY_DAYS = 56;
const SESSION_TITLES = ['Lower body + core', 'Upper body', 'Rehab & mobility', 'Full body'];

function buildSessions(c: ClientProfile): Session[] {
  const rand = rng(hash(c.id));
  const out: Session[] = [];

  for (let d = HISTORY_DAYS; d >= 0; d--) {
    const date = daysAgo(d);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    // Train Mon / Wed / Fri / Sat
    if (![1, 3, 5, 6].includes(dow)) continue;

    const progress = 1 - d / HISTORY_DAYS;
    const inactive = d < c._inactiveDays;

    let status: Session['status'];
    if (d === 0) status = 'scheduled';
    else if (inactive) status = 'skipped';
    else status = rand() < c._adherence ? 'completed' : 'skipped';

    const painBefore = clamp(
      Math.round(c._basePain + c._painDrift * progress + (rand() - 0.5) * 1.6),
      0,
      10,
    );
    const done = status === 'completed';

    out.push({
      id: `se_${c.id}_${d}`,
      clientId: c.id,
      programDayId: `pd_${(d % 4) + 1}`,
      title: SESSION_TITLES[d % SESSION_TITLES.length] ?? 'Session',
      scheduledDate: date,
      status,
      startedAt: done ? `${date}T17:30:00Z` : null,
      completedAt: done ? `${date}T18:32:00Z` : null,
      durationSec: done ? 3200 + Math.round(rand() * 1400) : null,
      sessionRpe: done ? round(6 + rand() * 2.5, 1) : null,
      painBefore: done ? painBefore : null,
      painAfter: done ? clamp(painBefore - 1 + Math.round(rand() * 2 - 0.5), 0, 10) : null,
      clientNotes: done && rand() > 0.75 ? 'Felt stronger today, knee tracked well.' : null,
      coachFeedback: null,
    });
  }
  return out;
}

function buildSetLogs(c: ClientProfile, sessions: Session[]): SetLog[] {
  const rand = rng(hash(`${c.id}_sets`));
  const out: SetLog[] = [];
  const picks = ['ex_1', 'ex_2', 'ex_8', 'ex_3', 'ex_5', 'ex_10'];

  for (const s of sessions) {
    if (s.status !== 'completed') continue;
    const dayIndex = HISTORY_DAYS - daysBetween(s.scheduledDate, TODAY);
    const progress = dayIndex / HISTORY_DAYS;
    // Marco's deliberate load spike in the most recent 10 days
    const spike = c._loadSpike && daysBetween(s.scheduledDate, TODAY) < 10 ? 1.45 : 1;

    for (let e = 0; e < 3; e++) {
      const exerciseId = picks[(dayIndex + e) % picks.length] ?? 'ex_1';
      const base = 30 + ((hash(exerciseId) % 5) * 8 + e * 6);
      for (let set = 0; set < 3; set++) {
        out.push({
          id: `sl_${s.id}_${e}_${set}`,
          sessionId: s.id,
          programItemId: `pi_${e}`,
          exerciseId,
          setIndex: set,
          reps: 8 + Math.round(rand() * 4),
          weightKg: round((base + progress * 18 + set * 2.5) * spike, 1),
          rpe: round(6.5 + rand() * 2, 1),
          painScore: rand() > 0.7 ? clamp(Math.round(rand() * 3 + c._basePain - 2), 0, 10) : null,
          completed: true,
          loggedAt: `${s.scheduledDate}T17:${40 + set}:00Z`,
        });
      }
    }
  }
  return out;
}

function buildMetrics(c: ClientProfile): Metric[] {
  const rand = rng(hash(`${c.id}_metrics`));
  const out: Metric[] = [];
  const push = (
    day: number,
    type: MetricType,
    value: number,
    source: Metric['source'] = 'healthkit',
  ) =>
    out.push({
      id: `mt_${c.id}_${type}_${day}`,
      clientId: c.id,
      recordedAt: `${daysAgo(day)}T07:00:00Z`,
      type,
      value: round(value, 1),
      source,
      externalId: source === 'healthkit' ? `hk_${c.id}_${type}_${day}` : null,
    });

  for (let d = HISTORY_DAYS; d >= 0; d--) {
    const progress = 1 - d / HISTORY_DAYS;
    if (d % 2 === 0) {
      push(
        d,
        'weight_kg',
        c._startWeight + c._weightDrift * progress + (rand() - 0.5) * 0.6,
        d % 6 === 0 ? 'manual' : 'healthkit',
      );
    }
    push(d, 'resting_hr', 58 + (rand() - 0.5) * 8 - progress * 3);
    push(d, 'sleep_min', 400 + (rand() - 0.5) * 90);
    push(d, 'steps', 7200 + (rand() - 0.5) * 4200 + progress * 900);
    if (d % 7 === 0) push(d, 'hrv_ms', 48 + (rand() - 0.5) * 18 + progress * 6);
  }
  return out;
}

function buildNutrition(c: ClientProfile): NutritionLog[] {
  const rand = rng(hash(`${c.id}_food`));
  const out: NutritionLog[] = [];
  const meals: Array<{ meal: NutritionLog['meal']; name: string; g: number }> = [
    { meal: 'breakfast', name: 'Greek yoghurt & berries', g: 280 },
    { meal: 'lunch', name: 'Chicken, rice & greens', g: 450 },
    { meal: 'dinner', name: 'Salmon, potatoes & salad', g: 480 },
    { meal: 'snack', name: 'Whey shake & banana', g: 330 },
  ];

  for (let d = 27; d >= 0; d--) {
    if (rand() > (c._adherence + 0.05)) continue; // skipped logging that day
    for (const m of meals) {
      if (rand() > 0.92) continue;
      const kcal = 320 + rand() * 260;
      out.push({
        id: `nl_${c.id}_${d}_${m.meal}`,
        clientId: c.id,
        loggedOn: daysAgo(d),
        meal: m.meal,
        foodName: m.name,
        quantityG: m.g,
        // Roughly 26% protein / 42% carbs / 32% fat by energy, which keeps a logged day
        // landing near the prescribed targets instead of overshooting protein by 40%.
        macros: {
          kcal: round(kcal, 0),
          proteinG: round((kcal * 0.26) / 4, 0),
          carbsG: round((kcal * 0.42) / 4, 0),
          fatG: round((kcal * 0.32) / 9, 0),
        },
      });
    }
  }
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function daysBetween(a: string, b: string): number {
  const ms = new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime();
  return Math.round(ms / 86400000);
}

export const sessionsByClient = new Map<string, Session[]>(
  clients.map((c) => [c.id, buildSessions(c)]),
);
export const setLogsByClient = new Map<string, SetLog[]>(
  clients.map((c) => [c.id, buildSetLogs(c, sessionsByClient.get(c.id) ?? [])]),
);
export const metricsByClient = new Map<string, Metric[]>(
  clients.map((c) => [c.id, buildMetrics(c)]),
);
export const nutritionByClient = new Map<string, NutritionLog[]>(
  clients.map((c) => [c.id, buildNutrition(c)]),
);

export const nutritionTargetByClient = new Map(
  clients.map((c) => [
    c.id,
    {
      kcal: c.sex === 'female' ? 1950 : 2450,
      proteinG: c.sex === 'female' ? 115 : 150,
      carbsG: c.sex === 'female' ? 200 : 260,
      fatG: c.sex === 'female' ? 65 : 80,
    },
  ]),
);

// ---------------------------------------------------------------------------
// Rollups — computed with the real domain functions, not hand-written numbers
// ---------------------------------------------------------------------------

function buildRollup(c: ClientProfile): ClientRollup {
  const sessions = sessionsByClient.get(c.id) ?? [];
  const logs = setLogsByClient.get(c.id) ?? [];
  const metrics = metricsByClient.get(c.id) ?? [];
  const food = nutritionByClient.get(c.id) ?? [];

  // Half-open window: today plus the previous `days - 1` days. `<=` would span one
  // extra date and quietly inflate every 7-day figure.
  const within = (days: number) => (s: Session) => daysBetween(s.scheduledDate, TODAY) < days;
  const s7 = sessions.filter(within(7));
  const s28 = sessions.filter(within(28));

  const logsWithin = (days: number) => {
    const ids = new Set(sessions.filter(within(days)).map((s) => s.id));
    return logs.filter((l) => ids.has(l.sessionId));
  };
  const vol7 = volumeLoad(logsWithin(7));
  const vol28 = volumeLoad(logsWithin(28));

  const completed = sessions.filter((s) => s.status === 'completed');
  const last = completed[completed.length - 1];
  const daysSince = last ? daysBetween(last.scheduledDate, TODAY) : null;

  // Trend is judged over the whole episode of care, not a rolling 28 days — over a
  // short window session-to-session noise swamps the drift and everything reads "stable".
  const painScores = completed
    .map((s) => s.painAfter)
    .filter((p): p is number => p !== null);
  const pain7 = completed
    .filter(within(7))
    .map((s) => s.painAfter)
    .filter((p): p is number => p !== null);

  const weights = metrics
    .filter((m) => m.type === 'weight_kg')
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  const first28 = weights.find((m) => daysBetween(m.recordedAt.slice(0, 10), TODAY) <= 28);
  const latest = weights[weights.length - 1];

  // `< 7`, not `<= 7` — the inclusive comparison spans eight distinct dates and
  // produces adherence figures above 100%.
  const loggedDays = new Set(
    food.filter((f) => daysBetween(f.loggedOn, TODAY) < 7).map((f) => f.loggedOn),
  );
  const nutritionAdh = loggedDays.size / 7;

  const ratio = acwr(vol7, vol28);
  const missed7 = s7.filter((s) => s.status === 'skipped').length;
  const maxPain7 = pain7.length ? Math.max(...pain7) : null;

  return {
    clientId: c.id,
    adherence7d: adherence(s7),
    adherence28d: adherence(s28),
    sessionsCompleted7d: s7.filter((s) => s.status === 'completed').length,
    // Sessions still ahead of the client today are not yet missed, so they are excluded
    // from the denominator — otherwise a perfect week reads as incomplete.
    sessionsScheduled7d: s7.filter((s) => s.status !== 'scheduled').length,
    lastActivityAt: last?.scheduledDate ?? null,
    avgPain7d: pain7.length ? round(mean(pain7), 1) : null,
    painTrend: painTrend(painScores),
    weightDelta28dKg:
      first28 && latest ? round(latest.value - first28.value, 1) : null,
    volumeLoad7d: Math.round(vol7),
    acwr: ratio,
    nutritionAdherence7d: round(nutritionAdh, 2),
    alerts: deriveAlerts({
      missedSessions7d: missed7,
      maxPain7d: maxPain7,
      acwr: ratio,
      daysSinceLastActivity: daysSince,
      nutritionAdherence7d: round(nutritionAdh, 2),
    }),
  };
}

export const rollupByClient = new Map<string, ClientRollup>(
  clients.map((c) => [c.id, buildRollup(c)]),
);

export const coach = {
  id: COACH_ID,
  name: 'Andrea Cervellin',
  practice: 'Cervellin Physiotherapy & Performance',
  email: 'coach@example.com',
};
