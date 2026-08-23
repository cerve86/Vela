import { useCallback, useMemo, useState } from 'react';
import { Link, useFocusEffect } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight } from 'lucide-react-native';
import { METRIC_META, type MetricType } from '@vela/api';
import { Body, Card, Display, Screen } from '@/components/kit';
import { Rise, Tap } from '@/components/motion';
import { Heatmap, MonoChart, MonoHeader, TrendChart, type CellState } from '@/components/charts';
import { VelaIcon } from '@/components/brand';
import { Illustration } from '@/components/Illustration';
import { useTheme } from '@/theme';
import { useSession } from '@/lib/session';
import { addDays, startOfWeek, today, useHistory, useMetrics } from '@/lib/data';

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

  const [metric, setMetric] = useState<MetricType>('resting_hr');

  useFocusEffect(
    useCallback(() => {
      history.reload();
      metrics.reload();
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
  const series = useMemo(
    () => weeklyMeans(metrics.data.filter((m) => m.type === metric)),
    [metrics.data, metric],
  );

  const { weeks, kept, scheduled } = useMemo(() => buildHeatmap(history.data), [history.data]);

  /** Soreness per week, from the scores actually recorded. No reading, no point. */
  const soreness = useMemo(() => weeklySoreness(history.data), [history.data]);
  const adherence = useMemo(() => weeks.map(weekRatio), [weeks]);
  const trendReady = soreness.filter((v) => v !== null).length >= 2;

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
                  <Heatmap weeks={weeks} />
                </View>
              </Card>
            </Rise>

            <Rise delay={60}>
              <Card style={{ borderRadius: 22 }}>
                <CardHead icon="trend-wave" title="Sessions against soreness" />
                {trendReady ? (
                  <>
                    <Body size={12.5} color={t.textSecondary} style={{ marginTop: 4, lineHeight: 18 }}>
                      Both on one scale, so the shapes can be compared rather than the numbers.
                    </Body>
                    <View style={{ marginTop: 16 }}>
                      <TrendChart adherence={adherence} soreness={soreness.map((v) => v ?? 0)} />
                    </View>
                  </>
                ) : (
                  <Body size={13} color={t.textSecondary} style={{ marginTop: 8, lineHeight: 19 }}>
                    This needs symptom scores from at least two weeks of sessions. It draws
                    itself once you have logged a few.
                  </Body>
                )}
              </Card>
            </Rise>

            <Rise delay={120}>
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
                        <Body
                          size={11}
                          weight="medium"
                          color={on ? '#FFFFFF' : t.textSecondary}
                        >
                          {METRIC_META[m].label}
                        </Body>
                      </Tap>
                    );
                  })}
                </View>

                {series.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 22, gap: 10 }}>
                    <Illustration name="trend" width={150} />
                    <Body size={13} color={t.textSecondary} style={{ textAlign: 'center' }}>
                      Nothing recorded for {meta.label.toLowerCase()} yet. Connect Apple Health
                      from Today and this fills itself in.
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
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        marginTop: 2,
                      }}
                    >
                      <Body size={11} color={t.textSecondary}>
                        oldest · {fmt(series[0]!)}
                      </Body>
                      <Body size={11} color={t.textSecondary}>
                        mean {fmt(series.reduce((a, b) => a + b, 0) / series.length)}
                      </Body>
                      <Body size={11} color={t.textSecondary}>
                        now · {fmt(series[series.length - 1]!)}
                      </Body>
                    </View>
                  </>
                )}
              </Card>
            </Rise>

            {client?.weeksPostpartum != null && (
              <Rise delay={180}>
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

function Figure({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
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
  let kept = 0;
  let scheduled = 0;

  for (let w = WEEKS_SHOWN - 1; w >= 0; w--) {
    const start = addDays(thisWeekStart, -w * 7);
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

  return { weeks, kept, scheduled };
}

/** A week's completion, for the trend line. */
function weekRatio(col: CellState[]): number {
  const due = col.filter((c) => c === 'full' || c === 'partial' || c === 'missed').length;
  if (!due) return 0;
  const done = col.filter((c) => c === 'full').length + col.filter((c) => c === 'partial').length * 0.5;
  return done / due;
}

/**
 * Collapses readings into one point per ISO week, in order.
 *
 * Weeks with no reading are dropped rather than interpolated. A straight segment across a
 * gap is a claim that nothing happened in between, and it is indistinguishable from a
 * week that genuinely held steady.
 */
function weeklyMeans(readings: { recordedAt: string; value: number }[]): number[] {
  const buckets = new Map<string, { sum: number; n: number }>();
  for (const r of readings) {
    const w = startOfWeek(r.recordedAt.slice(0, 10));
    const b = buckets.get(w);
    if (b) {
      b.sum += r.value;
      b.n++;
    } else {
      buckets.set(w, { sum: r.value, n: 1 });
    }
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, b]) => Math.round((b.sum / b.n) * 10) / 10);
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

function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
