import { useEffect, useMemo, useState } from 'react';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { DISCIPLINE_LABEL, type ScheduledSession } from '@vela/api';
import {
  programmeWeeks,
  sessionState,
  stateCounts,
  weekRangeLabel,
  type SessionState,
} from '@vela/shared';
import { Body, Button, Card, Display, DosePill, PlanTag, Screen } from '@/components/kit';
import { Prose } from '@/components/prose';
import { Rise, Tap } from '@/components/motion';
import { useTheme } from '@/theme';
import { addDays, today, useAssignedProgram, useSessionPlan, useSessionsBetween } from '@/lib/data';

/**
 * Her training on a calendar: a day, a week, a month.
 *
 * One selected day carries across the three views. Week is the screen Progress opens on
 * a programme week; Day is that day opened up, with yesterday beneath; Month is a mark
 * per day, tapped to open it. States speak the portal's language: done, partly, missed,
 * planned, and logged for a run recorded on Strava, which is hers and not the plan's.
 */
type CalView = 'day' | 'week' | 'month';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_MS = 86_400_000;
const isoWeekday = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
};
const mondayOf = (iso: string) => addDays(iso, 1 - isoWeekday(iso));
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const monthEnd = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
};
const addMonths = (iso: string, n: number) => {
  const [y, m] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1 + n, 1)).toISOString().slice(0, 10);
};
const dayNo = (iso: string) => Number(iso.slice(8, 10));
const longDay = (iso: string) =>
  `${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][isoWeekday(iso) - 1]} ${dayNo(iso)} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

const STATE_LABEL: Record<SessionState, string> = {
  done: 'DONE',
  partial: 'PARTLY',
  missed: 'MISSED',
  planned: 'PLANNED',
  logged: 'LOGGED',
};

export default function CalendarScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ view?: string; date?: string }>();
  const todayIso = today();
  const view: CalView = params.view === 'day' || params.view === 'month' ? params.view : 'week';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : todayIso;

  const go = (next: { view?: CalView; date?: string }) =>
    router.setParams({ view: next.view ?? view, date: next.date ?? date });
  const step = (dir: -1 | 1) =>
    go({
      date:
        view === 'day'
          ? addDays(date, dir)
          : view === 'week'
            ? addDays(date, dir * 7)
            : addMonths(date, dir),
    });

  const assigned = useAssignedProgram();
  const programme = assigned.data?.kind === 'structured' ? assigned.data : null;
  // A month either side of the month in view covers any week or day inside it.
  const from = addDays(mondayOf(monthStart(date)), -7);
  const to = addDays(monthEnd(date), 14);
  const sessions = useSessionsBetween(from, to);

  const byDate = useMemo(() => {
    const m = new Map<string, ScheduledSession[]>();
    for (const s of sessions.data) m.set(s.scheduledDate, [...(m.get(s.scheduledDate) ?? []), s]);
    return m;
  }, [sessions.data]);
  /** The day's session: the prescribed one, else what she logged. */
  const shownOn = (d: string) => {
    const here = byDate.get(d) ?? [];
    const p = here.filter((s) => s.programDayId !== null);
    return p.length ? p : here.filter((s) => s.status === 'completed');
  };

  const weekFrom = mondayOf(date);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i)), [weekFrom]);
  const span =
    view === 'day'
      ? { from: date, to: date }
      : view === 'week'
        ? { from: weekFrom, to: addDays(weekFrom, 6) }
        : { from: monthStart(date), to: monthEnd(date) };
  const counts = stateCounts(
    sessions.data.filter((s) => s.scheduledDate >= span.from && s.scheduledDate <= span.to),
    todayIso,
  );

  const weeks = useMemo(
    () =>
      programme
        ? programmeWeeks({
            startDate: programme.startDate,
            durationWeeks: programme.durationWeeks,
            sessions: sessions.data,
            today: todayIso,
          })
        : [],
    [programme, sessions.data, todayIso],
  );
  const programmeWeek = weeks.find((w) => date >= w.from && date <= w.to) ?? null;

  const session = shownOn(date)[0] ?? null;
  const plan = useSessionPlan(session?.programDayId ? session.id : null);
  const loading = sessions.loading && sessions.data.length === 0;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.space.lg,
          paddingTop: insets.top + t.space.md,
          paddingBottom: t.space.xxl * 2,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Round onPress={() => router.back()} label="Back">
            <ChevronLeft size={16} color={t.textPrimary} strokeWidth={2.5} />
          </Round>
          <View style={{ flex: 1 }} />
          {assigned.data && (
            <Body size={12.5} weight="medium" color={t.textSecondary}>
              {assigned.data.name}
            </Body>
          )}
        </View>

        <Segmented view={view} onChange={(v) => go({ view: v })} />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Round onPress={() => step(-1)} label={`Previous ${view}`}>
            <ChevronLeft size={16} color={t.textPrimary} strokeWidth={2.5} />
          </Round>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Display size={22}>
              {view === 'day'
                ? `${WEEKDAYS[isoWeekday(date) - 1]} ${dayNo(date)} ${MONTHS[Number(date.slice(5, 7)) - 1]!.slice(0, 3)}`
                : view === 'week'
                  ? programmeWeek
                    ? `Week ${programmeWeek.weekNo}`
                    : weekRangeLabel(weekFrom, addDays(weekFrom, 6))
                  : `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`}
              {view === 'week' && programmeWeek && programme && (
                <Text style={{ color: t.textMuted }}> of {programme.durationWeeks}</Text>
              )}
            </Display>
            <Body size={12.5} color={t.textSecondary}>
              {view === 'week'
                ? weekRangeLabel(weekFrom, addDays(weekFrom, 6))
                : view === 'day' && programmeWeek && programme
                  ? `Week ${programmeWeek.weekNo} of ${programme.durationWeeks}`
                  : programme
                    ? `${programme.name} · from ${dayNo(programme.startDate)} ${MONTHS[Number(programme.startDate.slice(5, 7)) - 1]!.slice(0, 3)}`
                    : ''}
              {view !== 'day' && todayIso >= span.from && todayIso <= span.to
                ? ` · this ${view}`
                : ''}
              {view === 'day' && date === todayIso ? ' · today' : ''}
            </Body>
          </View>
          <Round onPress={() => step(1)} label={`Next ${view}`}>
            <ChevronRight size={16} color={t.textPrimary} strokeWidth={2.5} />
          </Round>
        </View>

        {view !== 'day' && (
          <View style={{ flexDirection: 'row', gap: 22 }}>
            <Figure label="DONE" value={counts.done} color={t.status.good} />
            {counts.partial > 0 && (
              <Figure label="PARTLY" value={counts.partial} color={t.status.warning} />
            )}
            <Figure label="MISSED" value={counts.missed} color={t.textSecondary} />
            <Figure label="PLANNED" value={counts.planned} />
          </View>
        )}

        {loading ? (
          <Card>
            <ActivityIndicator color={t.brand[600]} />
          </Card>
        ) : view === 'month' ? (
          <MonthGrid
            date={date}
            todayIso={todayIso}
            marks={(d) => shownOn(d).map((s) => sessionState(s, todayIso))}
            onDay={(d) => go({ view: 'day', date: d })}
          />
        ) : (
          <>
            {view === 'week' && (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {days.map((d, i) => {
                  const s = shownOn(d)[0];
                  const on = d === date;
                  const st = s ? sessionState(s, todayIso) : null;
                  return (
                    <Tap
                      key={d}
                      onPress={() => go({ date: d })}
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${WEEKDAYS[i]} ${dayNo(d)}${s ? `, ${s.title}` : ', rest'}`}
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        paddingVertical: 9,
                        borderRadius: t.radius.md,
                        backgroundColor: on ? t.brand[600] : t.surface,
                        borderWidth: 1,
                        borderColor: on || d === todayIso ? t.brand[600] : t.border,
                      }}
                    >
                      <Body size={10.5} weight="medium" color={on ? '#FFFFFF' : t.textMuted}>
                        {WEEKDAYS[i]}
                      </Body>
                      <Text
                        style={{
                          fontFamily: t.font.displaySemi,
                          fontSize: 15,
                          color: on ? '#FFFFFF' : t.textPrimary,
                          marginTop: 2,
                        }}
                      >
                        {dayNo(d)}
                      </Text>
                      <StateDot state={st} inverted={on} />
                    </Tap>
                  );
                })}
              </View>
            )}

            {!session ? (
              <Rise>
                <Card style={{ borderRadius: 22 }}>
                  <Display size={22}>Rest day</Display>
                  <Body
                    size={13.5}
                    color={t.textSecondary}
                    style={{ marginTop: 6, lineHeight: 19 }}
                  >
                    Nothing on the calendar for {longDay(date)}. Rest is part of the programme.
                  </Body>
                </Card>
              </Rise>
            ) : (
              <SessionCard
                session={session}
                plan={plan.data}
                planLoading={plan.loading}
                todayIso={todayIso}
                others={shownOn(date).slice(1)}
              />
            )}

            {view === 'day' && (
              <YesterdayCard
                date={addDays(date, -1)}
                sessions={shownOn(addDays(date, -1))}
                todayIso={todayIso}
                onOpen={() => go({ date: addDays(date, -1) })}
              />
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Pieces
 * ───────────────────────────────────────────────────────────── */

function Segmented({ view, onChange }: { view: CalView; onChange: (v: CalView) => void }) {
  const t = useTheme();
  const views: CalView[] = ['day', 'week', 'month'];
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: t.softFill,
        borderRadius: t.radius.pill,
        padding: 3,
      }}
    >
      {views.map((v) => {
        const on = v === view;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{
              flex: 1,
              paddingVertical: 8,
              borderRadius: t.radius.pill,
              backgroundColor: on ? t.surface : 'transparent',
              alignItems: 'center',
              shadowColor: '#12172B',
              shadowOpacity: on ? 0.08 : 0,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 },
            }}
          >
            <Body size={13} weight="semibold" color={on ? t.textPrimary : t.textSecondary}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

function Round({
  onPress,
  label,
  children,
}: {
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale: pressed ? 0.965 : 1 }],
      })}
    >
      {children}
    </Pressable>
  );
}

