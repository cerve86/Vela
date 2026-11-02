import type { createServerSupabase } from '@/lib/supabase/server';

type Supabase = Awaited<ReturnType<typeof createServerSupabase>>;

export type CompanionVerdict = 'go' | 'ease' | 'easy' | 'rest';
export type ShareResult = 'clear' | 'watch' | 'flag';

export interface CompanionCheck {
  logDate: string;
  sleep: number | null;
  legs: number | null;
  energy: number | null;
  lastSession: number | null;
  verdict: CompanionVerdict | null;
  hrv: number | null;
  rhr: number | null;
}

export interface NutritionShare {
  sharedAt: string;
  energy: ShareResult;
  iron: ShareResult;
  vitaminD: ShareResult;
  periodsFlag: boolean;
}

export interface CompanionData {
  checks: CompanionCheck[];
  share: NutritionShare | null;
  raceName: string | null;
  raceDate: string | null;
  /** A read failed: the card says so rather than showing "nothing yet" for data it never got. */
  failed: boolean;
}

const VERDICTS = new Set(['go', 'ease', 'easy', 'rest']);
const RESULTS = new Set(['clear', 'watch', 'flag']);
const result = (v: string): ShareResult => (RESULTS.has(v) ? (v as ShareResult) : 'watch');

/**
 * What she has told the companion, as her coach may read it: the morning checks since
 * `since`, the latest nutrition results she chose to share, and the race the coach set.
 *
 * RLS decides all three — the coach reads only her own athletes' rows — so nothing here
 * filters on coach. A failed read degrades this one card, never the whole overview.
 */
export async function loadCompanion(
  supabase: Supabase,
  clientId: string,
  since: string,
): Promise<CompanionData> {
  const [checks, share, profile] = await Promise.all([
    supabase
      .from('companion_readiness')
      .select('log_date, sleep, legs, energy, last_session, verdict, hrv, rhr')
      .eq('client_id', clientId)
      .gte('log_date', since)
      .order('log_date', { ascending: false }),
    supabase
      .from('companion_nutrition_shares')
      .select('created_at, energy, iron, vitamin_d, periods_flag')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('companion_profiles')
      .select('race_name, race_date')
      .eq('client_id', clientId)
      .maybeSingle(),
  ]);

  return {
    checks: (checks.data ?? []).map((r) => ({
      logDate: r.log_date,
      sleep: r.sleep,
      legs: r.legs,
      energy: r.energy,
      lastSession: r.last_session,
      verdict: r.verdict && VERDICTS.has(r.verdict) ? (r.verdict as CompanionVerdict) : null,
      hrv: r.hrv,
      rhr: r.rhr,
    })),
    share: share.data
      ? {
          sharedAt: share.data.created_at,
          energy: result(share.data.energy),
          iron: result(share.data.iron),
          vitaminD: result(share.data.vitamin_d),
          periodsFlag: share.data.periods_flag,
        }
      : null,
    raceName: profile.data?.race_name ?? null,
    raceDate: profile.data?.race_date ?? null,
    failed: Boolean(checks.error || share.error || profile.error),
  };
}
