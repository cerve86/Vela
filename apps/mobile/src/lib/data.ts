import { useCallback, useEffect, useState } from 'react';
import {
  currentTarget,
  getSession,
  getSessionPlan,
  listFoodLogs,
  listMetrics,
  listSessions,
  nutritionDays,
  type FoodLogEntry,
  type Metric,
  type MetricType,
  type NutritionDay,
  type NutritionTarget,
  type ScheduledSession,
  type SessionPlanItem,
} from '@vela/api';
import { supabase } from './supabase';
import { useSession } from './session';

/** Local calendar date as YYYY-MM-DD. Sessions are scheduled on dates, not instants,
 *  so a UTC conversion here would show tomorrow's session late at night. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

/** Sunday-based start of the week containing `iso`, to match the week strip. */
export function startOfWeek(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return addDays(iso, -dt.getDay());
}

interface Async<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function useAsync<T>(fn: () => Promise<T>, initial: T, deps: unknown[]): Async<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fn()
      .then((r) => {
        if (!cancelled) {
          setData(r);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, loading, error, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

/** The current week's scheduled sessions, plus today's if there is one. */
export function useWeek() {
  const { client } = useSession();
  const from = startOfWeek(today());
  const to = addDays(from, 6);

  const state = useAsync<ScheduledSession[]>(
    async () => (client ? listSessions(supabase, { clientId: client.id, from, to }) : []),
    [],
    [client?.id, from],
  );

  const todayIso = today();
  return {
    ...state,
    weekStart: from,
    todaySession: state.data.find((s) => s.scheduledDate === todayIso) ?? null,
  };
}

/**
 * Sessions over the last `weeks`, for the attendance grid and the trend.
 *
 * Separate from `useWeek` rather than widening it: Today reloads its week on every focus,
 * and pulling four months of history each time someone taps back from a session would be
 * paid for on the screen that can least afford it.
 */
export function useHistory(weeks = 16) {
  const { client } = useSession();
  const todayIso = today();
  const from = addDays(startOfWeek(todayIso), -(weeks - 1) * 7);

  return useAsync<ScheduledSession[]>(
    async () => (client ? listSessions(supabase, { clientId: client.id, from, to: todayIso }) : []),
    [],
    [client?.id, from, todayIso],
  );
}

/** Everything scheduled from today onwards — used for "what's next" when today is a rest day. */
export function useUpcoming(limit = 5) {
  const { client } = useSession();
  return useAsync<ScheduledSession[]>(
    async () => {
      if (!client) return [];
      const rows = await listSessions(supabase, { clientId: client.id, from: today() });
      return rows.filter((s) => s.status === 'scheduled').slice(0, limit);
    },
    [],
    [client?.id, limit],
  );
}

export function useSessionPlan(sessionId: string | null) {
  return useAsync<SessionPlanItem[]>(
    async () => (sessionId ? getSessionPlan(supabase, sessionId) : []),
    [],
    [sessionId],
  );
}

/** The session row itself — title, discipline, date — for screens reached by deep link. */
export function useSessionMeta(sessionId: string | null) {
  return useAsync<ScheduledSession | null>(
    async () => (sessionId ? getSession(supabase, sessionId) : null),
    null,
    [sessionId],
  );
}

export function useMetrics(types: MetricType[], sinceDays = 56) {
  const { client } = useSession();
  const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
  return useAsync<Metric[]>(
    async () => (client ? listMetrics(supabase, { clientId: client.id, types, since }) : []),
    [],
    [client?.id, types.join(','), sinceDays],
  );
}

/** Today's diary, the target in force, and the last `days` of daily totals. */
export function useNutrition(days = 7) {
  const { client } = useSession();
  const todayIso = today();
  const from = addDays(todayIso, -(days - 1));

  return useAsync<{
    entries: FoodLogEntry[];
    target: NutritionTarget | null;
    days: NutritionDay[];
  }>(
    async () => {
      if (!client) return { entries: [], target: null, days: [] };
      const [entries, target, rows] = await Promise.all([
        listFoodLogs(supabase, { clientId: client.id, from, to: todayIso }),
        currentTarget(supabase, client.id, todayIso),
        nutritionDays(supabase, client.id, from, todayIso),
      ]);
      return { entries, target, days: rows };
    },
    { entries: [], target: null, days: [] },
    [client?.id, from, todayIso],
  );
}

export function latestOf(metrics: Metric[], type: MetricType): Metric | null {
  const of = metrics.filter((m) => m.type === type);
  return of.length ? (of[of.length - 1] as Metric) : null;
}

/**
 * Adherence for the week so far.
 *
 * Only sessions that have already passed count against her — plus anything she has
 * explicitly finished or skipped. Measuring Wednesday morning against Friday's session
 * would report a miss for work that is still ahead of her, and this app should never
 * open with an invented shortfall.
 */
export function weekAdherence(sessions: ScheduledSession[]): {
  completed: number;
  due: number;
  ratio: number;
} {
  const now = today();
  const completed = sessions.filter((s) => s.status === 'completed').length;
  const due = sessions.filter(
    (s) => s.scheduledDate < now || s.status === 'completed' || s.status === 'skipped',
  ).length;
  return { completed, due, ratio: due === 0 ? 0 : completed / due };
}
