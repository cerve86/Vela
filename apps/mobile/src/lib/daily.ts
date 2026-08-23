import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { today } from './data';

/**
 * The daily read: readiness, and the symptom that overrides it.
 *
 * LOCAL ONLY, DELIBERATELY. There is no table for this yet — the redesign introduces it and
 * no schema has been designed (the handoff says as much). Storing it on the device keeps
 * Today honest and usable now, and makes the gap obvious rather than hiding it behind
 * plausible-looking numbers.
 *
 * What that costs, so nobody is surprised later: the coach cannot see any of it, and it does
 * not survive reinstalling the app. Both are fixed by the same migration — a `daily_reads`
 * table keyed on (client_id, date, window) — at which point this module keeps its shape and
 * swaps AsyncStorage for the API.
 *
 * Keyed by ISO date, so the day rolls over on its own and yesterday's read never presents
 * itself as today's.
 */

export const WINDOWS = [
  { key: 'morning', label: 'Morning', until: 12 },
  { key: 'midday', label: 'Midday', until: 17 },
  { key: 'evening', label: 'Evening', until: 24 },
] as const;

export type WindowKey = (typeof WINDOWS)[number]['key'];

/** Readiness 0-4, indexing `tide` in the shared tokens. */
export type Tide = 0 | 1 | 2 | 3 | 4;

export interface DailyRead {
  /** Window key -> readiness. A window, once locked, is never rewritten. */
  reads: Partial<Record<WindowKey, Tide>>;
  symptom: string;
  painBefore: number;
}

const EMPTY: DailyRead = { reads: {}, symptom: 'Nothing', painBefore: 0 };

const key = (iso: string) => `vela.daily.${iso}`;

/**
 * Which window is accepting a read right now.
 *
 * Wall-clock, not "the next empty one": the design's rule is that three reads a day land in
 * three fixed windows, and letting someone fill the morning slot at 9pm would turn a
 * spot-check into a diary entry written from memory.
 */
export function openWindow(now = new Date()): WindowKey {
  const h = now.getHours();
  return (WINDOWS.find((w) => h < w.until) ?? WINDOWS[WINDOWS.length - 1]!).key;
}

export function useDailyRead() {
  const iso = today();
  const [read, setRead] = useState<DailyRead>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key(iso))
      .then((raw) => {
        if (cancelled) return;
        setRead(raw ? { ...EMPTY, ...(JSON.parse(raw) as DailyRead) } : EMPTY);
      })
      .catch(() => {
        // A corrupt or unreadable entry must not take the screen down with it — an empty
        // read is a correct starting state, and the next write repairs the record.
        if (!cancelled) setRead(EMPTY);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [iso]);

  const persist = useCallback(
    async (next: DailyRead) => {
      setRead(next);
      try {
        await AsyncStorage.setItem(key(iso), JSON.stringify(next));
      } catch {
        // Nothing useful to do here: state is already updated, so the screen is correct for
        // this session even if the write failed. Swallowing beats an alert about storage.
      }
    },
    [iso],
  );

  /** Locks the currently open window. Refuses if it already holds a value. */
  const lock = useCallback(
    (value: Tide) => {
      const w = openWindow();
      if (read.reads[w] !== undefined) return { ok: false as const, window: w };
      void persist({ ...read, reads: { ...read.reads, [w]: value } });
      return { ok: true as const, window: w };
    },
    [read, persist],
  );

  const setSymptom = useCallback(
    (symptom: string, painBefore = read.painBefore) => {
      void persist({ ...read, symptom, painBefore });
    },
    [read, persist],
  );

  const logged = WINDOWS.filter((w) => read.reads[w.key] !== undefined);

  /**
   * The readiness Today acts on: the most recent locked window.
   *
   * `null` when nothing has been logged — Today must be able to tell "not asked yet" from
   * "asked, and the answer was Depleted", because one prompts and the other prescribes.
   */
  const current: Tide | null = logged.length
    ? read.reads[logged[logged.length - 1]!.key] ?? null
    : null;

  return {
    loading,
    read,
    current,
    lock,
    setSymptom,
    openWindow: openWindow(),
    allLogged: logged.length === WINDOWS.length,
    /** One slot per window, in order, for the tile strip. */
    strip: WINDOWS.map((w) => read.reads[w.key] ?? null),
  };
}
