import { useCallback, useState } from 'react';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Frown, Laugh, Meh, Smile, SmilePlus, Utensils } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activePlan, planMinutes, type RecoveryBand } from '@vela/shared';
import { VelaIcon as VelaGlyph } from '@/components/brand';
import {
  Body,
  Button,
  Card,
  ChipRow,
  Display,
  DosePill,
  PlanRow,
  PlanTag,
  Screen,
  StatTile,
} from '@/components/kit';
import { VelaIcon } from '@/components/brand';
import { HeroBand } from '@/components/hero';
import { Mascot, TrendGauge, type MascotMood } from '@/components/mascot';
import { RingStat } from '@/components/rings';
import { CheckInCard } from '@/components/checkin';
import { Illustration } from '@/components/Illustration';
import { useTheme } from '@/theme';
import { useSession } from '@/lib/session';
import {
  addDays,
  localDay,
  today,
  useNutrition,
  useSessionPlan,
  useUpcoming,
  useWeek,
  weekAdherence,
  useAssignedProgram,
  useWeeklyPlan,
} from '@/lib/data';
import { useDailyRead } from '@/lib/daily';
import { syncHealthNow } from '@/lib/healthSync';
import { useVitality } from '@/lib/vitality';
import { useActivities } from '@/lib/integrations';
import { ActivityCard } from '@/components/activity-card';

/**
 * Today, rebuilt to the "Coaching App Flow Redesign" prototype.
 *
 * The screen leads with the readiness read rather than the roster of what is scheduled,
 * because the whole point of the redesign is that readiness gates the prescription. The
 * band, the two tiles and the plan card are three answers to one question — how is today,
 * and what does that make of it — in descending order of abstraction.
 */