function Figure({ label, value, color }: { label: string; value: number; color?: string }) {
  const t = useTheme();
  return (
    <View>
      <Body size={11} color={t.textSecondary} style={{ letterSpacing: 0.4 }}>
        {label}
      </Body>
      <Text
        style={{
          fontFamily: t.font.displaySemi,
          fontSize: 24,
          letterSpacing: -0.8,
          color: color ?? t.textPrimary,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/** A dot in the state's colour; a ring for planned; nothing for a rest day. */
function StateDot({
  state,
  inverted = false,
  size = 7,
}: {
  state: SessionState | null;
  inverted?: boolean;
  size?: number;
}) {
  const t = useTheme();
  if (!state) return <View style={{ height: size, marginTop: 5 }} />;
  const fill =
    state === 'done'
      ? t.heatmapFull
      : state === 'partial'
        ? t.heatmapPartial
        : state === 'missed'
          ? t.heatmapMissed
          : state === 'logged'
            ? t.heatmapFull
            : 'transparent';
  return (
    <View
      style={{
        marginTop: 5,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: inverted && state !== 'planned' ? '#FFFFFF' : fill,
        borderWidth: state === 'planned' ? 1.5 : 0,
        borderColor: inverted ? '#FFFFFF' : t.brand[300],
        opacity: state === 'logged' ? 0.6 : 1,
      }}
    />
  );
}

function stateTone(state: SessionState, t: ReturnType<typeof useTheme>): string {
  if (state === 'done' || state === 'logged') return t.status.good;
  if (state === 'partial') return t.status.warning;
  if (state === 'missed') return t.textSecondary;
  return t.brand[600];
}

function SessionCard({
  session,
  plan,
  planLoading,
  todayIso,
  others,
}: {
  session: ScheduledSession;
  plan: {
    itemId: string;
    exerciseName: string;
    cues: string[];
    sets: number;
    reps: string;
    targetLoadKg: number | null;
  }[];
  planLoading: boolean;
  todayIso: string;
  others: ScheduledSession[];
}) {
  const t = useTheme();
  const state = sessionState(session, todayIso);
  const finished = plan.filter((i) => session.doneItemIds.includes(i.itemId)).length;
  return (
    <Rise key={session.id}>
      <Card style={{ borderRadius: 22, paddingVertical: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <PlanTag
            label={
              state === 'planned' && session.scheduledDate === todayIso
                ? 'TODAY'
                : STATE_LABEL[state]
            }
            tone={stateTone(state, t)}
          />
          <Body size={12} color={t.textMuted}>
            {DISCIPLINE_LABEL[session.discipline]} · {longDay(session.scheduledDate)}
            {session.setsPlanned
              ? ` · ${session.setsDone ?? 0} of ${session.setsPlanned} sets`
              : ''}
            {state === 'logged' && session.loggedVia === 'strava' ? ' · recorded on Strava' : ''}
          </Body>
        </View>
        <Display size={22} style={{ marginTop: 10 }}>
          {session.title}
        </Display>

        {session.dayNotes && (
          <View style={{ marginTop: 10 }}>
            <Prose body={session.dayNotes} />
          </View>
        )}

        {planLoading && plan.length === 0 ? (
          <ActivityIndicator color={t.brand[600]} style={{ marginTop: 14 }} />
        ) : plan.length > 0 ? (
          <View style={{ marginTop: 14, gap: 6 }}>
            {plan.map((item) => {
              const done = session.doneItemIds.includes(item.itemId);
              return (
                <View
                  key={item.itemId}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    backgroundColor: done
                      ? t.dark
                        ? 'rgba(14,159,110,0.14)'
                        : t.tint.mint
                      : t.softFill,
                    borderRadius: t.radius.md,
                    paddingVertical: 11,
                    paddingHorizontal: 14,
                  }}
                >
                  <View
                    accessibilityLabel={done ? 'Done' : undefined}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: done ? t.status.good : 'transparent',
                      borderWidth: done ? 0 : 1.5,
                      borderColor: t.border,
                    }}
                  >
                    {done && <Check size={12} color="#FFFFFF" strokeWidth={3.2} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Body size={14} weight="medium">
                      {item.exerciseName}
                    </Body>
                    {item.cues[0] ? (
                      <Body size={12} color={t.textSecondary} style={{ marginTop: 2 }}>
                        {item.cues[0]}
                      </Body>
                    ) : null}
                  </View>
                  <DosePill>
                    {item.sets} × {item.reps}
                    {item.targetLoadKg ? ` · ${item.targetLoadKg} kg` : ''}
                  </DosePill>
                </View>
              );
            })}
          </View>
        ) : null}

        {session.status === 'completed' && plan.length > 0 && (
          <Body size={12.5} color={t.textSecondary} style={{ marginTop: 12 }}>
            {finished === plan.length
              ? 'Every movement finished.'
              : finished === 0
                ? `Sent with ${session.setsDone ?? 0} of ${session.setsPlanned ?? '?'} sets.`
                : `${finished} of ${plan.length} movements finished outright.`}
          </Body>
        )}

        {others.length > 0 && (
          <Body size={12} color={t.textMuted} style={{ marginTop: 10 }}>
            Also that day: {others.map((s) => s.title).join(', ')}.
          </Body>
        )}

        {(session.status === 'scheduled' || session.status === 'in_progress') &&
          session.programDayId !== null &&
          session.scheduledDate <= todayIso && (
            <View style={{ marginTop: 18 }}>
              <Link href={`/session/${session.id}`} asChild>
                <Button
                  label={session.status === 'in_progress' ? 'Resume session' : 'Start session'}
                />
              </Link>
            </View>
          )}
      </Card>
    </Rise>
  );
}

function YesterdayCard({
  date,
  sessions,
  todayIso,
  onOpen,
}: {
  date: string;
  sessions: ScheduledSession[];
  todayIso: string;
  onOpen: () => void;
}) {
  const t = useTheme();
  const s = sessions[0];
  return (
    <Tap onPress={onOpen} accessibilityLabel={`The day before, ${longDay(date)}`}>
      <Card style={{ borderRadius: 22 }}>
        <Body size={12} color={t.textMuted}>
          The day before · {WEEKDAYS[isoWeekday(date) - 1]} {dayNo(date)}
        </Body>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 }}>
          {s ? (
            <>
              <PlanTag
                label={STATE_LABEL[sessionState(s, todayIso)]}
                tone={stateTone(sessionState(s, todayIso), t)}
              />
              <Body size={14} weight="semibold" style={{ flex: 1 }}>
                {s.title}
              </Body>
              {s.setsPlanned ? (
                <Body size={12.5} color={t.textSecondary}>
                  {s.setsDone ?? 0} of {s.setsPlanned} sets
                </Body>
              ) : null}
            </>
          ) : (
            <Body size={14} color={t.textSecondary}>
              Rest day
            </Body>
          )}
        </View>
      </Card>
    </Tap>
  );
}

function MonthGrid({
  date,
  todayIso,
  marks,
  onDay,
}: {
  date: string;
  todayIso: string;
  marks: (d: string) => SessionState[];
  onDay: (d: string) => void;
}) {
  const t = useTheme();
  const first = monthStart(date);
  const last = monthEnd(date);
  const cells: string[] = [];
  for (let d = mondayOf(first); d <= last || cells.length % 7 !== 0; d = addDays(d, 1))
    cells.push(d);
  const rows: string[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <Card style={{ borderRadius: 22 }}>
      <View style={{ flexDirection: 'row' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
          <Body
            key={i}
            size={10.5}
            weight="medium"
            color={t.textMuted}
            style={{ flex: 1, textAlign: 'center' }}
          >
            {w}
          </Body>
        ))}
      </View>
      <View style={{ gap: 4, marginTop: 6 }}>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row', gap: 4 }}>
            {row.map((d) => {
              const out = d < first || d > last;
              const st = marks(d);
              const isSel = d === date;
              const primary = st[0] ?? null;
              return (
                <Tap
                  key={d}
                  onPress={() => onDay(d)}
                  accessibilityLabel={`${longDay(d)}${primary ? `, ${STATE_LABEL[primary].toLowerCase()}` : ''}`}
                  style={{
                    flex: 1,
                    aspectRatio: 1 / 1.05,
                    borderRadius: 12,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 3,
                    backgroundColor: isSel
                      ? t.brand[600]
                      : primary === 'done' || primary === 'logged'
                        ? t.dark
                          ? 'rgba(14,159,110,0.14)'
                          : t.tint.mint
                        : primary === 'partial'
                          ? t.dark
                            ? 'rgba(232,162,0,0.16)'
                            : '#FFF6E3'
                          : t.surface,
                    borderWidth: 1,
                    borderColor: isSel || d === todayIso ? t.brand[600] : t.border,
                    opacity: out ? 0.35 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: t.font.displaySemi,
                      fontSize: 14,
                      color: isSel ? '#FFFFFF' : d === todayIso ? t.brand[600] : t.textPrimary,
                    }}
                  >
                    {dayNo(d)}
                  </Text>
                  <StateDot state={primary} inverted={isSel} size={8} />
                </Tap>
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
        {(['done', 'partial', 'missed', 'planned'] as SessionState[]).map((s) => (
          <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <StateDot state={s} size={9} />
            <Body size={12} color={t.textSecondary} style={{ marginTop: 5 }}>
              {s === 'partial'
                ? 'Partly'
                : STATE_LABEL[s].charAt(0) + STATE_LABEL[s].slice(1).toLowerCase()}
            </Body>
          </View>
        ))}
      </View>
    </Card>
  );
}
