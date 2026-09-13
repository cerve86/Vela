import { useCallback, useMemo, useState } from 'react';
import { Link, useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarDays, ChevronRight, Trophy, Users } from 'lucide-react-native';
import { METRIC_META, challengeWeekNow, type MetricType } from '@vela/api';
import {
  RECENT_DAYS,
  deriveMilestones,
  programmeWeeks,
  weekColumnCounts,
  weekRangeLabel,
  type Milestone,
  type ProgrammeWeek,
} from '@vela/shared';
import { Body, Card, Display, Screen } from '@/components/kit';
import { Rise, Tap } from '@/components/motion';
import { Heatmap, MonoChart, MonoHeader, TrendChart, type CellState } from '@/components/charts';
import { MilestoneBlob } from '@/components/blobs';
import { VelaIcon } from '@/components/brand';
import { Illustration } from '@/components/Illustration';
import { useTheme } from '@/theme';
import { useSession } from '@/lib/session';
import {
  addDays,
  localDay,
  startOfWeek,
  today,
  useAssignedProgram,
  useHistory,
  useMetrics,
  useNutrition,
  useProgrammeSessions,
} from '@/lib/data';
import { useMyChallenges, type ClientChallenge } from '@/lib/challenges';

/**
 * Progress: consistency first, measurements second.
 *
 * The ordering is the argument. Someone rehabilitating wants to know whether she is
 * showing up before she wants to know what her heart rate variability did, and putting
 * vitals at the top would quietly make the body's numbers the score. Attendance is the
 * thing she controls.
 */

/** Metrics offered in the vitals chart, in the order the chips appear. */
const CHART_METRICS: MetricType[] = ['resting_hr', 'hrv_ms', 'weight_kg', 'steps'];

/** Which direction is the good one, per metric. */
const GOOD_DOWN: Partial<Record<MetricType, boolean>> = {
  resting_hr: true,
  weight_kg: false,
  hrv_ms: false,
  steps: false,
  vo2max: false,
};

const WEEKS_SHOWN = 16;

