import { useCallback } from 'react';
import { Link, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adherenceBand, adherenceStyle } from '@vela/shared';
import type { ScheduledSession } from '@vela/api';
import {
  Avatar,
  Body,
  Button,
  Card,
  ChipRow,
  Display,
  Pill,
  ProgressBar,
  Screen,
} from '@/components/kit';
import { useTheme } from '@/theme';
import { useSession } from '@/lib/session';
import {
  addDays,
  latestOf,
  today,
  useMetrics,
  useSessionPlan,
  useUpcoming,
  useWeek,
  weekAdherence,
} from '@/lib/data';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function TodayScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { client } = useSession();

  const week = useWeek();
  const upcoming = useUpcoming(3);
  const metrics = useMetrics(['weight_kg', 'resting_hr', 'steps'], 30);

  const plan = useSessionPlan(week.todaySession?.id ?? null);

  // Coming back from a finished session must not leave "Start session" on screen. The
  // logging screen writes the outcome and pops, so this tab has to refetch on focus
  // rather than trusting the data it loaded on mount.
  useFocusEffect(
    useCallback(() => {
      week.reload();
      metrics.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const adherence = weekAdherence(week.data);
  const band = adherenceBand(adherence.ratio);
  const weight = latestOf(metrics.data, 'weight_kg');

  const firstName = client?.email.split('@')[0]?.split('.')[0] ?? 'there';
  const name = firstName.charAt(0).toUpperCase() + firstName.slice(1);
  const todayIso = today();

  const blocks = [...new Set(plan.data.map((i) => i.block))];
  const estMinutes = Math.round(
    plan.data.reduce((n, i) => n + i.sets * 45 + i.sets * i.restSec, 0) / 60,
  );

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: insets.top + t.space.md,
          paddingBottom: t.space.xxl * 2,
          gap: t.space.md,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Avatar name={name} size={44} />
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: t.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 18 }}>🔔</Text>
          </View>
        </View>

        <View style={{ marginTop: t.space.sm }}>
          <Text>
            <Text style={{ fontFamily: t.font.display, fontSize: 34, letterSpacing: -1, color: t.textMuted }}>
              Hello!{' '}
            </Text>
            <Text style={{ fontFamily: t.font.display, fontSize: 34, letterSpacing: -1, color: t.textPrimary }}>
              {name}
            </Text>
          </Text>
          <Body size={14} color={t.textSecondary} style={{ marginTop: 2 }}>
            {client?.weeksPostpartum != null
              ? `Week ${client.weeksPostpartum} postpartum`
              : client?.goal || 'Welcome back'}
          </Body>
        </View>

        <WeekStrip sessions={week.data} weekStart={week.weekStart} todayIso={todayIso} />

        {client?.weeksPostpartum != null && (
          <Link href="/readiness" asChild>
            <Pressable>
              <Card fill={t.dark ? 'rgba(255,255,255,0.05)' : t.tint.cream}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.lg }}>
                  <Text style={{ fontSize: 28 }}>🏃‍♀️</Text>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: t.font.displayBold,
                        fontSize: 15,
                        letterSpacing: -0.3,
                        color: t.textPrimary,
                      }}
                    >
                      {client.weeksPostpartum >= 12
                        ? 'Ready to check your return to running?'
                        : 'Return-to-running check from week 12'}
                    </Text>
                    <Body size={12} color={t.textSecondary} style={{ marginTop: 2 }}>
                      {client.weeksPostpartum >= 12
                        ? 'Seven load tests and four strength tests, with your physio'
                        : `You're at week ${client.weeksPostpartum} — we'll build the base first`}
                    </Body>
                  </View>
                </View>
              </Card>
            </Pressable>
          </Link>
        )}

        {week.loading ? (
          <Card>
            <ActivityIndicator color={t.brand[600]} />
          </Card>
        ) : week.todaySession ? (
          <Card
            title="Today's session"
            right={
              estMinutes > 0 ? (
                <Body size={12} color={t.textMuted}>
                  ~{estMinutes} min
                </Body>
              ) : undefined
            }
          >
            <Display size={24}>{week.todaySession.title}</Display>
            <Body size={13} color={t.textSecondary} style={{ marginTop: 3 }}>
              {plan.data.length} exercises · {plan.data.reduce((n, i) => n + i.sets, 0)} sets
            </Body>

            <View style={{ marginTop: t.space.lg, gap: t.space.md }}>
              {blocks.map((b) => (
                <View key={b} style={{ gap: 6 }}>
                  <Body size={11} weight="bold" color={t.textMuted}>
                    BLOCK {b}
                  </Body>
                  {plan.data
                    .filter((i) => i.block === b)
                    .map((i) => (
                      <ChipRow key={i.itemId}>
                        <View
                          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.brand[400] }}
                        />
                        <Body size={14} weight="medium" style={{ flex: 1 }}>
                          {i.exerciseName}
                        </Body>
                        <Body size={13} color={t.textSecondary}>
                          {i.sets} × {i.reps}
                          {i.targetLoadKg ? ` · ${i.targetLoadKg} kg` : ''}
                        </Body>
                      </ChipRow>
                    ))}
                </View>
              ))}
            </View>

            <View style={{ marginTop: t.space.xl }}>
              {week.todaySession.status === 'completed' ? (
                <View style={{ alignItems: 'flex-start', gap: t.space.md }}>
                  <Pill tone="good">Done today</Pill>
                  <Body size={13} color={t.textSecondary}>
                    Logged and sent to your physio. Nothing else needed today.
                  </Body>
                </View>
              ) : (
                <Link href={`/session/${week.todaySession.id}`} asChild>
                  <Button
                    label={
                      week.todaySession.status === 'in_progress'
                        ? 'Resume session'
                        : 'Start session'
                    }
                  />
                </Link>
              )}
            </View>
          </Card>
        ) : (
          <Card title="Rest day">
            <Body size={14} color={t.textSecondary}>
              Nothing scheduled today. Rest is part of the programme, not a gap in it.
            </Body>
            {upcoming.data.length > 0 && (
              <View style={{ marginTop: t.space.lg, gap: 8 }}>
                <Body size={11} weight="bold" color={t.textMuted}>
                  COMING UP
                </Body>
                {upcoming.data.map((s) => (
                  <ChipRow key={s.id}>
                    <Body size={14} weight="medium" style={{ flex: 1 }}>
                      {s.title}
                    </Body>
                    <Body size={13} color={t.textSecondary}>
                      {friendlyDate(s.scheduledDate, todayIso)}
                    </Body>
                  </ChipRow>
                ))}
              </View>
            )}
          </Card>
        )}

        <Card title="This week">
          <View style={{ gap: t.space.lg }}>
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Body size={13} color={t.textSecondary}>
                  {adherence.due === 0 ? 'Sessions so far' : 'Sessions completed'}
                </Body>
                <Body size={13} weight="semibold">
                  {adherence.due === 0
                    ? 'Nothing due yet'
                    : `${adherence.completed} of ${adherence.due}`}
                </Body>
              </View>
              <ProgressBar value={adherence.ratio} color={adherenceStyle[band].color} />
            </View>

            <View style={{ flexDirection: 'row' }}>
              <Stat label="Scheduled" value={String(week.data.length)} />
              <Stat
                label="Weight"
                value={weight ? weight.value.toFixed(1) : '—'}
                unit={weight ? 'kg' : undefined}
              />
              <Stat
                label="Readings"
                value={String(metrics.data.length)}
                unit={metrics.data.length ? '30d' : undefined}
              />
            </View>
          </View>
        </Card>

        <Link href="/health" asChild>
          <Pressable>
            <Card title="Apple Health">
              <Body size={13} color={t.textSecondary}>
                {metrics.data.length > 0
                  ? 'Weight, resting heart rate and steps are syncing.'
                  : 'Connect Apple Health so your physio can see how training is landing.'}
              </Body>
              <View style={{ marginTop: t.space.md }}>
                <Pill tone={metrics.data.length > 0 ? 'good' : 'warning'}>
                  {metrics.data.length > 0 ? `${metrics.data.length} readings` : 'Not connected'}
                </Pill>
              </View>
            </Card>
          </Pressable>
        </Link>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Body size={12} color={t.textSecondary}>
        {label}
      </Body>
      <Text
        style={{
          fontFamily: t.font.display,
          fontSize: 22,
          letterSpacing: -0.6,
          color: t.textPrimary,
          marginTop: 2,
        }}
      >
        {value}
        {unit && (
          <Text style={{ fontFamily: t.font.medium, fontSize: 12, color: t.textMuted }}> {unit}</Text>
        )}
      </Text>
    </View>
  );
}

