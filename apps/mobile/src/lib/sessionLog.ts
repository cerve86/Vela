import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FuelCheck } from '@vela/shared';
import { supabase } from './supabase';
import { notifyCoach } from './integrations';
import { celebrate } from '@/lib/mascot';

/**
 * One session's life on the phone: what she said before, the clock, and the report after.
 *
 * No set ticking: the physio asked for feedback after, not a checklist during. What she
 * says before the run is written at once — it is the gate, and it raises the coach's flags
 * — and kept on the device as well, so a session started without signal still sends it
 * with the report. Nothing about the run itself is sent until she reports.
 */

export type SendState = 'idle' | 'sending' | 'sent' | 'failed';

export interface Before {
  readiness: number;
  painBefore: number | null;
  painLocation: string | null;
  pfFlag: boolean | null;
  acute: string | null;
  /** The automatic tier the readiness tap chose, when it trimmed the day. */
  adjustedTo: 'reduced' | null;
}

export interface After {
  rpe: number;
  completion: 'all' | 'some' | 'none';
  painAfter: number | null;
  painLocation: string | null;
  /** The fuelling check, after a session that had a fuel card. */
  fuel?: FuelCheck | null;
}

interface Stored {
  startedAt: number;
  before: Before;
}

const key = (sessionId: string) => `vela.session.v2.${sessionId}`;

function beforeColumns(b: Before) {
  return {
    readiness_before: b.readiness,
    pain_before: b.painBefore,
    pain_location: b.painLocation,
    pf_flag: b.pfFlag,
    acute_symptom: b.acute,
    ...(b.adjustedTo ? { adjusted_to: b.adjustedTo } : {}),
  };
}

export function useSessionLog(sessionId: string | null) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [before, setBefore] = useState<Before | null>(null);
  const [restored, setRestored] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sendState, setSendState] = useState<SendState>('idle');
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    AsyncStorage.getItem(key(sessionId))
      .then((raw) => {
        if (cancelled || !raw) return;
        const s = JSON.parse(raw) as Stored;
        setStartedAt(s.startedAt ?? null);
        setBefore(s.before ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRestored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    if (startedAt === null) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  /**
   * What she said before the run: written now, because it is the gate and it raises the
   * coach's flags. An acute symptom holds the session instead of starting it.
   */
  const begin = useCallback(
    async (b: Before): Promise<void> => {
      if (!sessionId) return;
      const now = Date.now();
      setBefore(b);
      if (!b.acute) setStartedAt(now);
      void AsyncStorage.setItem(
        key(sessionId),
        JSON.stringify({ startedAt: now, before: b }),
      ).catch(() => {});
      const { error } = await supabase
        .from('sessions')
        .update({
          ...beforeColumns(b),
          ...(b.acute
            ? { status: 'skipped', completion: 'none' }
            : { status: 'in_progress', started_at: new Date(now).toISOString() }),
        })
        .eq('id', sessionId)
        .in('status', ['scheduled', 'in_progress']);
      if (!error) void notifyCoach();
    },
    [sessionId],
  );

  /** The report: how hard, how much, how it feels now. Sent once; kept until it lands. */
  const send = useCallback(
    async (a: After) => {
      if (!sessionId) return;
      setSendState('sending');
      setSendError(null);
      const { error } = await supabase
        .from('sessions')
        .update({
          ...(before ? beforeColumns(before) : {}),
          status: a.completion === 'none' ? 'skipped' : 'completed',
          completed_at: new Date().toISOString(),
          session_rpe: a.rpe,
          completion: a.completion,
          pain_after: a.painAfter,
          ...(a.painLocation ? { pain_location: a.painLocation } : {}),
          ...(a.fuel
            ? {
                fuel_followed: a.fuel.followed,
                fuel_enough: a.fuel.enough,
                fuel_gut: a.fuel.gut,
                fuel_barrier: a.fuel.barrier,
              }
            : {}),
          duration_sec: startedAt === null ? null : Math.round((Date.now() - startedAt) / 1000),
        })
        .eq('id', sessionId);
      if (error) {
        setSendState('failed');
        setSendError(error.message);
        return;
      }
      setSendState('sent');
      if (a.completion !== 'none') celebrate('session');
      void notifyCoach();
      void AsyncStorage.removeItem(key(sessionId)).catch(() => {});
    },
    [sessionId, before, startedAt],
  );

  return {
    restored,
    started: startedAt !== null,
    before,
    begin,
    elapsed,
    send,
    sendState,
    sendError,
  };
}

/** "12:05" from seconds. */
export function clock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
