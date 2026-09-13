import { useEffect, useMemo, useState } from 'react';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { DISCIPLINE_LABEL, type ScheduledSession } from '@vela/api';
import { programmeWeeks, weekRangeLabel } from '@vela/shared';
import { Body, Button, Card, Display, DosePill, PlanTag, Screen } from '@/components/kit';
import { Prose } from '@/components/prose';
import { Rise, Tap } from '@/components/motion';
import { useTheme } from '@/theme';
import {
  addDays,
  today,
  useAssignedProgram,
  useProgrammeSessions,
  useSessionPlan,
} from '@/lib/data';

/**
 * One week of the programme, a day at a time.
 *
 * Progress lists the weeks; this is a week opened up. Seven days across the top, the
 * chosen day below with what her physio wrote for it and every movement in it. A day that
 * was sent shows which movements were finished outright — every set ticked — and a day
 * written as a sentence shows Done for the whole thing, which is all a run can say.
 * The arrows walk the block from its first week to its last.
 */
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WeekScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { n } = useLocalSearchParams<{ n: string }>();
  const weekNo = Math.max(1, Number(n) || 1);

  const assigned = useAssignedProgram();
  const programme = assigned.data?.kind === 'structured' ? assigned.data : null;
  const sessions = useProgrammeSessions(programme);
  const todayIso = today();

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
  const week = weeks[weekNo - 1] ?? null;
  const days = useMemo(
    () => (week ? Array.from({ length: 7 }, (_, i) => addDays(week.from, i)) : []),
    [week],
  );
  const byDate = useMemo(() => {
    const m = new Map<string, ScheduledSession>();
    for (const s of sessions.data) if (s.programDayId !== null) m.set(s.scheduledDate, s);
    return m;
  }, [sessions.data]);

  // Today when it is in this week; otherwise the first day that has a session.
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    if (!week) return;
    if (todayIso >= week.from && todayIso <= week.to) setSelected(todayIso);
    else setSelected(days.find((d) => byDate.has(d)) ?? days[0] ?? null);
  }, [week, days, byDate, todayIso]);

  const session = selected ? (byDate.get(selected) ?? null) : null;
  const plan = useSessionPlan(session?.id ?? null);

  const loading = assigned.loading || (sessions.loading && sessions.data.length === 0);
  const total = programme?.durationWeeks ?? 0;

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
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
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
            <ChevronLeft size={16} color={t.textPrimary} strokeWidth={2.5} />
          </Pressable>
          <View style={{ flex: 1 }} />
          {programme && (
            <Body size={12.5} weight="medium" color={t.textSecondary}>
              {programme.name}
            </Body>
          )}
        </View>

        {loading ? (
          <Card>
            <ActivityIndicator color={t.brand[600]} />
          </Card>
        ) : !programme || !week ? (
          <Card title="No programme on the calendar">
            <Body size={14} color={t.textSecondary}>
              When your physio assigns one, its weeks appear here.
            </Body>
          </Card>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <WeekArrow
                dir="prev"
                disabled={weekNo <= 1}
                onPress={() => router.setParams({ n: String(weekNo - 1) })}
              />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Display size={24}>
                  Week {weekNo}
                  <Text style={{ color: t.textMuted }}> of {total}</Text>
                </Display>
                <Body size={12.5} color={t.textSecondary}>
                  {weekRangeLabel(week.from, week.to)}
                  {week.isCurrent ? ' · this week' : ''}
                  {week.planned
                    ? ` · ${week.done} of ${week.planned} done`
                    : ' · nothing on the calendar'}
                </Body>
              </View>
              <WeekArrow
                dir="next"
                disabled={weekNo >= total}
                onPress={() => router.setParams({ n: String(weekNo + 1) })}
              />
            </View>

            <View style={{ flexDirection: 'row', gap: 6 }}>
              {days.map((d, i) => {
                const s = byDate.get(d);
                const on = d === selected;
                const done = s?.status === 'completed';
                const missed = Boolean(s) && !done && s!.status !== 'in_progress' && d < todayIso;
                const dot = !s
                  ? 'transparent'
                  : done
                    ? on
                      ? '#FFFFFF'
                      : t.status.good
                    : missed
                      ? on
                        ? 'rgba(255,255,255,0.6)'
                        : t.heatmapMissed
                      : on
                        ? 'rgba(255,255,255,0.85)'
                        : t.brand[300];
                return (
                  <Tap
                    key={d}
                    onPress={() => setSelected(d)}
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${WEEKDAYS[i]} ${Number(d.slice(8))}${s ? `, ${s.title}` : ', rest'}`}
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
                      {Number(d.slice(8))}
                    </Text>
                    <View
                      style={{
                        marginTop: 5,
                        width: 7,
                        height: 7,
                        borderRadius: 3.5,
                        backgroundColor: dot,
                      }}
                    />
                  </Tap>
                );
              })}
            </View>

            {!session ? (
              <Rise>
                <Card style={{ borderRadius: 22 }}>
                  <Display size={22}>Rest day</Display>
                  <Body
                    size={13.5}
                    color={t.textSecondary}
                    style={{ marginTop: 6, lineHeight: 19 }}
                  >
                    Nothing on the calendar for {longDay(selected)}. Rest is part of the programme.
                  </Body>
                </Card>
              </Rise>
            ) : (
              <Rise key={session.id}>
                <Card style={{ borderRadius: 22, paddingVertical: 22 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <PlanTag
                      label={
                        session.status === 'completed'
                          ? 'DONE'
                          : session.status === 'in_progress'
                            ? 'STARTED'
                            : session.status === 'skipped'
                              ? 'STOPPED EARLY'
                              : session.scheduledDate < todayIso
                                ? 'MISSED'
                                : session.scheduledDate === todayIso
                                  ? 'TODAY'
                                  : 'PLANNED'
                      }
                      tone={
                        session.status === 'completed'
                          ? t.status.good
                          : session.scheduledDate < todayIso && session.status === 'scheduled'
                            ? t.status.warning
                            : t.brand[600]
                      }
                    />
                    <Body size={12} color={t.textMuted}>
                      {DISCIPLINE_LABEL[session.discipline]} · {longDay(session.scheduledDate)}
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

                  {plan.loading && plan.data.length === 0 ? (
                    <ActivityIndicator color={t.brand[600]} style={{ marginTop: 14 }} />
                  ) : plan.data.length > 0 ? (
                    <View style={{ marginTop: 14, gap: 6 }}>
                      {plan.data.map((item) => {
                        const finished = session.doneItemIds.includes(item.itemId);
                        return (
                          <View
                            key={item.itemId}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 10,
                              backgroundColor: finished
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
                              accessibilityLabel={finished ? 'Done' : undefined}
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 10,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: finished ? t.status.good : 'transparent',
                                borderWidth: finished ? 0 : 1.5,
                                borderColor: t.border,
                              }}
                            >
                              {finished && <Check size={12} color="#FFFFFF" strokeWidth={3.2} />}
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

                  {session.status === 'completed' && plan.data.length > 0 && (
                    <Body size={12.5} color={t.textSecondary} style={{ marginTop: 12 }}>
                      {session.doneItemIds.length === plan.data.length
                        ? 'Every movement finished.'
                        : session.doneItemIds.length === 0
                          ? `Sent with ${session.setsDone ?? 0} of ${session.setsPlanned ?? '?'} sets.`
                          : `${session.doneItemIds.length} of ${plan.data.length} movements finished outright.`}
                    </Body>
                  )}

                  {(session.status === 'scheduled' || session.status === 'in_progress') &&
                    session.scheduledDate <= todayIso && (
                      <View style={{ marginTop: 18 }}>
                        <Link href={`/session/${session.id}`} asChild>
                          <Button
                            label={
                              session.status === 'in_progress' ? 'Resume session' : 'Start session'
                            }
                          />
                        </Link>
                      </View>
                    )}
                </Card>
              </Rise>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function WeekArrow({
  dir,
  disabled,
  onPress,
}: {
  dir: 'prev' | 'next';
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={dir === 'prev' ? 'Previous week' : 'Next week'}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.35 : pressed ? 0.7 : 1,
      })}
    >
      <Icon size={16} color={t.textPrimary} strokeWidth={2.5} />
    </Pressable>
  );
}

function longDay(iso: string | null): string {
  if (!iso) return 'this day';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}
