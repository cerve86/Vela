import { z } from 'zod';

/**
 * Single source of truth for the domain. Zod schemas define the shape, TS types are
 * inferred from them, and the same schemas validate forms on iOS, in the portal, and
 * in Edge Functions. Database constraints mirror these in supabase/migrations.
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export const roleSchema = z.enum(['coach', 'client']);
export type Role = z.infer<typeof roleSchema>;

export const clientStatusSchema = z.enum(['invited', 'active', 'paused', 'archived']);
export type ClientStatus = z.infer<typeof clientStatusSchema>;

export const clientSchema = z.object({
  id: z.string(),
  coachId: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  avatarUrl: z.string().url().nullable(),
  dateOfBirth: z.string(), // ISO date
  sex: z.enum(['female', 'male', 'other', 'undisclosed']),
  heightCm: z.number().positive().nullable(),
  /**
   * Postpartum context. This is the spine of the product: almost every clinical
   * decision — impact readiness, load progression, pelvic floor work — keys off how
   * the birth went and how long ago it was.
   */
  deliveryType: z.enum(['vaginal', 'assisted_vaginal', 'caesarean', 'not_applicable']),
  /** Null when not postpartum; the app then hides the return-to-running pathway. */
  weeksPostpartum: z.number().int().nonnegative().nullable(),
  breastfeeding: z.boolean(),
  /** Primary presenting concern, e.g. "Return to running, 14 weeks postpartum" */
  condition: z.string(),
  goal: z.string(),
  status: clientStatusSchema,
  startedOn: z.string(),
});
export type Client = z.infer<typeof clientSchema>;

// ---------------------------------------------------------------------------
// Exercise library & programming
// ---------------------------------------------------------------------------

export const muscleGroupSchema = z.enum([
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'core',
  'hips',
  'neck',
  'full_body',
]);
export type MuscleGroup = z.infer<typeof muscleGroupSchema>;

export const exerciseSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  /** Coaching cues shown to the client on the session screen */
  cues: z.array(z.string()),
  muscleGroups: z.array(muscleGroupSchema),
  equipment: z.string(),
  videoPath: z.string().nullable(),
  /** null coachId = part of the seeded public library */
  coachId: z.string().nullable(),
  /** Rehab-oriented exercises surface differently in the builder */
  isRehab: z.boolean(),
});
export type Exercise = z.infer<typeof exerciseSchema>;

/** What the coach prescribed. Never mutated by client activity. */
export const programItemSchema = z.object({
  id: z.string(),
  exerciseId: z.string(),
  order: z.number().int().nonnegative(),
  /** Items sharing a block letter are performed as a superset */
  block: z.string(),
  sets: z.number().int().positive(),
  /** Free text to allow ranges: "8-10", "AMRAP", "30s" */
  reps: z.string(),
  targetLoadKg: z.number().nonnegative().nullable(),
  targetRpe: z.number().min(1).max(10).nullable(),
  tempo: z.string().nullable(),
  restSec: z.number().int().nonnegative(),
  notes: z.string().nullable(),
});
export type ProgramItem = z.infer<typeof programItemSchema>;

export const programDaySchema = z.object({
  id: z.string(),
  programId: z.string(),
  weekNo: z.number().int().positive(),
  dayNo: z.number().int().min(1).max(7),
  title: z.string(),
  items: z.array(programItemSchema),
});
export type ProgramDay = z.infer<typeof programDaySchema>;

export const programSchema = z.object({
  id: z.string(),
  coachId: z.string(),
  name: z.string().min(1),
  description: z.string(),
  durationWeeks: z.number().int().positive(),
  isTemplate: z.boolean(),
  days: z.array(programDaySchema),
});
export type Program = z.infer<typeof programSchema>;

// ---------------------------------------------------------------------------
// Performance — what actually happened
// ---------------------------------------------------------------------------

export const sessionStatusSchema = z.enum(['scheduled', 'in_progress', 'completed', 'skipped']);
export type SessionStatus = z.infer<typeof sessionStatusSchema>;

/** 0-10 numeric pain rating scale — the clinical backbone of this app. */
export const painScoreSchema = z.number().int().min(0).max(10);

export const setLogSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  programItemId: z.string().nullable(),
  exerciseId: z.string(),
  setIndex: z.number().int().nonnegative(),
  reps: z.number().int().nonnegative(),
  weightKg: z.number().nonnegative(),
  rpe: z.number().min(1).max(10).nullable(),
  painScore: painScoreSchema.nullable(),
  completed: z.boolean(),
  loggedAt: z.string(),
});
export type SetLog = z.infer<typeof setLogSchema>;

export const disciplineSchema = z.enum(['strength', 'run', 'mobility', 'rehab']);
export type Discipline = z.infer<typeof disciplineSchema>;

