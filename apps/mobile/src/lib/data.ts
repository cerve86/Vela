import { useCallback, useEffect, useRef, useState } from 'react';
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

/**
 * The local calendar day an instant falls on.
 *
 * Not `iso.slice(0, 10)`. A timestamptz arrives as UTC, so slicing takes the UTC date while
 * `today()` returns the local one — and east of Greenwich those disagree for part of every
 * day. A 07:00 wake-up in Singapore is stored as 23:00Z the day before, so slicing looked
 * last night's sleep up under yesterday's key, failed to find it, and dropped recovery to
 * readiness-only with an "Estimated" label on a night that had synced perfectly.
 */
export function localDay(iso: string): string {
  const d = new Date(iso);
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
  /**
   * Refetches, and resolves when the fetch has landed.
   *
   * The promise is the point. This used to return void — it bumped a nonce and let an
   * effect do the work — so `await Promise.all([a.reload(), b.reload()])` resolved on the
   * same tick and pull-to-refresh dropped its spinner before a single row had arrived.
   */
  reload: () => Promise<void>;
}

export function useAsync<T>(fn: () => Promise<T>, initial: T, deps: unknown[]): Async<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Which fetch is allowed to write.
   *
   * Replaces the old per-effect `cancelled` flag, which could not cover a reload the caller
   * triggered directly. A generation counter covers both: any run that is no longer the
   * latest keeps its result to itself, so a slow response cannot overwrite a newer one.
   */
  const generation = useRef(0);

  const run = useCallback(async () => {
    const mine = ++generation.current;
    setLoading(true);
    try {
      const result = await fn();
      if (generation.current === mine) {
        setData(result);
        setError(null);
      }
    } catch (e: unknown) {
      if (generation.current === mine) {
        setError(e instanceof Error ? e.message : 'Something went wrong');
      }
    } finally {
      if (generation.current === mine) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    void run();
  }, [run]);

  return { data, loading, error, reload: run };
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

/**
 * The physiotherapist this client belongs to.
 *
 * Two reads rather than a join, because the name and the practice live in different tables
 * and each is guarded by its own policy — `profiles_client_reads_own_coach` and
 * `coaches_client_reads_own_coach`. Either can legitimately return nothing (a coach who has
 * not set a practice name, say), and the screen degrades to "Your physiotherapist" rather
 * than showing half a card.
 */
export function useCoach() {
  const { client } = useSession();

  return useAsync<{ name: string; practiceName: string | null } | null>(
    async () => {
      if (!client) return null;

      // RLS narrows both of these to the one coach who owns this client's row, so neither
      // needs a filter here — and not writing one is what makes a mistake harmless.
      const [{ data: profile }, { data: practice }] = await Promise.all([
        supabase.from('profiles').select('first_name, last_name').eq('role', 'coach').maybeSingle(),
        supabase.from('coaches').select('practice_name').maybeSingle(),
      ]);

      if (!profile && !practice) return null;
      const name = `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim();
      return {
        name: name || 'Your physiotherapist',
        practiceName: practice?.practice_name ?? null,
      };
    },
    null,
    [client?.id],
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