export default function ProgressScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { client } = useSession();

  const history = useHistory(WEEKS_SHOWN);
  const metrics = useMetrics(CHART_METRICS, WEEKS_SHOWN * 7);
  // Two weeks is enough for the fuel streak, which caps at seven days and only ever counts
  // backwards from today. Pulling sixteen weeks of meals to answer that would be waste.
  const nutrition = useNutrition(14);
  const challenges = useMyChallenges();
  const assigned = useAssignedProgram();
  const programme = assigned.data?.kind === 'structured' ? assigned.data : null;
  const programmeSessions = useProgrammeSessions(programme);

  const [metric, setMetric] = useState<MetricType>('resting_hr');
  /** How far back the vitals chart looks: one, two or four weeks. */
  const [rangeDays, setRangeDays] = useState<7 | 14 | 28>(14);

  useFocusEffect(
    useCallback(() => {
      history.reload();
      metrics.reload();
      nutrition.reload();
      assigned.reload();
      programmeSessions.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  /**
   * Weekly means rather than every reading.
   *
   * Plotted raw, four months of daily Apple Health data is a sawtooth 300px wide — the
   * day-to-day noise is taller than the trend underneath it, so the shape reads as chaos
   * and the one thing the chart exists to show is the thing you cannot see. A weekly mean
   * is the smallest honest smoothing: it drops no data, it just stops pretending the
   * pixel budget can resolve 112 points.
   */
  /**
   * One value per day over the chosen range — the last reading of each day, so a day with
   * three weigh-ins is one point. Four weeks is 28 points on a 300px chart, which the eye
   * can still resolve, and one week is seven; the weekly means the sixteen-week view needed
   * are no longer the question this chart answers.
   */
  const series = useMemo(() => {
    const from = addDays(today(), -(rangeDays - 1));
    const byDay = new Map<string, number>();
    for (const m of metrics.data.filter((x) => x.type === metric)) {
      const day = localDay(m.recordedAt);
      if (day >= from) byDay.set(day, m.value);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  }, [metrics.data, metric, rangeDays]);

  const { weeks, kept, scheduled, columnStarts } = useMemo(
    () => buildHeatmap(history.data),
    [history.data],
  );

  /**
   * The programme laid over the grid: a figure under each column it touches — done over
   * planned — and a bar bracketing its columns. The grid's weeks start on Sunday and the
   * programme's on whatever day it was assigned from, so the figures follow the columns.
   */
  const programmeMarks = useMemo(() => {
    if (!programme) return { labels: undefined, mark: null };
    const counts = weekColumnCounts(columnStarts, programmeSessions.data);
    const touched = counts.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    return {
      labels: counts.map((c) => (c ? `${c.done}/${c.planned}` : null)),
      mark: touched.length ? { from: touched[0]!, to: touched[touched.length - 1]! } : null,
    };
  }, [programme, columnStarts, programmeSessions.data]);

  const todayIsoForWeeks = today();
  const blockWeeks = useMemo(
    () =>
      programme
        ? programmeWeeks({
            startDate: programme.startDate,
            durationWeeks: programme.durationWeeks,
            sessions: programmeSessions.data,
            today: todayIsoForWeeks,
          })
        : [],
    [programme, programmeSessions.data, todayIsoForWeeks],
  );

  /** Soreness per week, from the scores actually recorded. No reading, no point. */
  const soreness = useMemo(() => weeklySoreness(history.data), [history.data]);
  const adherence = useMemo(() => weeks.map(weekRatio), [weeks]);
  const trendReady = soreness.filter((v) => v !== null).length >= 2;

  const todayIso = today();

  /**
   * Milestones, computed from the record rather than stored.
   *
   * `fuelDays` is the set of days that hold at least one meal — the streak asks "was
   * anything logged", not how much, so a day with one banana counts the same as a day with
   * four meals. That is the right question for a habit.
   */
  const milestones = useMemo(
    () =>
      deriveMilestones({
        sessions: history.data,
        fuelDays: [...new Set(nutrition.data.entries.map((e) => e.loggedOn))],
        today: todayIso,
      }),
    [history.data, nutrition.data.entries, todayIso],
  );

  const earnedCount = milestones.filter((m) => m.earned).length;

  const loading = history.loading || metrics.loading;
  const meta = METRIC_META[metric];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.space.lg,
          paddingTop: insets.top + t.space.md,
          paddingBottom: t.space.xxl * 3,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Display size={30}>Progress</Display>

        {loading ? (
          <Card style={{ borderRadius: 22 }}>
            <ActivityIndicator color={t.brand[600]} />
          </Card>
        ) : (
          <>
            <Rise>
              <Card style={{ borderRadius: 22 }}>
                <CardHead icon="trend-wave" title="Showing up" />

                <View style={{ flexDirection: 'row', gap: 22, marginTop: 14 }}>
                  <Figure label="KEPT" value={String(kept)} accent />
                  <Figure label="SCHEDULED" value={String(scheduled)} />
                  <Figure
                    label="RATE"
                    value={scheduled ? `${Math.round((kept / scheduled) * 100)}%` : '—'}
                  />
                </View>

                <View style={{ marginTop: 18 }}>
                  <Heatmap
                    weeks={weeks}
                    labels={programmeMarks.labels}
                    mark={programmeMarks.mark}
                  />
                </View>
                {programmeMarks.mark && (
                  <Body size={12} color={t.textMuted} style={{ marginTop: 8, lineHeight: 17 }}>
                    The bar marks your programme; under each of its weeks, sessions done over
                    sessions planned.
                  </Body>
                )}
              </Card>
            </Rise>

            {assigned.data && (
              <Rise delay={40}>
                <ProgrammeCard
                  name={assigned.data.name}
                  durationWeeks={assigned.data.durationWeeks}
                  startDate={assigned.data.startDate}
                  descriptive={assigned.data.kind === 'descriptive'}
                  weeks={blockWeeks}
                  loading={programmeSessions.loading}
                />
              </Rise>
            )}

            <Rise delay={60}>
              <Card style={{ borderRadius: 22 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      backgroundColor: t.tint.cream,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Trophy size={16} color={t.brand[600]} strokeWidth={2.1} />
                  </View>
                  <Body size={13.5} weight="medium" style={{ flex: 1 }}>
                    Milestones
                  </Body>
                  <Body size={12.5} color={t.textSecondary}>
                    {earnedCount} of {milestones.length} earned
                  </Body>
                </View>

                <View style={{ flexDirection: 'row', gap: 9, marginTop: 14 }}>
                  {milestones.map((m, i) => (
                    <MilestoneTile key={m.key} milestone={m} index={i} today={todayIso} />
                  ))}
                </View>
              </Card>
            </Rise>

            {challenges.data.length > 0 && (
              <Rise delay={90}>
                <Card style={{ borderRadius: 22 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        backgroundColor: t.tint.mint,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Users size={16} color={t.status.good} strokeWidth={2.1} />
                    </View>
                    <Body size={13.5} weight="medium" style={{ flex: 1 }}>
                      Together
                    </Body>
                  </View>

                  <View style={{ gap: 16, marginTop: 14 }}>
                    {challenges.data.map((c) => (
                      <ChallengeRow key={c.challenge.id} entry={c} today={todayIso} />
                    ))}
                  </View>

                  <Body size={11} color={t.textMuted} style={{ marginTop: 14, lineHeight: 16 }}>
                    A group total, not a league table. You can see what everyone has done together
                    and what you added — never anybody else&apos;s name or numbers.
                  </Body>
                </Card>
              </Rise>
            )}

            <Rise delay={120}>
              <Card style={{ borderRadius: 22 }}>
                <CardHead icon="trend-wave" title="Sessions against soreness" />
                {trendReady ? (
                  <>
                    <Body
                      size={12.5}
                      color={t.textSecondary}
                      style={{ marginTop: 4, lineHeight: 18 }}
                    >
                      Both on one scale, so the shapes can be compared rather than the numbers.
                    </Body>
                    <View style={{ marginTop: 16 }}>
                      <TrendChart adherence={adherence} soreness={soreness.map((v) => v ?? 0)} />
                    </View>
                  </>
                ) : (
                  <Body size={13} color={t.textSecondary} style={{ marginTop: 8, lineHeight: 19 }}>
                    This needs symptom scores from at least two weeks of sessions. It draws itself
                    once you have logged a few.
                  </Body>
                )}
              </Card>
            </Rise>

            <Rise delay={180}>
              <Card style={{ borderRadius: 22 }}>
                <CardHead icon="pain-point" title="Vitals over time" />

                <View style={{ flexDirection: 'row', gap: 6, marginTop: 14 }}>
                  {CHART_METRICS.map((m) => {
                    const on = m === metric;
                    return (
                      <Tap
                        key={m}
                        onPress={() => setMetric(m)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={{
                          flex: 1,
                          borderRadius: 14,
                          paddingVertical: 9,
                          paddingHorizontal: 4,
                          alignItems: 'center',
                          backgroundColor: on ? t.brand[600] : t.softFill,
                        }}
                      >
                        {/*
                          The chips carry no metric colour on purpose. Two of the four
                          identity hues are too close to tell apart side by side, and a
                          mono chart never needs them — the selected chip is simply brand.
                        */}
                        <Body size={11} weight="medium" color={on ? '#FFFFFF' : t.textSecondary}>
                          {METRIC_META[m].label}
                        </Body>
                      </Tap>
                    );
                  })}
                </View>

                <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                  {([7, 14, 28] as const).map((d) => {
                    const on = d === rangeDays;
                    return (
                      <Tap
                        key={d}
                        onPress={() => setRangeDays(d)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={{
                          flex: 1,
                          borderRadius: 12,
                          paddingVertical: 7,
                          alignItems: 'center',
                          backgroundColor: on ? t.softFill : 'transparent',
                          borderWidth: 1,
                          borderColor: on ? t.border : 'transparent',
                        }}
                      >
                        <Body
                          size={11}
                          weight={on ? 'semibold' : 'medium'}
                          color={on ? t.textPrimary : t.textMuted}
                        >
                          {d === 7 ? '1 week' : d === 14 ? '2 weeks' : '4 weeks'}
                        </Body>
                      </Tap>
                    );
                  })}
                </View>

                {series.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 22, gap: 10 }}>
                    <Illustration name="trend" width={150} />
                    <Body size={13} color={t.textSecondary} style={{ textAlign: 'center' }}>
                      Nothing recorded for {meta.label.toLowerCase()} in the last{' '}
                      {rangeDays === 7 ? 'week' : `${rangeDays / 7} weeks`}. Connect Apple Health
                      from Profile and this fills itself in.
                    </Body>
                  </View>
                ) : (
                  <>
                    <View style={{ marginTop: 20 }}>
                      <MonoHeader
                        label={meta.label}
                        values={series}
                        unit={meta.unit}
                        goodDown={Boolean(GOOD_DOWN[metric])}
                      />
                    </View>
                    <View style={{ marginTop: 12 }}>
                      <MonoChart values={series} goodDown={Boolean(GOOD_DOWN[metric])} />
                    </View>
                  </>
                )}
              </Card>
            </Rise>

            {client?.weeksPostpartum != null && (
              <Rise delay={240}>
                <Link href="/readiness" asChild>
                  <Tap
                    style={{
                      backgroundColor: t.surface,
                      borderWidth: 1,
                      borderColor: t.border,
                      borderRadius: 22,
                      padding: t.space.xl,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: t.space.lg,
                    }}
                  >
                    <VelaIcon name="readiness" size={26} color={t.brand[600]} strokeWidth={2} />
                    <View style={{ flex: 1 }}>
                      <Body size={15} weight="semibold">
                        Return-to-running check
                      </Body>
                      <Body size={12.5} color={t.textSecondary} style={{ marginTop: 2 }}>
                        Seven load tests and four strength tests, with your physio
                      </Body>
                    </View>
                    <ChevronRight size={18} color={t.textMuted} strokeWidth={2.4} />
                  </Tap>
                </Link>
              </Rise>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * One challenge, from the inside.
 *
 * Her own contribution is stated first and the group's second, which is the order that
 * keeps this a personal number with company rather than a ranking. There is deliberately no
 * position, no "you are 4th of 6", and nothing that could be turned into one — the data
 * behind this card is four integers, and none of them belongs to a named person.
 */
function ChallengeRow({ entry, today: todayIso }: { entry: ClientChallenge; today: string }) {
  const t = useTheme();
  const { challenge, standing } = entry;

  const week = challengeWeekNow(challenge.startsOn, challenge.weeks, todayIso);
  const noun = challenge.metric === 'fuel_days' ? 'days' : 'sessions';
  const pct =
    standing.groupTarget > 0
      ? Math.min(100, Math.round((standing.groupTotal / standing.groupTarget) * 100))
      : 0;

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Body size={13.5} weight="medium" style={{ flex: 1 }}>
          {challenge.name}
        </Body>
        <Body size={11} color={t.textSecondary}>
          {week === null ? 'Not started' : `Week ${week} of ${challenge.weeks}`}
        </Body>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
        <Text
          style={{
            fontFamily: t.font.displaySemi,
            fontSize: 26,
            letterSpacing: -1,
            color: t.textPrimary,
            fontVariant: ['tabular-nums'],
          }}
        >
          {standing.mine}
        </Text>
        <Body size={12.5} color={t.textSecondary}>
          {noun} from you
        </Body>
      </View>

      <View
        style={{
          height: 8,
          borderRadius: 999,
          backgroundColor: t.softFill,
          overflow: 'hidden',
          marginTop: 10,
        }}
      >
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: t.status.good }} />
      </View>

      <Body size={11.5} color={t.textSecondary} style={{ marginTop: 7 }}>
        {standing.groupTotal} of {standing.groupTarget} together, across {standing.participants}{' '}
        {standing.participants === 1 ? 'person' : 'people'}
      </Body>
    </View>
  );
}

/**
 * One milestone tile: title, where it stands, and the character underneath.
 *
 * The character is cropped off the bottom-right corner, per the handoff — a full-bleed
 * figure competes with the copy for the same small space, and the crop is what lets the tile
 * stay a label with a character in it rather than a picture with a caption.
 *
 * Three visual states, and the distinction between the first two is the point of the whole
 * card. A milestone earned this week hops and throws motes; one earned a month ago keeps its
 * ring but settles into a drift. Left hopping forever it would stop meaning "this just
 * happened" — which is the only thing a celebration can mean.
 */
function MilestoneTile({
  milestone,
  index,
  today: todayIso,
}: {
  milestone: Milestone;
  index: number;
  today: string;
}) {
  const t = useTheme();

  const fresh = milestone.earned && daysSince(milestone.earnedOn, todayIso) <= RECENT_DAYS;
  const state = fresh ? 'fresh' : milestone.earned ? 'earned' : 'dormant';

  // The ring is the earned signal that survives Reduce Motion, when none of the animation
  // does. Tinted to the character so the tile reads correctly at a glance.
  const ring = milestone.earned ? RING[milestone.character] : t.border;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.dark ? t.softFill : '#F7F8FB',
        borderRadius: 22,
        borderWidth: 1.5,
        borderColor: ring,
        paddingTop: 13,
        paddingHorizontal: 11,
        overflow: 'hidden',
        minHeight: 126,
      }}
    >
      {/*
        12.5/15.5 rather than the handoff's 13.5/17. The prototype's frame is 402pt wide and
        breaks each title over two lines; three tiles inside 375pt leaves ~103pt each, where
        13.5 pushes "Fuel logged seven days" onto four lines and doubles the tile's height.
        Dropping a point buys the line back without shrinking the character.
      */}
      <Text
        style={{
          fontFamily: t.font.displaySemi,
          fontSize: 12.5,
          lineHeight: 15.5,
          color: t.textPrimary,
        }}
      >
        {milestone.title}
      </Text>
      <Body
        size={11}
        color={milestone.earned ? t.status.good : t.textSecondary}
        style={{ marginTop: 3 }}
      >
        {milestone.label}
      </Body>

      <View
        style={{ marginTop: 'auto', alignItems: 'flex-end', marginRight: -8, marginBottom: -12 }}
      >
        <MilestoneBlob character={milestone.character} state={state} index={index} width={86} />
      </View>
    </View>
  );
}

/** Earned-ring tints, at the handoff's .35 alpha over each character's own colour. */
const RING: Record<Milestone['character'], string> = {
  athlete: 'rgba(14,159,110,0.35)',
  star: 'rgba(232,162,0,0.35)',
  cloud: 'rgba(124,58,237,0.35)',
};

function daysSince(iso: string | null, todayIso: string): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const [ay, am, ad] = iso.split('-').map(Number);
  const [by, bm, bd] = todayIso.split('-').map(Number);
  const a = new Date(ay ?? 1970, (am ?? 1) - 1, ad ?? 1).getTime();
  const b = new Date(by ?? 1970, (bm ?? 1) - 1, bd ?? 1).getTime();
  return Math.round((b - a) / 86_400_000);
}

function CardHead({ icon, title }: { icon: 'trend-wave' | 'pain-point'; title: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: t.tint.cream,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <VelaIcon name={icon} size={16} color={t.brand[600]} strokeWidth={2.1} />
      </View>
      <Body size={13.5} weight="medium" style={{ flex: 1 }}>
        {title}
      </Body>
    </View>
  );
}

/**
 * The programme she is on, week by week from this one on.
 *
 * Past weeks are the grid's business; here the question is what is coming, and for the
 * week under way how it stands. Each week lists its sessions by title, in date order, so
 * "Week 3" is not a number but Gym Day 1, Run&Bun, the pool. A descriptive programme has
 * no calendar to lay out; it is named, with the way to read it.
 */
function ProgrammeCard({
  name,
  durationWeeks,
  startDate,
  descriptive,
  weeks,
  loading,
}: {
  name: string;
  durationWeeks: number;
  startDate: string;
  descriptive: boolean;
  weeks: ProgrammeWeek[];
  loading: boolean;
}) {
  const t = useTheme();
  const current = weeks.find((w) => w.isCurrent);
  const ahead = weeks.filter((w) => !w.isPast);
  const started = new Date(`${startDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

  return (
    <Card style={{ borderRadius: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: t.tint.cream,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CalendarDays size={16} color={t.brand[600]} strokeWidth={2.1} />
        </View>
        <View style={{ flex: 1 }}>
          <Body size={13.5} weight="medium">
            {name}
          </Body>
          <Body size={12} color={t.textSecondary}>
            {durationWeeks} weeks · from {started}
            {current ? ` · week ${current.weekNo} of ${durationWeeks}` : ''}
          </Body>
        </View>
      </View>

      {descriptive ? (
        <Link href="/program" asChild>
          <Tap
            accessibilityRole="button"
            style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Body size={13} weight="medium" color={t.brand[600]}>
              Written out as text — read it through
            </Body>
            <ChevronRight size={14} color={t.brand[600]} strokeWidth={2.4} />
          </Tap>
        </Link>
      ) : loading && weeks.every((w) => w.planned === 0) ? (
        <View style={{ marginTop: 14 }}>
          <ActivityIndicator color={t.brand[600]} />
        </View>
      ) : ahead.length === 0 ? (
        <Body size={13} color={t.textSecondary} style={{ marginTop: 12 }}>
          Every week of this programme is behind you.
        </Body>
      ) : (
        <View style={{ marginTop: 14, gap: 10 }}>
          {ahead.map((w) => (
            <View
              key={w.weekNo}
              style={{
                backgroundColor: w.isCurrent ? t.brand[50] : t.softFill,
                borderRadius: t.radius.md,
                paddingVertical: 11,
                paddingHorizontal: 13,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Body size={13} weight="semibold" style={{ flex: 1 }}>
                  Week {w.weekNo}
                  {w.isCurrent ? ' · this week' : ''}
                </Body>
                <Body size={12} color={t.textSecondary}>
                  {weekRangeLabel(w.from, w.to)}
                </Body>
              </View>
              <Body size={12.5} color={t.textSecondary} style={{ marginTop: 3 }}>
                {w.planned === 0
                  ? 'Nothing on the calendar'
                  : w.isCurrent
                    ? `${w.done} of ${w.planned} done${w.missed ? ` · ${w.missed} missed` : ''}`
                    : `${w.planned} ${w.planned === 1 ? 'session' : 'sessions'}`}
              </Body>
              {w.sessions.length > 0 && (
                <Body size={12.5} style={{ marginTop: 5, lineHeight: 18 }}>
                  {w.sessions.map((s) => s.title).join(' · ')}
                </Body>
              )}
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function Figure({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
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
          color: accent ? t.brand[600] : t.textPrimary,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/** Builds the grid from the sessions actually scheduled over the window. */
function buildHeatmap(sessions: { scheduledDate: string; status: string }[]) {
  const todayIso = today();
  const thisWeekStart = startOfWeek(todayIso);
  const byDate = new Map(sessions.map((s) => [s.scheduledDate, s.status]));

  const weeks: CellState[][] = [];
  const columnStarts: string[] = [];
  let kept = 0;
  let scheduled = 0;

  for (let w = WEEKS_SHOWN - 1; w >= 0; w--) {
    const start = addDays(thisWeekStart, -w * 7);
    columnStarts.push(start);
    const col: CellState[] = [];
    for (let d = 0; d < 7; d++) {
      const iso = addDays(start, d);
      const status = byDate.get(iso);
      if (!status) {
        col.push(iso === todayIso ? 'today' : 'rest');
        continue;
      }
      scheduled++;
      if (status === 'completed') {
        kept++;
        col.push('full');
      } else if (status === 'in_progress') {
        col.push('partial');
      } else if (iso < todayIso) {
        col.push('missed');
      } else {
        col.push(iso === todayIso ? 'today' : 'rest');
      }
    }
    weeks.push(col);
  }

  return { weeks, kept, scheduled, columnStarts };
}

/** A week's completion, for the trend line. */
function weekRatio(col: CellState[]): number {
  const due = col.filter((c) => c === 'full' || c === 'partial' || c === 'missed').length;
  if (!due) return 0;
  const done =
    col.filter((c) => c === 'full').length + col.filter((c) => c === 'partial').length * 0.5;
  return done / due;
}

/**
 * Mean recorded soreness per week, normalised to 0–1 against the 0–10 scale so it shares
 * an axis with adherence. `null` for a week with nothing logged — the caller decides
 * whether there is enough to draw at all.
 */
function weeklySoreness(sessions: { scheduledDate: string; painAfter: number | null }[]) {
  const todayIso = today();
  const thisWeekStart = startOfWeek(todayIso);
  const out: (number | null)[] = [];

  for (let w = WEEKS_SHOWN - 1; w >= 0; w--) {
    const start = addDays(thisWeekStart, -w * 7);
    const end = addDays(start, 6);
    const scores = sessions
      .filter((s) => s.scheduledDate >= start && s.scheduledDate <= end && s.painAfter !== null)
      .map((s) => s.painAfter!);
    out.push(scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length / 10 : null);
  }
  return out;
}
