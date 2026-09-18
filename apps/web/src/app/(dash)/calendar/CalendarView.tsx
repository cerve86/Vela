'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { DISCIPLINE_LABEL, type Discipline, type SessionPlanItem } from '@vela/api';
import { palette } from '@vela/shared/tokens';
import { Avatar } from '@/components/ui';
import { loadSessionPlanAction } from './actions';
import {
  addDays,
  addMonths,
  dayOfMonth,
  longDate,
  mondayOf,
  monthEnd,
  monthName,
  monthStart,
  weekRange,
  weekdayShort,
} from './dates';

export type View = 'day' | 'week' | 'month';

export interface CalendarClient {
  id: string;
  name: string;
  status: string;
  program: {
    id: string;
    name: string;
    kind: 'structured' | 'descriptive';
    durationWeeks: number;
    startDate: string;
  } | null;
}

export interface CalendarSession {
  id: string;
  clientId: string;
  title: string;
  discipline: Discipline;
  date: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'skipped';
  /** From the programme, as opposed to filed for a recorded activity or logged freely. */
  prescribed: boolean;
  setsDone: number | null;
  setsPlanned: number | null;
  painBefore: number | null;
  painAfter: number | null;
  durationSec: number | null;
  loggedVia: string;
  dayNotes: string | null;
  doneItemIds: string[];
}

/**
 * Five states, one language, everywhere on this page.
 *
 * Done is sent with every set; partly is sent with some, or started today and not sent;
 * missed is a day that passed without a send; planned is still ahead. A session that is
 * not from the programme — a run recorded on Strava, a walk she logged — is "logged":
 * hers, shown, never counted against the plan.
 */
export type State = 'done' | 'partial' | 'missed' | 'planned' | 'logged';

export function stateOf(s: CalendarSession, today: string): State {
  if (!s.prescribed) return 'logged';
  if (s.status === 'completed') {
    return s.setsPlanned && s.setsDone !== null && s.setsDone < s.setsPlanned ? 'partial' : 'done';
  }
  if (s.status === 'in_progress') return 'partial';
  if (s.status === 'skipped' || s.date < today) return 'missed';
  return 'planned';
}

const STATE_LABEL: Record<State, string> = {
  done: 'Done',
  partial: 'Partly',
  missed: 'Missed',
  planned: 'Planned',
  logged: 'Logged',
};

/** Fill and edge per state. Fills are theme tokens; edges are the palette's own marks. */
const STATE_STYLE: Record<State, { background: string; edge: string; color?: string }> = {
  done: { background: 'var(--tint-mint)', edge: palette.status.goodFill },
  partial: { background: 'rgba(232,162,0,0.14)', edge: palette.status.warningFill },
  missed: {
    background: 'var(--ghost)',
    edge: palette.heatmap.missed,
    color: 'var(--ink-secondary)',
  },
  planned: { background: 'var(--tint-peach)', edge: palette.brand[300] },
  logged: { background: 'var(--tint-mint)', edge: 'transparent', color: 'var(--ink-secondary)' },
};

function Dot({ state, size = 8 }: { state: State; size?: number }) {
  const ring = state === 'planned';
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        background: ring ? 'transparent' : STATE_STYLE[state].edge,
        border: ring ? `1.5px solid ${palette.brand[300]}` : undefined,
        opacity: state === 'logged' ? 0.6 : 1,
      }}
    />
  );
}

function Chip({ state }: { state: State }) {
  const st = STATE_STYLE[state];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: st.background, color: st.color ?? 'var(--ink-primary)' }}
    >
      <Dot state={state} size={6} />
      {STATE_LABEL[state]}
    </span>
  );
}