export default function TodayScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client } = useSession();

  const week = useWeek();
  const assigned = useAssignedProgram();
  const weekly = useWeeklyPlan();
  const upcoming = useUpcoming(3);
  const plan = useSessionPlan(week.todaySession?.id ?? null);
  const nutrition = useNutrition(1);
  const daily = useDailyRead();
  const vitality = useVitality(daily.current);
  const activities = useActivities(7);
  /** Today's session came from a recorded activity rather than the plan: no prescription to show. */
  const recorded = Boolean(
    week.todaySession && activities.data.some((a) => a.sessionId === week.todaySession!.id),
  );

  // Coming back from a finished session must not leave "Start session" on screen. The
  // logging screen writes the outcome and pops, so this tab has to refetch on focus
  // rather than trusting the data it loaded on mount.
  useFocusEffect(
    useCallback(() => {
      week.reload();
      nutrition.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const [refreshing, setRefreshing] = useState(false);

  /**
   * Pull to refresh.
   *
   * Everything on this screen is a read of something that can change from elsewhere — a
   * session logged on another device, a plan the physio just assigned, an overnight
   * HealthKit backfill — so the gesture reloads all of it rather than one thing.
   *
   * The spinner is held until every read settles. Dropping it on the first response makes
   * the pull feel broken when the slowest number arrives a beat after the spinner leaves.
   */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        week.reload(),
        nutrition.reload(),
        daily.reload(),
        plan.reload(),
        // A pull is an explicit ask, so it bypasses the automatic sync's interval and
        // re-reads Apple Health before the dials redraw. Without this the gesture claimed
        // to pick up "an overnight backfill" and did nothing of the kind — it reloaded the
        // same rows the backfill had not yet been imported into.
        syncHealthNow().then(() => vitality.reload()),
        assigned.reload(),
        weekly.reload(),
      ]);
    } finally {
      setRefreshing(false);
    }
    // Depends on the reloaders rather than on nothing. With an empty list this captured the
    // closures as they were at mount — and at mount `client` is still null, so every one of
    // them was a no-op that returned immediately and refreshed precisely nothing.
  }, [
    week.reload,
    nutrition.reload,
    daily.reload,
    plan.reload,
    vitality.reload,
    assigned.reload,
    weekly.reload,
  ]);

  // Her name as her physio wrote it on the invite; the email's first word only as a
  // last resort, which is how "Marta.rossi" once greeted Marta.
  const fallback = client?.email.split('@')[0]?.split('.')[0] || 'there';
  const name = client?.firstName ?? fallback.charAt(0).toUpperCase() + fallback.slice(1);
  const writtenPlan = Boolean(weekly.data) || assigned.data?.kind === 'descriptive';
  const todayIso = today();

  const active = activePlan(plan.data, daily.current, daily.read.symptom);
  const mins = planMinutes(active.items.map((i) => ({ sets: i.sets, restSec: i.restSec })));

  const started = week.todaySession?.status === 'in_progress';
  const done = week.todaySession?.status === 'completed';

  /**
   * The dial's colour follows recovery, not readiness.
   *
   * Readiness is one of three inputs now, so colouring the ring by it would have the ring
   * disagree with the number printed beside it whenever sleep or HRV pulled the other way.
   */
  const recoveryTone =
    vitality.recovery.score === null ? t.textMuted : BAND_TONE(t)[vitality.recovery.band];
  const recoveryToneSoft =
    vitality.recovery.score === null ? t.textMuted : BAND_TONE_SOFT(t)[vitality.recovery.band];

  // `useNutrition(1)` windows to today alone, so `days` holds at most one row. Reading the
  // rolled-up day rather than summing entries here keeps one definition of a daily total.
  const dayTotals = nutrition.data.days.find((d) => d.day === todayIso);
  const kcal = Math.round(dayTotals?.kcal ?? 0);
  const target = nutrition.data.target?.kcal ?? null;

  // `meal` on a log entry is already the four-slot enum the redesign asks for, so the strip
  // reads real state rather than a placeholder.
  const loggedSlots = Object.fromEntries(
    t.mealSlots.map((s) => [s.key, nutrition.data.entries.some((e) => e.meal === s.key)]),
  );
  const slotCount = Object.values(loggedSlots).filter(Boolean).length;
  const weekSoFar = weekAdherence(week.data);

  /** What the ring under the mascot says about today's session. */
  const activityRing: { value: number | null; label: string } = !week.todaySession
    ? { value: null, label: 'Rest day' }
    : done
      ? { value: 1, label: 'Session done' }
      : started
        ? { value: 0.5, label: 'In progress' }
        : recorded
          ? { value: 1, label: 'Recorded' }
          : { value: 0, label: `${active.items.length || 1} session · ${mins} min` };

  /**
   * How the day is trending, as one figure: recovery when it has been read, otherwise
   * her own read, otherwise nothing. Above the middle mark she is up for it; below it she
   * is tired — the arc turns orange and the mascot is asleep before a single number says so.
   */
  const trend: number | null =
    vitality.recovery.score !== null
      ? vitality.recovery.score / 100
      : daily.current !== null
        ? daily.current / 4
        : null;
  const mascotMood: MascotMood = trend !== null && trend < 0.5 ? 'sleep' : 'greeting';

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.space.lg,
          paddingBottom: t.space.xxl * 3,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={t.brand[600]}
            colors={[t.brand[600]]}
          />
        }
      >
        <HeroBand>
          <View style={{ paddingTop: insets.top + 10, alignItems: 'center' }}>
            {/* The mascot, under the trend gauge: how today is going, before any number. */}
            <TrendGauge
              value={trend}
              tone={trend !== null && trend >= 0.5 ? t.status.good : t.status.seriousFill}
            >
              <Mascot mood={mascotMood} size={172} />
            </TrendGauge>

            <Text
              style={{
                fontFamily: t.font.regular,
                fontSize: 15,
                lineHeight: 21,
                color: t.textPrimary,
                textAlign: 'center',
                marginTop: 4,
                paddingHorizontal: 8,
              }}
            >
              {/* The week's HRV through the training decision tree, crossed with her read,
                  once there is a range to read it against; the recovery note until then. */}
              {vitality.guidance
                ? vitality.guidance.note
                : vitality.recovery.score === null
                  ? greeting(name, daily.current, done, Boolean(week.todaySession), writtenPlan)
                  : vitality.recovery.note}
            </Text>
            <Body size={11} color={t.textSecondary} style={{ textAlign: 'center', marginTop: 6 }}>
              {vitality.recovery.score === null
                ? 'Recovery not read yet'
                : `Recovery ${vitality.recovery.score}% · ${BAND_WORD[vitality.recovery.band].toLowerCase()}`}
              {vitality.strain.score > 0 ? ` · effort today ${vitality.strain.score}%` : ''}
              {vitality.recovery.score !== null && vitality.recovery.estimated
                ? ' · from how you feel'
                : ''}
            </Body>
            {vitality.guidance ? (
              <Body size={11} color={t.textSecondary} style={{ textAlign: 'center', marginTop: 2 }}>
                {vitality.guidance.summary}
              </Body>
            ) : null}

            <View style={{ flexDirection: 'row', marginTop: 22, width: '100%' }}>
              <RingStat
                value={activityRing.value}
                color={t.status.good}
                icon={
                  <VelaGlyph
                    name="program-block"
                    size={24}
                    color={t.status.good}
                    strokeWidth={2.2}
                  />
                }
                label={activityRing.label}
                onPress={() =>
                  router.push(
                    week.todaySession ? `/session/${week.todaySession.id}` : '/(tabs)/progress',
                  )
                }
                onAdd={() =>
                  router.push(
                    week.todaySession ? `/session/${week.todaySession.id}` : '/(tabs)/progress',
                  )
                }
                addLabel="Open today's session"
              />
              <RingStat
                value={target ? Math.min(1, kcal / target) : kcal > 0 ? 1 : 0}
                color="#9A6BFF"
                icon={<Utensils size={22} color="#9A6BFF" strokeWidth={2.2} />}
                label={
                  target
                    ? `${Math.max(0, target - kcal).toLocaleString('en-GB')} kcal left`
                    : kcal
                      ? `${kcal.toLocaleString('en-GB')} kcal`
                      : 'No meals yet'
                }
                onPress={() => router.push('/(tabs)/nutrition')}
                onAdd={() => router.push('/food/add')}
                addLabel="Log a meal"
              />
              <RingStat
                value={daily.current === null ? null : (daily.current + 1) / 5}
                color={daily.current === null ? t.textMuted : t.tide[daily.current]!.tone}
                icon={
                  <MoodIcon
                    level={daily.current}
                    color={daily.current === null ? t.textMuted : t.tide[daily.current]!.tone}
                  />
                }
                label={
                  daily.current === null
                    ? 'How do you feel?'
                    : `${t.tide[daily.current]!.label} · ${capitalise(daily.currentWindow ?? daily.openWindow)}`
                }
                onPress={() => router.push('/mood')}
                onAdd={() => router.push('/mood')}
                addLabel="Log how you feel"
              />
            </View>
          </View>
        </HeroBand>

        <CheckInCard
          completed={weekSoFar.completed}
          due={weekSoFar.due}
          goal={client?.goal ?? null}
          hasWrittenPlan={writtenPlan}
          allLogged={daily.allLogged}
          readGiven={daily.current !== null}
        />

        {/* This week's plan from the physio: written on her page or sent from her Claude,
            read live here. A plan written for a coming week says so. */}
        {weekly.data ? (
          <Link href="/weekly" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel="Read this week's plan">
              <Card style={{ borderRadius: 22, paddingVertical: 20 }}>
                <PlanTag label={weeklyLabel(weekly.data.weekStart, todayIso)} tone={t.brand[600]} />
                <Body size={15} style={{ marginTop: 10, lineHeight: 21 }} numberOfLines={5}>
                  {weekly.data.body}
                </Body>
                <Body size={12} color={t.textMuted} style={{ marginTop: 8 }}>
                  {`Updated ${friendlyDate(localDay(weekly.data.updatedAt), todayIso)}${
                    weekly.data.via === 'assistant'
                      ? ' · drafted with her assistant, sent by her'
                      : ''
                  }`}
                </Body>
                <Body size={13} weight="medium" color={t.brand[600]} style={{ marginTop: 8 }}>
                  Read it through →
                </Body>
              </Card>
            </Pressable>
          </Link>
        ) : null}

        {/* A written programme: the text is the plan, so it comes before the day's session
            card, which for such a programme is a rest day with nothing on the calendar.
            When a weekly plan is showing it is the thing to read, and the programme behind
            it folds to a line. */}
        {assigned.data?.kind === 'descriptive' && assigned.data.body && weekly.data ? (
          <Link href="/program" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel="Read your programme">
              <Card style={{ borderRadius: 18, paddingVertical: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Body size={13} color={t.textSecondary} style={{ flex: 1 }} numberOfLines={1}>
                    Your programme · {assigned.data.name}
                  </Body>
                  <Body size={13} weight="medium" color={t.brand[600]}>
                    Read →
                  </Body>
                </View>
              </Card>
            </Pressable>
          </Link>
        ) : assigned.data?.kind === 'descriptive' && assigned.data.body ? (
          <Link href="/program" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel="Read your programme">
              <Card style={{ borderRadius: 22, paddingVertical: 20 }}>
                <PlanTag label="YOUR PROGRAMME" tone={t.brand[600]} />
                <Display size={22} style={{ marginTop: 10 }}>
                  {assigned.data.name}
                </Display>
                <Body
                  size={14}
                  color={t.textSecondary}
                  style={{ marginTop: 6, lineHeight: 20 }}
                  numberOfLines={4}
                >
                  {assigned.data.body}
                </Body>
                <Body size={13} weight="medium" color={t.brand[600]} style={{ marginTop: 12 }}>
                  Read it through →
                </Body>
              </Card>
            </Pressable>
          </Link>
        ) : null}

        {week.loading ? (
          <Card>
            <ActivityIndicator color={t.brand[600]} />
          </Card>
        ) : week.todaySession ? (
          <Card style={{ borderRadius: 22, paddingVertical: 22 }}>
            <PlanTag label={active.tag} tone={active.tone} />

            <Display size={24} style={{ marginTop: 12 }}>
              {week.todaySession.title}
            </Display>
            <Body size={13.5} color={t.textSecondary} style={{ marginTop: 4, lineHeight: 19 }}>
              {active.note}
            </Body>

            {recorded ? (
              <Body size={13} color={t.textSecondary} style={{ marginTop: 14 }}>
                Recorded on Strava — the details are in the activity card below.
              </Body>
            ) : (
              <>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                  <StatTile label="TIME" value={String(mins)} unit="min" dark flex={1.3} />
                  <StatTile label="MOVES" value={String(active.items.length)} />
                  <StatTile label="SETS" value={String(active.setCount)} />
                </View>

                <View style={{ marginTop: 12, gap: 6 }}>
                  {active.items.map((i) => (
                    <PlanRow
                      key={i.itemId}
                      name={i.exerciseName}
                      dose={
                        `${i.sets} × ${i.reps}` +
                        (!active.dropLoad && i.targetLoadKg ? ` · ${i.targetLoadKg} kg` : '')
                      }
                    />
                  ))}
                </View>
              </>
            )}

            <View style={{ marginTop: 22 }}>
              {done ? (
                <ChipRow>
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: t.status.good,
                    }}
                  />
                  <Body size={13} color={t.textSecondary} style={{ flex: 1 }}>
                    Logged and sent to your physio. Nothing else needed today.
                  </Body>
                </ChipRow>
              ) : (
                <Link href={`/session/${week.todaySession.id}`} asChild>
                  <Button label={started ? 'Resume session' : 'Start session'} />
                </Link>
              )}
            </View>
          </Card>
        ) : (
          <Card
            title={writtenPlan ? 'Nothing on the calendar' : 'Rest day'}
            style={{ borderRadius: 22 }}
          >
            <View style={{ alignItems: 'center', marginBottom: t.space.md }}>
              <Illustration name="rest" width={168} />
            </View>
            <Body size={14} color={t.textSecondary}>
              {writtenPlan
                ? 'Your week is in the plan above rather than on the calendar by the day. Log a walk or a run when you do one.'
                : 'Nothing scheduled today. Rest is part of the programme, not a gap in it.'}
            </Body>
            {upcoming.data.length > 0 && (
              <View style={{ marginTop: t.space.lg, gap: 6 }}>
                <Body size={11} weight="bold" color={t.textMuted} style={{ letterSpacing: 0.5 }}>
                  COMING UP
                </Body>
                {upcoming.data.map((s) => (
                  <View
                    key={s.id}
                    style={{
                      backgroundColor: t.softFill,
                      borderRadius: t.radius.md,
                      paddingVertical: 11,
                      paddingHorizontal: 14,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <Body size={15} weight="medium" style={{ flex: 1 }}>
                      {s.title}
                    </Body>
                    <DosePill>{friendlyDate(s.scheduledDate, todayIso)}</DosePill>
                  </View>
                ))}
              </View>
            )}
          </Card>
        )}

        {activities.data[0] && (
          <ActivityCard
            activity={activities.data[0]}
            note={
              activities.data[0].sessionId &&
              week.todaySession &&
              activities.data[0].sessionId === week.todaySession.id
                ? `Counted as today's ${week.todaySession.title.toLowerCase()}.`
                : activities.data[0].sessionId
                  ? 'Counted as a session in your plan.'
                  : undefined
            }
          />
        )}

        {client?.weeksPostpartum != null && (
          <Link href="/readiness" asChild>
            <Pressable>
              <Card
                fill={t.dark ? 'rgba(92,135,247,0.12)' : t.tint.peach}
                style={{ borderRadius: 22 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.lg }}>
                  <VelaIcon name="readiness" size={28} color={t.brand[600]} strokeWidth={2} />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: t.font.displaySemi,
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
      </ScrollView>
    </Screen>
  );
}

/** Band → the word under the recovery figure. */
const BAND_WORD: Record<RecoveryBand, string> = {
  low: 'LOW',
  moderate: 'MODERATE',
  good: 'GOOD',
  strong: 'STRONG',
};

/**
 * Band → the dial's colour, in blue.
 *
 * Traffic-light colour is gone on purpose. Amber and green made a number that is often
 * simply "an ordinary Tuesday" look like a verdict, and the one thing a postpartum client
 * does not need on opening an app is her body graded in the colours of a warning sign. The
 * band word underneath already says LOW or GOOD; the ring only has to be legible.
 *
 * So the scale is saturation within one hue: pale for low, full brand blue for strong. It
 * reads as more or less of the same thing, which is what recovery is.
 */
const BAND_TONE = (t: ReturnType<typeof useTheme>): Record<RecoveryBand, string> => ({
  low: t.brand[300],
  moderate: t.brand[400],
  good: t.brand[500],
  strong: t.brand[600],
});

/** The lighter end of each band's gradient, so the arc has depth rather than one flat ink. */
const BAND_TONE_SOFT = (t: ReturnType<typeof useTheme>): Record<RecoveryBand, string> => ({
  low: t.brand[200],
  moderate: t.brand[300],
  good: t.brand[400],
  strong: t.brand[500],
});

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * "Read from 6 signals · plus your read" — what stood behind the measured score.
 *
 * Counts measurements, not the daily read, and names the one signal when there is only
 * one, because "read from 1 signal" hides the fact that matters: which one.
 */
function signalLine(sources: string[]): string {
  const measured = sources.filter((s) => s !== 'how you feel');
  const base =
    measured.length === 1
      ? `Read from ${measured[0]} alone`
      : `Read from ${measured.length} signals`;
  return sources.length > measured.length ? `${base} · plus your read` : base;
}

/**
 * The one sentence on the band.
 *
 * Warm but flat, per the handoff — no exclamation marks and no hype. It states the
 * situation and stops; the plan card does the explaining.
 */
function greeting(
  name: string,
  readiness: number | null,
  done: boolean,
  hasSession: boolean,
  writtenPlan: boolean,
): string {
  if (done) return `That's it logged, ${name}. Nothing else needed today.`;
  // On a written plan nothing sits on the calendar by the day; the week is in the text.
  if (!hasSession && writtenPlan)
    return `Your week is written out below, ${name}. Read it when you're ready.`;
  if (!hasSession) return `No session today, ${name}. Rest counts as programme.`;
  if (readiness === null)
    return `Morning, ${name}. Tell me how today feels and I'll set the session.`;
  if (readiness <= 1) return `Gently today, ${name}. Something is better than the full thing.`;
  if (readiness >= 4) return `You're in good shape today, ${name}. There's room if you want it.`;
  return `Good to see you, ${name}. Today is ready when you are.`;
}

/** "THIS WEEK FROM YOUR PHYSIO", or which week it is for when it is not this one. */
function weeklyLabel(weekStart: string, todayIso: string): string {
  const [y, m, d] = todayIso.split('-').map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  const monday = addDays(todayIso, -((dt.getDay() + 6) % 7));
  if (weekStart === monday) return 'THIS WEEK FROM YOUR PHYSIO';
  if (weekStart > monday)
    return `FROM ${friendlyDate(weekStart, todayIso).toUpperCase()} · FROM YOUR PHYSIO`;
  return `WEEK OF ${friendlyDate(weekStart, todayIso).toUpperCase()} · FROM YOUR PHYSIO`;
}

function friendlyDate(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'Today';
  if (iso === addDays(todayIso, 1)) return 'Tomorrow';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * The mood ring's icon, calibrated to the five reads: from a frown at Depleted to a laugh
 * at Strong. One family of faces, so the scale reads as one thing at different levels.
 */
function MoodIcon({ level, color }: { level: number | null; color: string }) {
  const props = { size: 22, color, strokeWidth: 2.2 };
  switch (level) {
    case 0:
      return <Frown {...props} />;
    case 1:
      return <Meh {...props} />;
    case 2:
      return <Smile {...props} />;
    case 3:
      return <SmilePlus {...props} />;
    case 4:
      return <Laugh {...props} />;
    default:
      return <Smile {...props} />;
  }
}
