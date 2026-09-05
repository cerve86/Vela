import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { listMetrics } from '@vela/api';
import {
  baseline,
  peakOf,
  recovery,
  strain,
  type Readiness,
  type Recovery,
  type Strain,
} from '@vela/shared';
import { supabase } from './supabase';
import { useSession } from './session';
import { subscribeHealthSync } from './healthSync';
import { addDays, localDay, today } from './data';

/**
 * One window for everything: the baselines recovery reads against and the peak strain is
 * scaled by. There used to be a second, shorter constant for HRV alone, with a comment
 * claiming it covered sleep as well. One number, one meaning.
 */
const WINDOW_DAYS = 28;

interface Vitality {
  recovery: Recovery;
  strain: Strain;
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * The two numbers on the Today band, assembled from what is actually recorded.
 *
 * Both are relative to her: sleep and HRV against her own recent nights, today's work
 * against her own busiest recent day. Nothing here compares her to anybody, which for a
 * postpartum cohort is the only defensible choice — there is no population baseline worth
 * having, and a number implying one would be read as clinical when it is not.
 *
 * `readiness` comes from the caller rather than being fetched again: Today already holds the
 * daily read, and two independent fetches of the same thing could disagree on screen.
 */
export function useVitality(readiness: Readiness | null): Vitality {
  const { client } = useSession();
  const [metrics, setMetrics] = useState<{ recordedAt: string; value: number; type: string }[]>([]);
  const [volume, setVolume] = useState<{ date: string; done: number; planned: number }[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Which fetch is allowed to write.
   *
   * Focus, a sync landing, and pull-to-refresh can all call `load` within a second of each
   * other, and a slow response arriving after a fast one would overwrite fresh rows with
   * stale ones. The counter is the same guard `useAsync` in data.ts already has; this hook
   * simply never had it.
   */
  const generation = useRef(0);

  const todayIso = today();

  const load = useCallback(async () => {
    if (!client) {
      setLoading(false);
      return;
    }
    const mine = ++generation.current;

    const from = addDays(todayIso, -WINDOW_DAYS);

    const [rows, sessions] = await Promise.all([
      listMetrics(supabase, {
        clientId: client.id,
        // One read for everything the night and the day are made of.
        types: [
          'sleep_min',
          'sleep_deep_min',
          'sleep_rem_min',
          'sleep_awake_min',
          'active_energy_kcal',
          'cardio_load',
          'resting_hr',
          'respiratory_rate',
          'hrv_ms',
        ],
        since: from,
      }),
      supabase
        .from('sessions')
        .select('scheduled_date, sets_done, sets_planned, status')
        .gte('scheduled_date', from)
        .lte('scheduled_date', todayIso),
    ]);

    if (generation.current !== mine) return;

    setMetrics(rows.map((m) => ({ recordedAt: m.recordedAt, value: m.value, type: m.type })));
    setVolume(
      (sessions.data ?? []).map((s) => ({
        date: s.scheduled_date,
        done: s.sets_done ?? 0,
        planned: s.sets_planned ?? 0,
      })),
    );
    setLoading(false);
  }, [client, todayIso]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  /**
   * Redraw when a foreground sync lands rows.
   *
   * Focus alone is not enough here: coming back from the background does not re-focus the
   * screen, so the dials would keep showing the pre-sync figures — which for the first
   * open of the day is the difference between "—" and last night's sleep.
   */
  useEffect(() => subscribeHealthSync(() => void load()), [load]);

  const value = useMemo(() => {
    /**
     * "Last night" is the reading recorded today, not simply the newest one.
     *
     * Sleep is keyed to the morning you woke, so today's row is last night. Taking the
     * newest row regardless would quietly show Friday's sleep all weekend, which is worse
     * than showing nothing — the number would look live and be three days stale.
     */
    /** Everything of one type, summed into the local day it belongs to. */
    const byType = (type: string) => {
      const map = new Map<string, number>();
      for (const m of metrics) {
        if (m.type !== type) continue;
        map.set(localDay(m.recordedAt), (map.get(localDay(m.recordedAt)) ?? 0) + m.value);
      }
      return map;
    };

    /**
     * The same, averaged rather than summed.
     *
     * Minutes of sleep add up; a heart rate does not. The import writes one row per metric
     * per day, so in practice these agree — until a manual entry lands beside the imported
     * one, and then summing turns two readings of 55 bpm into a resting rate of 110 and a
     * recovery score built on it.
     */
    const meanByType = (type: string) => {
      const acc = new Map<string, { total: number; n: number }>();
      for (const m of metrics) {
        if (m.type !== type) continue;
        const day = localDay(m.recordedAt);
        const e = acc.get(day) ?? { total: 0, n: 0 };
        e.total += m.value;
        e.n += 1;
        acc.set(day, e);
      }
      return new Map([...acc].map(([day, v]) => [day, v.total / v.n] as const));
    };

    const totals = byType('sleep_min');
    const deep = byType('sleep_deep_min');
    const rem = byType('sleep_rem_min');
    const awake = byType('sleep_awake_min');
    const energy = byType('active_energy_kcal');
    const load = byType('cardio_load');
    const resting = meanByType('resting_hr');
    const breathing = meanByType('respiratory_rate');
    const hrv = meanByType('hrv_ms');

    /** Deep plus REM — the part of a night that does the repairing. */
    const restorativeOn = (day: string) =>
      deep.has(day) || rem.has(day) ? (deep.get(day) ?? 0) + (rem.get(day) ?? 0) : null;

    const lastSleep = totals.get(todayIso) ?? null;
    const lastHrv = hrv.get(todayIso) ?? null;

    /**
     * Minutes awake last night. Zero when the watch reported stages and no wakes.
     *
     * A watch that reports stages reports every wake, so on a night with none there is
     * simply no awake row — and "no row" used to read as "unknown", which dropped the
     * efficiency signal for exactly the nights that deserved full marks on it. A night
     * with five minutes awake scored ~100; a night with none scored nothing.
     */
    const awakeToday = awake.get(todayIso) ?? (restorativeOn(todayIso) !== null ? 0 : null);

    /**
     * Resting heart rate: today's figure if Apple has written it, otherwise yesterday's.
     *
     * Apple computes its resting rate per calendar day and stamps it within that day, so
     * first thing in the morning today's row does not exist yet and the most recent
     * estimate is yesterday's. Reading only today's key meant the signal vanished for the
     * hours she was most likely to look. The baseline excludes whichever day is used.
     *
     * The stamp semantics are inferred from exported Health data, not verified on a Watch
     * in this codebase. If a real device shows today's row landing early, the fallback
     * simply never fires.
     */
    const restingDay = resting.has(todayIso) ? todayIso : addDays(todayIso, -1);
    const lastResting = resting.get(restingDay) ?? null;

    // Baselines exclude today, so a bad night is measured against normal rather than
    // dragging its own yardstick down with it — and they need enough nights to be a
    // baseline at all. See MIN_BASELINE_NIGHTS.
    const sleepBaseline = baselineExcluding(totals, todayIso);
    const restorativeBaseline = baseline(
      [...totals.keys()]
        .filter((d) => d !== todayIso)
        .map(restorativeOn)
        .filter((v): v is number => v !== null),
    );
    const hrvBaseline = baselineExcluding(hrv, todayIso);

    const byDay = new Map<string, { done: number; planned: number }>();
    for (const v of volume) {
      const entry = byDay.get(v.date) ?? { done: 0, planned: 0 };
      entry.done += v.done;
      entry.planned += v.planned;
      byDay.set(v.date, entry);
    }

    const todayVolume = byDay.get(todayIso) ?? { done: 0, planned: 0 };

    /** A daily series with today removed, as a plain list — the shape every peak wants. */
    const history = (series: Map<string, number>) =>
      [...series.entries()].filter(([d]) => d !== todayIso).map(([, v]) => v);

    // Peaks are a high percentile of her recent days, not the single largest one. One race
    // used to set the ceiling for a month and the dial never filled. See `peakOf`.
    const peak = peakOf(history(new Map([...byDay].map(([d, v]) => [d, v.done]))));

    return {
      recovery: recovery({
        sleepMinutes: lastSleep,
        sleepBaselineMinutes: sleepBaseline,
        readiness,
        hrvMs: lastHrv,
        hrvBaselineMs: hrvBaseline,
        restorativeMinutes: restorativeOn(todayIso),
        restorativeBaselineMinutes: restorativeBaseline,
        awakeMinutes: awakeToday,
        restingHr: lastResting,
        restingHrBaseline: baselineExcluding(resting, restingDay),
        // Filed to the wake morning by the sync, like sleep, so today's key is last night.
        respiratoryRate: breathing.get(todayIso) ?? null,
        respiratoryRateBaseline: baselineExcluding(breathing, todayIso),
      }),
      strain: strain({
        setsDone: todayVolume.done,
        setsPlanned: todayVolume.planned,
        peakSets: peak,
        activeEnergy: energy.get(todayIso) ?? null,
        // Her own hardest recent day, today excluded so it cannot become its own ceiling.
        peakActiveEnergy: peakOf(history(energy)),
        /**
         * What a normal training day costs her, in kcal.
         *
         * The median of days she completed a session, which is the only honest target once
         * the currency is energy: the plan is written in sets and nothing converts sets to
         * calories for a particular person. Days she trained are the evidence.
         */
        typicalTrainingEnergy: baseline(
          [...byDay.entries()]
            .filter(([d, v]) => d !== todayIso && v.done > 0 && energy.has(d))
            .map(([d]) => energy.get(d)!),
          3,
        ),
        /**
         * The same three questions again, in the currency strain now prefers: what today
         * came to, her own hardest recent day, and what a day she trained normally costs.
         *
         * Today is excluded from the peak for the reason it always was — a hard morning must
         * not become its own ceiling and read as 100% before lunch.
         */
        cardioLoad: load.get(todayIso) ?? null,
        peakCardioLoad: peakOf(history(load)),
        typicalTrainingLoad: baseline(
          [...byDay.entries()]
            .filter(([d, v]) => d !== todayIso && v.done > 0 && load.has(d))
            .map(([d]) => load.get(d)!),
          // A target needs fewer days than a baseline: three trained days is already a
          // sensible "usual", and asking for five keeps the target off the dial for a
          // fortnight of a programme that trains three times a week.
          3,
        ),
      }),
    };
  }, [metrics, volume, readiness, todayIso]);

  return { ...value, loading, reload: load };
}

/**
 * A baseline from a daily series, with one day left out.
 *
 * The excluded day is the one being scored: a raised resting rate this morning must be
 * measured against her normal, not against a normal it has just helped to define. `baseline`
 * then insists on enough remaining days for the median to mean anything, and returns null
 * otherwise — which drops the signal rather than scoring it against a guess.
 */
function baselineExcluding(series: Map<string, number>, day: string): number | null {
  return baseline([...series.entries()].filter(([d]) => d !== day).map(([, v]) => v));
}
