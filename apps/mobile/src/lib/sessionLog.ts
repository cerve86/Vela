import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SessionPlanItem } from '@vela/api';
import { supabase } from './supabase';

/**
 * State for one logged session: which sets are done, how long it has run, and the send.
 *
 * Persisted to the device as it goes. A session is the one screen someone is guaranteed to
 * leave mid-way — a phone call, a nappy, the app swapped out for a timer — and coming back
 * to an empty checklist after twenty minutes of work is the kind of thing that stops people
 * logging at all. Nothing is sent until they finish, which is also what makes the flow
 * offline-first by construction rather than by a retry queue.
 */

export type SendState = 'idle' | 'sending' | 'sent' | 'failed';

interface Stored {
  done: Record<string, true>;
  startedAt: number;
  painBefore: number | null;
  symptom: string;
}

const key = (sessionId: string) => `vela.session.${sessionId}`;

/** One set's identity. Index rather than a set id, because sets have no rows of their own. */
export const setKey = (itemId: string, i: number) => `${itemId}:${i}`;

export function useSessionLog(sessionId: string | null, plan: SessionPlanItem[]) {
  const [done, setDone] = useState<Record<string, true>>({});
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [painBefore, setPainBefore] = useState<number | null>(null);
  const [symptom, setSymptom] = useState('Nothing');
  const [restored, setRestored] = useState(false);

  const [elapsed, setElapsed] = useState(0);
  const [rest, setRest] = useState<{ runId: number; remaining: number; total: number; next: string } | null>(
    null,
  );
  const [sendState, setSendState] = useState<SendState>('idle');
  const [sendError, setSendError] = useState<string | null>(null);

  const runId = useRef(0);

  // Restore, once, before anything can be ticked.
  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    AsyncStorage.getItem(key(sessionId))
      .then((raw) => {
        if (cancelled || !raw) return;
        const s = JSON.parse(raw) as Stored;
        setDone(s.done ?? {});
        setStartedAt(s.startedAt ?? null);
        setPainBefore(s.painBefore ?? null);
        setSymptom(s.symptom ?? 'Nothing');
      })
      .catch(() => {
        // An unreadable record is not worth taking the screen down for. Starting fresh
        // loses ticks, which is bad; refusing to open the session is worse.
      })
      .finally(() => {
        if (!cancelled) setRestored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const persist = useCallback(
    (next: Partial<Stored>) => {
      if (!sessionId) return;
      const payload: Stored = {
        done,
        startedAt: startedAt ?? Date.now(),
        painBefore,
        symptom,
        ...next,
      };
      void AsyncStorage.setItem(key(sessionId), JSON.stringify(payload)).catch(() => {});
    },
    [sessionId, done, startedAt, painBefore, symptom],
  );

  /**
   * One interval for both clocks.
   *
   * The elapsed timer and the rest countdown tick together because they tick at the same
   * rate and a second interval buys nothing but drift between them.
   */
  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      setRest((r) => {
        if (!r) return r;
        const remaining = r.remaining - 1;
        return remaining <= 0 ? null : { ...r, remaining };
      });
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const begin = useCallback(
    (pain: number | null, sym: string) => {
      const now = Date.now();
      setStartedAt(now);
      setPainBefore(pain);
      setSymptom(sym);
      persist({ startedAt: now, painBefore: pain, symptom: sym });
    },
    [persist],
  );

  /**
   * Ticks or un-ticks one set.
   *
   * The next state is computed before anything is set, rather than inside a `setDone`
   * updater. An updater has to be pure — React is free to call it more than once for a
   * single update, and in development under StrictMode it does — so writing to storage and
   * starting the rest clock in there would double both: a duplicate write, and a rest timer
   * that restarts the instant it starts.
   */
  const toggle = useCallback(
    (itemId: string, i: number, restSec: number, next: string) => {
      const k = setKey(itemId, i);
      const wasDone = Boolean(done[k]);

      const copy = { ...done };
      if (wasDone) delete copy[k];
      else copy[k] = true;

      setDone(copy);
      persist({ done: copy });

      // Rest starts on the way in only. Un-ticking is a correction, not a completed set.
      if (!wasDone && restSec > 0) {
        runId.current += 1;
        setRest({ runId: runId.current, remaining: restSec, total: restSec, next });
      }
    },
    [done, persist],
  );

  const skipRest = useCallback(() => setRest(null), []);

  const total = plan.reduce((n, i) => n + i.sets, 0);
  const completed = Object.keys(done).length;

  /**
   * Writes the outcome. On failure the state is kept, untouched, so Retry sends the same
   * thing rather than whatever is left after a partial write.
   */
  const send = useCallback(
    async (painAfter: number | null, stopped: boolean) => {
      if (!sessionId) return;
      setSendState('sending');
      setSendError(null);

      const { error } = await supabase
        .from('sessions')
        .update({
          status: stopped && completed === 0 ? 'skipped' : 'completed',
          completed_at: new Date().toISOString(),
          pain_before: painBefore,
          pain_after: painAfter,
          // The volume, which used to die with the local scratchpad. Without it "completed"
          // meant both every set and one set, and nothing could weigh a day's work.
          sets_planned: total,
          sets_done: completed,
        })
        .eq('id', sessionId);

      if (error) {
        setSendState('failed');
        setSendError(error.message);
        return;
      }

      setSendState('sent');
      // Only now is the local copy redundant.
      void AsyncStorage.removeItem(key(sessionId)).catch(() => {});
    },
    [sessionId, painBefore, completed, total],
  );

  return {
    restored,
    done,
    toggle,
    completed,
    total,
    ratio: total ? completed / total : 0,
    allDone: total > 0 && completed === total,
    started: startedAt !== null,
    begin,
    elapsed,
    rest,
    skipRest,
    painBefore,
    symptom,
    sendState,
    sendError,
    send,
  };
}

/** mm:ss for the header clock. */
export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}