/** What a session says about itself in one short line. */
function meta(s: CalendarSession, state: State): string {
  const parts: string[] = [DISCIPLINE_LABEL[s.discipline]];
  if (state === 'done' || state === 'partial') {
    if (s.setsPlanned) parts.push(`${s.setsDone ?? 0} of ${s.setsPlanned} sets`);
    else if (s.status === 'in_progress') parts.push('started');
    else if (s.durationSec) parts.push(`${Math.round(s.durationSec / 60)} min`);
  } else if (state === 'logged') {
    parts.push(s.loggedVia === 'strava' ? 'recorded on Strava' : 'logged');
    if (s.durationSec) parts.push(`${Math.round(s.durationSec / 60)} min`);
  }
  return parts.join(' · ');
}

function counts(list: CalendarSession[], today: string) {
  const c = { done: 0, partial: 0, missed: 0, planned: 0 };
  for (const s of list) {
    const st = stateOf(s, today);
    if (st !== 'logged') c[st]++;
  }
  return c;
}

/* ─────────────────────────────────────────────────────────────
 * The page
 * ───────────────────────────────────────────────────────────── */

export function CalendarView({
  clients,
  sessions,
  today,
  view,
  date,
  openClientId,
  loaded,
}: {
  clients: CalendarClient[];
  sessions: CalendarSession[];
  today: string;
  view: View;
  date: string;
  openClientId: string | null;
  loaded: { from: string; to: string };
}) {
  const router = useRouter();

  const go = (next: { view?: View; date?: string; client?: string | null }) => {
    const v = next.view ?? view;
    const d = next.date ?? date;
    const c = next.client === undefined ? openClientId : next.client;
    const q = new URLSearchParams({ view: v, date: d });
    if (c) q.set('client', c);
    router.replace(`/calendar?${q}`);
  };

  const step = (dir: -1 | 1) =>
    go({
      date:
        view === 'day'
          ? addDays(date, dir)
          : view === 'week'
            ? addDays(date, dir * 7)
            : addMonths(date, dir),
    });

  const span = useMemo(() => {
    if (view === 'day') return { from: date, to: date };
    if (view === 'week') {
      const from = mondayOf(date);
      return { from, to: addDays(from, 6) };
    }
    return { from: monthStart(date), to: monthEnd(date) };
  }, [view, date]);

  const inSpan = sessions.filter((s) => s.date >= span.from && s.date <= span.to);
  const sum = counts(inSpan, today);
  const todays = sessions.filter((s) => s.date === today && s.prescribed);
  const roster = clients.filter((c) => c.status !== 'archived');
  const open = openClientId ? (clients.find((c) => c.id === openClientId) ?? null) : null;

  const rangeLabel =
    view === 'day'
      ? longDate(date)
      : view === 'week'
        ? weekRange(span.from)
        : `${monthName(date)} ${date.slice(0, 4)}`;

  return (
    <>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-extrabold">Calendar</h1>
          <p className="mt-0.5 text-sm ink-2">
            Everyone&rsquo;s training. Click a client or a session to open her own calendar.
          </p>
        </div>
        <Link href="/clients" className="text-sm underline ink-2">
          Back to clients
        </Link>
      </header>

      <section
        className="rounded-[20px] p-4 sm:p-5"
        style={{
          background: 'var(--surface)',
          boxShadow: '0 10px 30px var(--shadow, rgba(18,23,43,0.06))',
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Segmented view={view} onChange={(v) => go({ view: v })} />
          <Arrows onPrev={() => step(-1)} onNext={() => step(1)} />
          <div className="display-face text-[17px] font-bold">{rangeLabel}</div>
          <button
            type="button"
            onClick={() => go({ date: today })}
            className="text-xs underline ink-2"
          >
            Today
          </button>
          <p className="ml-auto text-xs ink-2 tnum">
            {view === 'day' ? 'Today' : view === 'week' ? 'This week' : 'This month'} across
            everyone: <b style={{ color: palette.status.good }}>{sum.done} done</b>
            {sum.partial > 0 && <> · {sum.partial} partly</>} ·{' '}
            <b style={{ color: 'var(--ink-secondary)' }}>{sum.missed} missed</b> · {sum.planned} to
            come
            {view !== 'day' && todays.length > 0 && (
              <>
                {' '}
                · today {todays.length} {todays.length === 1 ? 'session' : 'sessions'}
                {todays.some((s) => s.status === 'in_progress') ? ', one in progress' : ''}
              </>
            )}
          </p>
        </div>

        {view === 'week' && (
          <WeekRoster
            clients={roster}
            sessions={sessions}
            from={span.from}
            today={today}
            onClient={(id, d) => go({ client: id, date: d })}
          />
        )}
        {view === 'day' && (
          <DayList
            clients={roster}
            sessions={sessions.filter((s) => s.date === date)}
            date={date}
            today={today}
            onClient={(id) => go({ client: id })}
          />
        )}
        {view === 'month' && (
          <MonthGrid
            sessions={sessions}
            date={date}
            today={today}
            onDay={(d) => go({ view: 'day', date: d })}
            dotsPer="client"
          />
        )}

        <Legend />
      </section>

      <p className="mt-3 text-xs ink-3">
        Counts are the programmes&rsquo; own sessions over what is shown. A rest day is a dash, not
        a miss; a run recorded on Strava or a walk she logged shows as &ldquo;logged&rdquo; and is
        not counted against the plan. Loaded {loaded.from} to {loaded.to}.
      </p>

      {open && (
        <ClientPanel
          client={open}
          sessions={sessions.filter((s) => s.clientId === open.id)}
          today={today}
          view={view}
          date={date}
          onView={(v) => go({ view: v })}
          onDate={(d) => go({ date: d })}
          onDayView={(d) => go({ view: 'day', date: d })}
          onClose={() => go({ client: null })}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Controls
 * ───────────────────────────────────────────────────────────── */

function Segmented({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const views: View[] = ['day', 'week', 'month'];
  return (
    <div
      role="tablist"
      aria-label="Calendar view"
      className="grid w-[220px] grid-cols-3 rounded-full p-[3px]"
      style={{ background: 'var(--ghost)' }}
    >
      {views.map((v) => {
        const on = v === view;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(v)}
            className="rounded-full py-1.5 text-[13px] font-semibold capitalize"
            style={{
              background: on ? 'var(--surface)' : 'transparent',
              color: on ? 'var(--ink-primary)' : 'var(--ink-secondary)',
              boxShadow: on ? '0 1px 3px rgba(18,23,43,0.10)' : undefined,
            }}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}

function Arrows({ onPrev, onNext }: { onPrev: () => void; onNext: () => void }) {
  const cls =
    'grid h-7 w-7 place-items-center rounded-full border transition-colors hover:bg-[var(--ghost)]';
  return (
    <div className="flex gap-1.5">
      <button
        type="button"
        aria-label="Previous"
        onClick={onPrev}
        className={cls}
        style={{ borderColor: 'var(--border)' }}
      >
        <ChevronLeft size={14} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        aria-label="Next"
        onClick={onNext}
        className={cls}
        style={{ borderColor: 'var(--border)' }}
      >
        <ChevronRight size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}

function Legend() {
  const items: State[] = ['done', 'partial', 'missed', 'planned', 'logged'];
  return (
    <div className="mt-3 flex flex-wrap gap-4 text-xs ink-2">
      {items.map((s) => (
        <span key={s} className="inline-flex items-center gap-1.5">
          <Dot state={s} size={9} />
          {s === 'partial' ? 'Partly / in progress' : STATE_LABEL[s]}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="inline-block h-[9px] w-[9px] rounded-full"
          style={{ border: `1.5px solid ${palette.brand[600]}` }}
        />
        Today
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Week: a row per client, a column per day
 * ───────────────────────────────────────────────────────────── */

function programLine(c: CalendarClient, weekFrom: string): string {
  if (c.status === 'invited')
    return c.program ? `Awaiting · starts ${c.program.startDate}` : 'Awaiting acceptance';
  if (!c.program) return 'No programme';
  if (c.program.kind === 'descriptive') return 'Written programme';
  const week =
    Math.floor(
      (new Date(`${weekFrom}T00:00:00Z`).getTime() -
        new Date(`${c.program.startDate}T00:00:00Z`).getTime()) /
        86_400_000 /
        7,
    ) + 1;
  if (week < 1)
    return `${c.program.name} · starts ${dayOfMonth(c.program.startDate)} ${monthName(c.program.startDate).slice(0, 3)}`;
  if (week > c.program.durationWeeks) return `${c.program.name} · finished`;
  return `${c.program.name} · week ${week} of ${c.program.durationWeeks}`;
}

function WeekRoster({
  clients,
  sessions,
  from,
  today,
  onClient,
}: {
  clients: CalendarClient[];
  sessions: CalendarSession[];
  from: string;
  today: string;
  onClient: (id: string, date: string) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const cell = 'border-t px-1 py-1.5 min-h-[58px] flex flex-col justify-center gap-1';
  return (
    <div className="mt-4 overflow-x-auto">
      <div
        className="grid min-w-[760px] gap-1"
        style={{ gridTemplateColumns: '170px repeat(7, minmax(0, 1fr))' }}
      >
        <div />
        {days.map((d) => (
          <div
            key={d}
            className="pb-1.5 text-center text-[10.5px] font-medium tracking-wide ink-3"
            style={d === today ? { borderBottom: `2px solid ${palette.brand[600]}` } : undefined}
          >
            {weekdayShort(d)}
            <b
              className="display-face block text-sm font-semibold"
              style={{ color: d === today ? palette.brand[600] : 'var(--ink-primary)' }}
            >
              {dayOfMonth(d)}
            </b>
          </div>
        ))}

        {clients.map((c) => (
          <ClientRow
            key={c.id}
            client={c}
            days={days}
            sessions={sessions.filter((s) => s.clientId === c.id)}
            today={today}
            from={from}
            cell={cell}
            onClient={onClient}
          />
        ))}
      </div>
    </div>
  );
}

function ClientRow({
  client,
  days,
  sessions,
  today,
  from,
  cell,
  onClient,
}: {
  client: CalendarClient;
  days: string[];
  sessions: CalendarSession[];
  today: string;
  from: string;
  cell: string;
  onClient: (id: string, date: string) => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={() => onClient(client.id, days.includes(today) ? today : from)}
        className="flex items-center gap-2 rounded-[10px] border-t py-2 pl-0.5 pr-1.5 text-left transition-colors hover:bg-[var(--ghost)]"
        style={{ borderColor: 'var(--border)' }}
      >
        <Avatar name={client.name} size={30} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold leading-tight">
            {client.name}
          </span>
          <span className="block truncate text-[11px] ink-3">{programLine(client, from)}</span>
        </span>
      </button>
      {days.map((d) => {
        const here = sessions.filter((s) => s.date === d);
        const prescribed = here.filter((s) => s.prescribed);
        const shown = prescribed.length ? prescribed : here.filter((s) => s.status === 'completed');
        return (
          <div
            key={d}
            className={`${cell} ${d === today ? 'rounded-lg' : ''}`}
            style={{
              borderColor: d === today ? 'transparent' : 'var(--border)',
              background: d === today ? 'var(--tint-peach)' : undefined,
            }}
          >
            {shown.length === 0 ? (
              <span className="text-center text-[10.5px] ink-3">
                {client.status === 'invited' || !client.program ? '—' : 'rest'}
              </span>
            ) : (
              shown.slice(0, 2).map((s) => {
                const st = stateOf(s, today);
                const style = STATE_STYLE[st];
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onClient(client.id, d)}
                    className="w-full rounded-lg px-1.5 py-1 text-left text-[11px] font-semibold leading-tight transition-transform hover:-translate-y-px"
                    style={{
                      background: style.background,
                      borderLeft: `3px solid ${style.edge}`,
                      color: style.color ?? 'var(--ink-primary)',
                    }}
                    title={`${s.title} — ${STATE_LABEL[st]}`}
                  >
                    <span className="block truncate">{s.title}</span>
                    <span className="block truncate text-[10px] font-medium ink-2">
                      {meta(s, st)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        );
      })}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Day: who trains today and where each stands
 * ───────────────────────────────────────────────────────────── */

function DayList({
  clients,
  sessions,
  date,
  today,
  onClient,
}: {
  clients: CalendarClient[];
  sessions: CalendarSession[];
  date: string;
  today: string;
  onClient: (id: string) => void;
}) {
  const training = clients.filter((c) => c.status !== 'invited');
  return (
    <div className="mt-4 grid gap-1.5">
      {training.map((c) => {
        const here = sessions.filter((s) => s.clientId === c.id);
        const prescribed = here.filter((s) => s.prescribed);
        const shown = prescribed.length ? prescribed : here.filter((s) => s.status === 'completed');
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onClient(c.id)}
            className="grid items-center gap-3 rounded-[12px] px-3 py-2 text-left transition-colors hover:bg-[var(--tint-peach)]"
            style={{ background: 'var(--ghost)', gridTemplateColumns: '34px 1fr auto' }}
          >
            <Avatar name={c.name} size={30} />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold">
                {c.name.split(' ')[0]} ·{' '}
                {shown.length ? shown.map((s) => s.title).join(' + ') : 'nothing on the calendar'}
              </span>
              <span className="block text-[11.5px] ink-2">
                {shown.length
                  ? shown.map((s) => meta(s, stateOf(s, today))).join(' · ')
                  : c.program?.kind === 'descriptive'
                    ? 'Written programme'
                    : c.program
                      ? 'Rest day'
                      : 'No programme'}
              </span>
            </span>
            <span className="flex gap-1">
              {shown.map((s) => (
                <Chip key={s.id} state={stateOf(s, today)} />
              ))}
            </span>
          </button>
        );
      })}
      {training.length === 0 && <p className="text-sm ink-2">No active clients yet.</p>}
      {date !== today && (
        <p className="mt-1 text-xs ink-3">
          {date < today ? 'A past day.' : 'A day ahead.'} States are as they stand now.
        </p>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Month: a grid of days, a dot per session
 * ───────────────────────────────────────────────────────────── */

function MonthGrid({
  sessions,
  date,
  today,
  onDay,
  dotsPer,
  selected,
}: {
  sessions: CalendarSession[];
  date: string;
  today: string;
  onDay: (d: string) => void;
  dotsPer: 'client' | 'session';
  selected?: string | null;
}) {
  const first = monthStart(date);
  const last = monthEnd(date);
  const gridStart = mondayOf(first);
  const cells: string[] = [];
  for (let d = gridStart; d <= last || cells.length % 7 !== 0; d = addDays(d, 1)) cells.push(d);
  const byDate = new Map<string, CalendarSession[]>();
  for (const s of sessions) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);

  return (
    <div className="mt-4">
      <div className="grid grid-cols-7 text-center text-[10.5px] font-medium tracking-wide ink-3">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
          <span key={i}>{w}</span>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1">
        {cells.map((d) => {
          const out = d < first || d > last;
          const here = (byDate.get(d) ?? []).filter(
            (s) => s.prescribed || s.status === 'completed',
          );
          const dots = dotsPer === 'client' ? here.filter((s) => s.prescribed) : here;
          const isSel = selected === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => onDay(d)}
              className="min-h-[52px] rounded-[10px] border p-1.5 text-left transition-colors hover:bg-[var(--tint-peach)]"
              style={{
                borderColor:
                  d === today ? palette.brand[600] : isSel ? palette.brand[600] : 'var(--border)',
                borderWidth: d === today || isSel ? 1.5 : 1,
                background: isSel ? palette.brand[600] : out ? 'transparent' : 'var(--page)',
                opacity: out ? 0.4 : 1,
              }}
              aria-label={`${longDate(d)}, ${dots.length} ${dots.length === 1 ? 'session' : 'sessions'}`}
            >
              <b
                className="display-face block text-[12px] font-semibold"
                style={{
                  color: isSel ? '#fff' : d === today ? palette.brand[600] : 'var(--ink-primary)',
                }}
              >
                {dayOfMonth(d)}
              </b>
              <span className="mt-1 flex flex-wrap gap-[3px]">
                {dots.slice(0, 8).map((s) => (
                  <Dot key={s.id} state={isSel ? 'done' : stateOf(s, today)} size={8} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
 * The panel: one client's calendar, with the day's details
 * ───────────────────────────────────────────────────────────── */

function ClientPanel({
  client,
  sessions,
  today,
  view,
  date,
  onView,
  onDate,
  onDayView,
  onClose,
}: {
  client: CalendarClient;
  sessions: CalendarSession[];
  today: string;
  view: View;
  date: string;
  onView: (v: View) => void;
  onDate: (d: string) => void;
  onDayView: (d: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const weekFrom = mondayOf(date);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i));
  const onDate_ = (d: string) => onDate(d);
  const prescribedOn = (d: string) => sessions.filter((s) => s.date === d && s.prescribed);
  const shownOn = (d: string) => {
    const p = prescribedOn(d);
    return p.length ? p : sessions.filter((s) => s.date === d && s.status === 'completed');
  };
  const selected = shownOn(date)[0] ?? null;

  const span =
    view === 'week'
      ? { from: weekFrom, to: addDays(weekFrom, 6) }
      : view === 'month'
        ? { from: monthStart(date), to: monthEnd(date) }
        : { from: date, to: date };
  const c = counts(
    sessions.filter((s) => s.date >= span.from && s.date <= span.to),
    today,
  );

  const step = (dir: -1 | 1) =>
    onDate(
      view === 'day'
        ? addDays(date, dir)
        : view === 'week'
          ? addDays(date, dir * 7)
          : addMonths(date, dir),
    );

  const programWeek =
    client.program && client.program.kind === 'structured'
      ? Math.floor(
          (new Date(`${date}T00:00:00Z`).getTime() -
            new Date(`${client.program.startDate}T00:00:00Z`).getTime()) /
            86_400_000 /
            7,
        ) + 1
      : null;

  return (
    <>
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(18,23,43,0.28)' }}
      />
      <aside
        role="dialog"
        aria-label={`${client.name}'s calendar`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[470px] flex-col overflow-y-auto border-l p-5 sm:p-6"
        style={{
          background: 'var(--surface)',
          borderColor: 'var(--border)',
          boxShadow: '-18px 0 50px rgba(18,23,43,0.14)',
        }}
      >
        <div className="flex items-center gap-3">
          <Avatar name={client.name} size={36} />
          <div className="min-w-0 flex-1">
            <div className="display-face truncate text-base font-bold">{client.name}</div>
            <div className="truncate text-xs ink-2">
              {client.program
                ? `${client.program.name} · started ${dayOfMonth(client.program.startDate)} ${monthName(client.program.startDate).slice(0, 3)}`
                : 'No programme assigned'}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full border"
            style={{ borderColor: 'var(--border)' }}
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        <div className="mt-4">
          <Segmented view={view} onChange={onView} />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div>
            <div className="display-face text-[19px] font-bold">
              {view === 'day'
                ? longDate(date)
                : view === 'week'
                  ? programWeek && programWeek >= 1
                    ? `Week ${programWeek}`
                    : weekRange(weekFrom)
                  : `${monthName(date)} ${date.slice(0, 4)}`}
              {view === 'week' && programWeek && programWeek >= 1 && client.program && (
                <span className="ink-3"> of {client.program.durationWeeks}</span>
              )}
            </div>
            <div className="text-xs ink-2">
              {view === 'week'
                ? weekRange(weekFrom)
                : view === 'day' && programWeek && programWeek >= 1
                  ? `Week ${programWeek} of ${client.program!.durationWeeks}`
                  : ''}
              {view !== 'day' && today >= span.from && today <= span.to ? ` · this ${view}` : ''}
              {view === 'day' && date === today ? ' · today' : ''}
            </div>
          </div>
          <Arrows onPrev={() => step(-1)} onNext={() => step(1)} />
        </div>

        {view !== 'day' && (
          <div className="mt-3 flex gap-5">
            <Figure label="Done" value={c.done} color={palette.status.good} />
            <Figure label="Missed" value={c.missed} color="var(--ink-secondary)" />
            <Figure label="Planned" value={c.planned} />
          </div>
        )}

        {view === 'week' && (
          <div className="mt-2">
            {days.map((d) => {
              const shown = shownOn(d);
              const s = shown[0];
              const st = s ? stateOf(s, today) : null;
              const on = d === date;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => onDate_(d)}
                  className="grid w-full items-center gap-2.5 border-t py-2 text-left"
                  style={{
                    gridTemplateColumns: '40px 1fr auto',
                    borderColor: on ? 'transparent' : 'var(--border)',
                    background: on ? 'var(--tint-cream)' : undefined,
                    borderRadius: on ? 10 : 0,
                    paddingInline: on ? 8 : 0,
                    marginInline: on ? -8 : 0,
                  }}
                >
                  <span className="text-center">
                    <span className="block text-[10px] font-medium ink-3">{weekdayShort(d)}</span>
                    <span
                      className="display-face block text-base font-semibold"
                      style={{ color: d === today ? palette.brand[600] : undefined }}
                    >
                      {dayOfMonth(d)}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-[13.5px] ${s ? 'font-semibold' : 'font-medium ink-3'}`}
                    >
                      {s ? shown.map((x) => x.title).join(' + ') : 'Rest'}
                    </span>
                    <span className="block truncate text-xs ink-2">
                      {s ? meta(s, st!) : 'Nothing to log'}
                    </span>
                  </span>
                  {st ? <Chip state={st} /> : <span />}
                </button>
              );
            })}
          </div>
        )}

        {view === 'month' && (
          <MonthGrid
            sessions={sessions}
            date={date}
            today={today}
            onDay={(d) => onDayView(d)}
            dotsPer="session"
            selected={date}
          />
        )}

        {(view === 'day' || view === 'week') && (
          <SessionDetail
            client={client}
            session={selected}
            date={date}
            today={today}
            extra={shownOn(date).slice(1)}
          />
        )}

        <div className="mt-auto flex flex-wrap gap-2 pt-5">
          <Link
            href={`/messages?client=${client.id}`}
            className="display-face rounded-full px-3.5 py-2 text-xs font-semibold text-white"
            style={{ background: palette.brand[600] }}
          >
            Message her about this day
          </Link>
          {client.program && (
            <Link
              href={`/programs/${client.program.id}`}
              className="display-face rounded-full px-3.5 py-2 text-xs font-semibold"
              style={{ background: 'var(--ghost)', color: 'var(--ink-primary)' }}
            >
              Edit the programme
            </Link>
          )}
          <Link
            href={`/clients/${client.id}/training`}
            className="display-face rounded-full px-3.5 py-2 text-xs font-semibold"
            style={{ background: 'var(--ghost)', color: 'var(--ink-primary)' }}
          >
            Her training tab
          </Link>
        </div>
      </aside>
    </>
  );
}

function Figure({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-medium uppercase tracking-wider ink-3">{label}</div>
      <div className="display-face text-[22px] font-semibold tnum" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

/**
 * What the day held, and how it went.
 *
 * The prescription is fetched when the day is chosen, not with the page: a month of
 * sessions across a practice is hundreds of items nobody will open. Once fetched it is
 * kept for the panel's lifetime, so flicking between two days does not refetch.
 */
function SessionDetail({
  client,
  session,
  date,
  today,
  extra,
}: {
  client: CalendarClient;
  session: CalendarSession | null;
  date: string;
  today: string;
  extra: CalendarSession[];
}) {
  const [plans, setPlans] = useState<Record<string, SessionPlanItem[]>>({});
  const [pending, startTransition] = useTransition();
  const id = session?.prescribed ? session.id : null;

  useEffect(() => {
    if (!id || plans[id]) return;
    startTransition(async () => {
      const items = await loadSessionPlanAction(id);
      setPlans((p) => ({ ...p, [id]: items }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!session) {
    return (
      <div
        className="mt-4 rounded-[14px] border border-dashed p-4 text-sm ink-2"
        style={{ borderColor: 'var(--border)' }}
      >
        {client.program?.kind === 'descriptive'
          ? `Nothing on the calendar for ${longDate(date)} — ${client.name.split(' ')[0]} is on a written programme.`
          : client.program
            ? `Rest day. Nothing on the calendar for ${longDate(date)}.`
            : `No programme assigned, so nothing on ${longDate(date)}.`}
      </div>
    );
  }

  const st = stateOf(session, today);
  const items = id ? (plans[id] ?? []) : [];
  const finished = items.filter((i) => session.doneItemIds.includes(i.itemId)).length;

  return (
    <div className="mt-4 border-t border-dashed pt-4" style={{ borderColor: 'var(--border)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip state={st} />
        <span className="text-xs ink-2">{meta(session, st)}</span>
        {session.date === today && session.status === 'in_progress' && (
          <span className="text-xs ink-3">· in progress now</span>
        )}
      </div>
      <div className="display-face mt-2 text-lg font-bold">{session.title}</div>
      {session.dayNotes && (
        <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed">{session.dayNotes}</p>
      )}

      {id && pending && items.length === 0 && (
        <p className="mt-3 text-xs ink-3">Loading the movements…</p>
      )}
      {items.length > 0 && (
        <ul className="mt-3 grid gap-1.5">
          {items.map((it) => {
            const done = session.doneItemIds.includes(it.itemId);
            return (
              <li
                key={it.itemId}
                className="flex items-center gap-2.5 rounded-[12px] px-3 py-2"
                style={{ background: done ? 'var(--tint-mint)' : 'var(--ghost)' }}
              >
                <span
                  aria-label={done ? 'Finished' : undefined}
                  className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10px] text-white"
                  style={{
                    background: done ? palette.status.goodFill : 'transparent',
                    border: done ? undefined : '1.5px solid var(--border)',
                  }}
                >
                  {done ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">
                    {it.exerciseName}
                  </span>
                  {it.notes && (
                    <span className="block truncate text-[11.5px] ink-2">{it.notes}</span>
                  )}
                </span>
                <span
                  className="rounded-lg border px-1.5 py-0.5 text-[11px] font-semibold tnum"
                  style={{ color: palette.brand[600], borderColor: 'rgba(27,79,216,0.18)' }}
                >
                  {it.sets} × {it.reps}
                  {it.targetLoadKg ? ` · ${it.targetLoadKg} kg` : ''}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {(session.status === 'completed' || session.status === 'in_progress') && (
        <p className="mt-3 text-xs ink-2">
          {items.length > 0 && session.status === 'completed'
            ? finished === items.length
              ? 'Every movement finished. '
              : `${finished} of ${items.length} movements finished outright. `
            : ''}
          {session.painBefore !== null || session.painAfter !== null
            ? `Symptom ${session.painBefore ?? '—'} before → ${session.painAfter ?? 'not yet sent'} after.`
            : session.status === 'completed'
              ? 'No symptom scores came through.'
              : ''}
        </p>
      )}

      {extra.length > 0 && (
        <p className="mt-2 text-xs ink-3">
          Also that day:{' '}
          {extra
            .map((s) => `${s.title} (${STATE_LABEL[stateOf(s, today)].toLowerCase()})`)
            .join(', ')}
          .
        </p>
      )}
    </div>
  );
}
