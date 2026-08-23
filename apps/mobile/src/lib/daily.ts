import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  currentRead,
  lockDailyRead,
  listDailyReads,
  loggedWindows,
  type DailyRead,
  type ReadWindow,
} from '@vela/api';
import { supabase } from './supabase';
import { useSession } from './session';
import { today } from './data';

/**
 * The daily read: readiness, and the symptom that overrides it.
 *
 * This was device-only while there was no table for it. There is one now, so it reaches the
 * coach — which matters more here than for most data, because readiness is what gates the
 * prescription. The one person qualified to judge whether that gating is working was the
 * one person who could not see the input.
 *
 * The shape is unchanged from the local version on purpose: `current`, `lock`, `strip`,
 * `openWindow` and `allLogged` mean exactly what they did, so the screens reading them did
 * not have to change.
 */

export const WINDOWS = [
  { key: 'morning', label: 'Morning', until: 12 },
  { key: 'midday', label: 'Midday', until: 17 },
  { key: 'evening', label: 'Evening', until: 24 },
] as const;

export type WindowKey = ReadWindow;

/** Readiness 0-4, indexing `tide` in the shared tokens. */
export type Tide = 0 | 1 | 2 | 3 | 4;

/**
 * Which window is accepting a read right now.
 *
 * Wall-clock, not "the next empty one": three reads a day land in three fixed windows, and
 * letting someone fill the morning slot at 9pm turns a spot-check into a diary entry
 * written from memory.
 */
export function openWindow(now = new Date()): WindowKey {
  const h = now.getHours();
  return (WINDOWS.find((w) => h < w.until) ?? WINDOWS[WINDOWS.length - 1]!).key;
}

export function useDailyRead() {
  const { client } = useSession();
  const iso = today();

  const [reads, setReads] = useState<DailyRead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!client) {
      setLoading(false);
      return;
    }
    const rows = await listDailyReads(supabase, { clientId: client.id, from: iso, to: iso });
    setReads(rows);
    setLoading(false);
  }, [client, iso]);

  /**
   * Reloads whenever the screen using this comes into focus, not just on mount.
   *
   * A plain effect keyed on `[client, iso]` fires once and never again — neither changes
   * when you navigate. Locking a read on the mood screen refetched that screen's copy of
   * this hook and left every other screen holding what it fetched on mount, so the dial,
   * the greeting and the read tile all went on saying "not logged" after the write had
   * landed. The read looked like it had not saved when it had.
   *
   * This lives in the hook rather than in each screen's focus effect so a new screen cannot
   * forget it. `useFocusEffect` also fires on mount, so it replaces the effect outright.
   */
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const logged = loggedWindows(reads, iso);
  const inForce = currentRead(reads, iso);

  /**
   * Locks the currently open window.
   *
   * Returns `ok: false` when the window already holds a value — including when the database
   * says so rather than this device. Two phones, or a reinstall mid-day, would both have
   * defeated the old local-only check.
   */
  const lock = useCallback(
    async (value: Tide, symptom?: string) => {
      const w = openWindow();
      if (!client) return { ok: false as const, window: w };
      if (logged.includes(w)) return { ok: false as const, window: w };

      const { error, alreadyLogged } = await lockDailyRead(supabase, {
        clientId: client.id,
        readOn: iso,
        window: w,
        readiness: value,
        symptom: symptom ?? inForce?.symptom ?? 'Nothing',
      });

      await load();
      if (error || alreadyLogged) return { ok: false as const, window: w };
      return { ok: true as const, window: w };
    },
    [client, iso, logged, inForce, load],
  );

  /**
   * The symptom in force.
   *
   * Written as part of a read rather than on its own, because a symptom without a moment
   * attached is not much use to a physiotherapist. Setting one before a session records it
   * against the open window if that window is still free; otherwise the session's own
   * before-score carries it, which is where the coach reads it from anyway.
   */
  const setSymptom = useCallback(
    async (symptom: string, readiness?: Tide) => {
      const w = openWindow();
      if (!client || logged.includes(w)) return;
      await lockDailyRead(supabase, {
        clientId: client.id,
        readOn: iso,
        window: w,
        readiness: readiness ?? inForce?.readiness ?? 2,
        symptom,
      });
      await load();
    },
    [client, iso, logged, inForce, load],
  );

  return {
    loading,
    /** Kept for call-site compatibility: the reads for today, plus the symptom in force. */
    read: {
      reads: Object.fromEntries(reads.map((r) => [r.window, r.readiness])) as Partial<
        Record<WindowKey, Tide>
      >,
      symptom: inForce?.symptom ?? 'Nothing',
      painBefore: 0,
    },
    /**
     * The readiness Today acts on: the most recent locked window.
     *
     * `null` when nothing has been logged — Today must be able to tell "not asked yet" from
     * "asked, and the answer was Depleted", because one prompts and the other prescribes.
     */
    current: (inForce?.readiness ?? null) as Tide | null,
    /**
     * Which window `current` came from — not the same as `openWindow`.
     *
     * At six in the evening the open window is "evening" while the read in force may still
     * be the midday one. Labelling the read with the open window would attribute it to a
     * slot she has not filled yet.
     */
    currentWindow: (inForce?.window ?? null) as WindowKey | null,
    lock,
    setSymptom,
    openWindow: openWindow(),
    allLogged: logged.length === WINDOWS.length,
    /** One slot per window, in order, for the tile strip. */
    strip: WINDOWS.map(
      (w) => (reads.find((r) => r.window === w.key)?.readiness ?? null) as Tide | null,
    ),
    reload: load,
  };
}
