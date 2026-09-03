import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { listMetrics } from '@vela/api';
import { median, recovery, strain, type Readiness, type Recovery, type Strain } from '@vela/shared';
import { supabase } from './supabase';
import { useSession } from './session';
import { subscribeHealthSync } from './healthSync';
import { addDays, localDay, today } from './data';

/** Nights of history used for the sleep and HRV baselines. */
const BASELINE_DAYS = 21;

/** Window for "her own hardest day", which is the scale strain is read against. */
const PEAK_DAYS = 28;

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
  const [sleep, setSleep] = useState<{ recordedAt: string; value: number; type: string }[]>([]);
  const [hrv, setHrv] = useState<{ recordedAt: string; value: number }[]>([]);
  const [volume, setVolume] = useState<{ date: string; done: number; planned: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const todayIso = today();

  const load = useCallback(async () => {
    if (!client) {
      setLoading(false);
      return;
    }

    const from = addDays(todayIso, -PEAK_DAYS);

    const [sleepRows, hrvRows, sessions] = await Promise.all([
      listMetrics(supabase, {
        clientId: client.id,
        // One read for everything the night and the day are made of, rather than five.
        types: [
          'sleep_min',
          'sleep_deep_min',
          'sleep_rem_min',
          'sleep_awake_min',
          'active_energy_kcal',
          'cardio_load',
          'resting_hr',
          'respiratory_rate',
        ],
        since: addDays(todayIso, -PEAK_DAYS),
      }),
      listMetrics(supabase, { clientId: client.id, types: ['hrv_ms'], since: addDays(todayIso, -BASELINE_DAYS) }),
      supabase
        .from('sessions')
        .select('scheduled_date, sets_done, sets_planned, status')
        .gte('scheduled_date', from)
        .lte('scheduled_date', todayIso),
    ]);

    setSleep(sleepRows.map((m) => ({ recordedAt: m.recordedAt, value: m.value, type: m.type })));
    setHrv(hrvRows.map((m) => ({ recordedAt: m.recordedAt, value: m.value })));
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
      for (const m of sleep) {
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
      for (const m of sleep) {
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

    /** Deep plus REM — the part of a night that does the repairing. */
    const restorativeOn = (day: string) =>
      deep.has(day) || rem.has(day) ? (deep.get(day) ?? 0) + (rem.get(day) ?? 0) : null;

    const lastSleep = totals.get(todayIso) ?? null;
    const lastHrv = hrv.find((h) => localDay(h.recordedAt) === todayIso)?.value ?? null;

    // Baselines exclude today, so a bad night is measured against normal rather than
    // dragging its own yardstick down with it.
    const sleepBaseline = median(
      [...totals.entries()].filter(([d]) => d !== todayIso).map(([, v]) => v),
    );

    const restorativeBaseline = median(
      [...totals.keys()]
        .filter((d) => d !== todayIso)
        .map(restorativeOn)
        .filter((v): v is number => v !== null),
    );
    const hrvBaseline = median(
      hrv.filter((h) => localDay(h.recordedAt) !== todayIso).map((h) => h.value),
    );

    const byDay = new Map<string, { done: number; planned: number }>();
    for (const v of volume) {
      const entry = byDay.get(v.date) ?? { done: 0, planned: 0 };
      entry.done += v.done;
      entry.planned += v.planned;
      byDay.set(v.date, entry);
    }

    const todayVolume = byDay.get(todayIso) ?? { done: 0, planned: 0 };
    const peak = Math.max(0, ...[...byDay.entries()].filter(([d]) => d !== todayIso).map(([, v]) => v.done));

    return {
      recovery: recovery({
        sleepMinutes: lastSleep,
        sleepBaselineMinutes: sleepBaseline,
        readiness,
        hrvMs: lastHrv,
        hrvBaselineMs: hrvBaseline,
        restorativeMinutes: restorativeOn(todayIso),
        restorativeBaselineMinutes: restorativeBaseline,
        // Keyed to today like the rest of the night's readings: sleep is filed under the
        // morning she woke, and so are the vitals measured through it.
        awakeMinutes: awake.get(todayIso) ?? null,
        restingHr: resting.get(todayIso) ?? null,
        restingHrBaseline: baselineExcludingToday(resting, todayIso),
        respiratoryRate: breathing.get(todayIso) ?? null,
        respiratoryRateBaseline: baselineExcludingToday(breathing, todayIso),
      }),
      strain: strain({
        setsDone: todayVolume.done,
        setsPlanned: todayVolume.planned,
        peakSets: peak,
        activeEnergy: energy.get(todayIso) ?? null,
        // Her own hardest recent day, today excluded so it cannot become its own ceiling.
        peakActiveEnergy: Math.max(
          0,
          ...[...energy.entries()].filter(([d]) => d !== todayIso).map(([, v]) => v),
        ),
        /**
         * What a normal training day costs her, in kcal.
         *
         * The median of days she completed a session, which is the only honest target once
         * the currency is energy: the plan is written in sets and nothing converts sets to
         * calories for a particular person. Days she trained are the evidence.
         */
        typicalTrainingEnergy: median(
          [...byDay.entries()]
            .filter(([d, v]) => d !== todayIso && v.done > 0 && energy.has(d))
            .map(([d]) => energy.get(d)!),
        ),
        /**
         * The same three questions again, in the currency strain now prefers: what today
         * came to, her own hardest recent day, and what a day she trained normally costs.
         *
         * Today is excluded from the peak for the reason it always was — a hard morning must
         * not become its own ceiling and read as 100% before lunch.
         */
        cardioLoad: load.get(todayIso) ?? null,
        peakCardioLoad: Math.max(
          0,
          ...[...load.entries()].filter(([d]) => d !== todayIso).map(([, v]) => v),
        ),
        typicalTrainingLoad: median(
          [...byDay.entries()]
            .filter(([d, v]) => d !== todayIso && v.done > 0 && load.has(d))
            .map(([d]) => load.get(d)!),
        ),
      }),
    };
  }, [sleep, hrv, volume, readiness, todayIso]);

  return { ...value, loading, reload: load };
}

/**
 * The median of a daily series, with today left out.
 *
 * Today is excluded for the reason every baseline here excludes it: a raised resting rate
 * this morning must be measured against her normal, not against a normal it has just helped
 * to define. With a short history that is a handful of days, which is exactly when the
 * comparison is weakest — and why a missing baseline drops the signal from the score
 * entirely rather than scoring it against a guess.
 */
function baselineExcludingToday(series: Map<string, number>, todayIso: string): number | null {
  return median([...series.entries()].filter(([d]) => d !== todayIso).map(([, v]) => v));
}