function WeekStrip({
  sessions,
  weekStart,
  todayIso,
}: {
  sessions: ScheduledSession[];
  weekStart: string;
  todayIso: string;
}) {
  const t = useTheme();
  const byDate = new Map(sessions.map((s) => [s.scheduledDate, s]));

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: t.space.sm }}>
      {WEEKDAYS.map((label, i) => {
        const iso = addDays(weekStart, i);
        const s = byDate.get(iso);
        const isToday = iso === todayIso;
        const done = s?.status === 'completed';
        const scheduled = Boolean(s) && !done;

        return (
          <View key={label} style={{ alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                borderWidth: isToday ? 3 : 2,
                borderColor: done
                  ? t.brand[600]
                  : isToday
                    ? t.accent[500]
                    : scheduled
                      ? t.brand[300]
                      : t.grid,
                backgroundColor: done ? t.brand[600] : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {done ? (
                <Text style={{ color: '#fff', fontSize: 14 }}>✓</Text>
              ) : scheduled ? (
                <View
                  style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.brand[500] }}
                />
              ) : null}
            </View>
            <Body
              size={11}
              color={isToday ? t.textPrimary : t.textMuted}
              weight={isToday ? 'semibold' : 'regular'}
            >
              {label}
            </Body>
          </View>
        );
      })}
    </View>
  );
}

function friendlyDate(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'Today';
  if (iso === addDays(todayIso, 1)) return 'Tomorrow';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
