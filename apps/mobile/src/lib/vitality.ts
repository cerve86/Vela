import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { listMetrics } from '@vela/api';
import { median, recovery, strain, type Readiness, type Recovery, type Strain } from '@vela/shared';
import { supabase } from './supabase';
import { useSession } from './session';
import { addDays, today } from './data';

/** Nights of history used for the sleep and HRV baselines. */
const BASELINE_DAYS = 21;

/** Window for "her own hardest day", which is the scale strain is read against. */
const PEAK_DAYS = 28;

interface Vitality {
  recovery: Recovery;
  strain: Strain;
  loading: boolean;
  reload: () => void;
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
  const [sleep, setSleep] = useState<{ recordedAt: string; value: number }[]>([]);
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
      listMetrics(supabase, { clientId: client.id, types: ['sleep_min'], since: addDays(todayIso, -BASELINE_DAYS) }),
      listMetrics(supabase, { clientId: client.id, types: ['hrv_ms'], since: addDays(todayIso, -BASELINE_DAYS) }),
      supabase
        .from('sessions')
        .select('scheduled_date, sets_done, sets_planned, status')
        .gte('scheduled_date', from)
        .lte('scheduled_date', todayIso),
    ]);

    setSleep(sleepRows.map((m) => ({ recordedAt: m.recordedAt, value: m.value })));
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

  const value = useMemo(() => {
    /**
     * "Last night" is the reading recorded today, not simply the newest one.
     *
     * Sleep is keyed to the morning you woke, so today's row is last night. Taking the
     * newest row regardless would quietly show Friday's sleep all weekend, which is worse
     * than showing nothing — the number would look live and be three days stale.
     */
    const lastSleep = sleep.find((s) => s.recordedAt.slice(0, 10) === todayIso)?.value ?? null;
    const lastHrv = hrv.find((h) => h.recordedAt.slice(0, 10) === todayIso)?.value ?? null;

    // Baselines exclude today, so a bad night is measured against normal rather than
    // dragging its own yardstick down with it.
    const sleepBaseline = median(
      sleep.filter((s) => s.recordedAt.slice(0, 10) !== todayIso).map((s) => s.value),
    );
    const hrvBaseline = median(
      hrv.filter((h) => h.recordedAt.slice(0, 10) !== todayIso).map((h) => h.value),
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
      }),
      strain: strain({
        setsDone: todayVolume.done,
        setsPlanned: todayVolume.planned,
        peakSets: peak,
      }),
    };
  }, [sleep, hrv, volume, readiness, todayIso]);

  return { ...value, loading, reload: () => void load() };
}