export const sessionSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  discipline: disciplineSchema.default('strength'),
  programDayId: z.string().nullable(),
  title: z.string(),
  scheduledDate: z.string(),
  status: sessionStatusSchema,
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  durationSec: z.number().int().nonnegative().nullable(),
  sessionRpe: z.number().min(1).max(10).nullable(),
  painBefore: painScoreSchema.nullable(),
  painAfter: painScoreSchema.nullable(),
  clientNotes: z.string().nullable(),
  coachFeedback: z.string().nullable(),
});
export type Session = z.infer<typeof sessionSchema>;

// ---------------------------------------------------------------------------
// Vitals — one tall table, never a column per metric
// ---------------------------------------------------------------------------

export const metricTypeSchema = z.enum([
  'weight_kg',
  'body_fat_pct',
  'waist_cm',
  'resting_hr',
  'hrv_ms',
  'bp_systolic',
  'bp_diastolic',
  'spo2_pct',
  'sleep_min',
  'steps',
  'vo2max',
]);
export type MetricType = z.infer<typeof metricTypeSchema>;

export const metricSourceSchema = z.enum(['manual', 'healthkit', 'coach']);
export type MetricSource = z.infer<typeof metricSourceSchema>;

export const metricSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  recordedAt: z.string(),
  type: metricTypeSchema,
  value: z.number(),
  source: metricSourceSchema,
  /** HealthKit sample UUID — makes re-sync idempotent */
  externalId: z.string().nullable(),
});
export type Metric = z.infer<typeof metricSchema>;

export const METRIC_META: Record<MetricType, { label: string; unit: string; decimals: number }> = {
  weight_kg: { label: 'Weight', unit: 'kg', decimals: 1 },
  body_fat_pct: { label: 'Body fat', unit: '%', decimals: 1 },
  waist_cm: { label: 'Waist', unit: 'cm', decimals: 1 },
  resting_hr: { label: 'Resting HR', unit: 'bpm', decimals: 0 },
  hrv_ms: { label: 'HRV', unit: 'ms', decimals: 0 },
  bp_systolic: { label: 'BP systolic', unit: 'mmHg', decimals: 0 },
  bp_diastolic: { label: 'BP diastolic', unit: 'mmHg', decimals: 0 },
  spo2_pct: { label: 'SpO₂', unit: '%', decimals: 0 },
  sleep_min: { label: 'Sleep', unit: 'min', decimals: 0 },
  steps: { label: 'Steps', unit: '', decimals: 0 },
  vo2max: { label: 'VO₂ max', unit: 'ml/kg/min', decimals: 1 },
};

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export const macrosSchema = z.object({
  kcal: z.number().nonnegative(),
  proteinG: z.number().nonnegative(),
  carbsG: z.number().nonnegative(),
  fatG: z.number().nonnegative(),
});
export type Macros = z.infer<typeof macrosSchema>;

export const nutritionTargetSchema = macrosSchema.extend({
  id: z.string(),
  clientId: z.string(),
  effectiveFrom: z.string(),
  fiberG: z.number().nonnegative().nullable(),
  notes: z.string().nullable(),
});
export type NutritionTarget = z.infer<typeof nutritionTargetSchema>;

export const mealSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
export type Meal = z.infer<typeof mealSchema>;

export const nutritionLogSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  loggedOn: z.string(),
  meal: mealSchema,
  foodName: z.string(),
  quantityG: z.number().positive(),
  macros: macrosSchema,
});
export type NutritionLog = z.infer<typeof nutritionLogSchema>;

// ---------------------------------------------------------------------------
// Coach-facing derived state
// ---------------------------------------------------------------------------

export const alertKindSchema = z.enum([
  'missed_sessions',
  'high_pain',
  'load_spike',
  'inactive',
  'weight_trend',
  'nutrition_off_target',
]);
export type AlertKind = z.infer<typeof alertKindSchema>;

export const alertSeveritySchema = z.enum(['info', 'warn', 'critical']);
export type AlertSeverity = z.infer<typeof alertSeveritySchema>;

export interface ClientAlert {
  kind: AlertKind;
  severity: AlertSeverity;
  message: string;
}

/**
 * Nightly rollup per client — powers the roster in a single query rather than
 * forty aggregations at render time.
 */
export interface ClientRollup {
  clientId: string;
  adherence7d: number;
  adherence28d: number;
  sessionsCompleted7d: number;
  sessionsScheduled7d: number;
  lastActivityAt: string | null;
  avgPain7d: number | null;
  painTrend: 'improving' | 'stable' | 'worsening';
  weightDelta28dKg: number | null;
  volumeLoad7d: number;
  acwr: number | null;
  nutritionAdherence7d: number | null;
  alerts: ClientAlert[];
}
