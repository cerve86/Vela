import { useCallback, useState } from 'react';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Utensils } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activePlan, planMinutes, type RecoveryBand } from '@vela/shared';
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
import { DialStat, DualDial, HeroBand, HeroChip, SlotStrip, Tile, TideBars } from '@/components/hero';
import { Illustration } from '@/components/Illustration';
import { useTheme } from '@/theme';
import { useSession } from '@/lib/session';
import { addDays, today, useNutrition, useSessionPlan, useUpcoming, useWeek } from '@/lib/data';
import { useDailyRead } from '@/lib/daily';
import { useVitality } from '@/lib/vitality';

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
  const upcoming = useUpcoming(3);
  const plan = useSessionPlan(week.todaySession?.id ?? null);
  const nutrition = useNutrition(1);
  const daily = useDailyRead();
  const vitality = useVitality(daily.current);

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
        vitality.reload(),
      ]);
    } finally {
      setRefreshing(false);
    }
    // Depends on the reloaders rather than on nothing. With an empty list this captured the
    // closures as they were at mount — and at mount `client` is still null, so every one of
    // them was a no-op that returned immediately and refreshed precisely nothing.
  }, [week.reload, nutrition.reload, daily.reload, plan.reload, vitality.reload]);

  const firstName = client?.email.split('@')[0]?.split('.')[0] || 'there';
  const name = firstName.charAt(0).toUpperCase() + firstName.slice(1);
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

  /**
   * The chip under the dial: the read she just gave, named and attributed.
   *
   * It used to repeat `active.tag · mins`, both of which the plan card below already states —
   * as a tag and as the TIME tile — and neither of which means anything on a rest day. The
   * read had no plain-language home on this screen at all: it was a word inside the ring at
   * 15px and a bare number on the tile. So the chip carries the read instead, with the
   * window it came from, and the symptom when there is one, since a symptom is the part that
   * changes what she should do today.
   */
  const readChip =
    daily.current === null
      ? 'No read yet — tap to add one'
      : [
          capitalise(daily.currentWindow ?? daily.openWindow),
          t.tide[daily.current]!.label,
          daily.read.symptom === 'Nothing' ? null : daily.read.symptom,
        ]
          .filter(Boolean)
          .join(' · ');

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
          <View style={{ paddingTop: insets.top + 22 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 6,
              }}
            >
              <DialStat
                value={vitality.recovery.score === null ? '—' : `${vitality.recovery.score}%`}
                label="RECOVERY"
                sub={vitality.recovery.score === null ? 'not yet' : BAND_WORD[vitality.recovery.band]}
                align="right"
                tone={vitality.recovery.score === null ? t.textMuted : undefined}
              />
              <DualDial
                recovery={vitality.recovery.score}
                strain={vitality.strain.score}
                strainTarget={vitality.strain.target}
                tone={recoveryTone}
              />
              <DialStat
                value={`${vitality.strain.score}%`}
                label="STRAIN"
                sub={
                  vitality.strain.target === null
                    ? 'rest day'
                    : `target ${vitality.strain.target}%`
                }
                align="left"
              />
            </View>

            <Text
              style={{
                fontFamily: t.font.regular,
                fontSize: 15,
                lineHeight: 21,
                color: t.textPrimary,
                textAlign: 'center',
                marginTop: 18,
              }}
            >
              {vitality.recovery.score === null
                ? greeting(name, daily.current, done, Boolean(week.todaySession))
                : vitality.recovery.note}
            </Text>

            {vitality.recovery.score !== null && vitality.recovery.estimated && (
              <Body
                size={11}
                color={t.textSecondary}
                style={{ textAlign: 'center', marginTop: 8 }}
              >
                Estimated · no sleep recorded last night
              </Body>
            )}

            <HeroChip
              label={readChip}
              dot={daily.current === null ? t.textMuted : t.tide[daily.current]!.tone}
              onPress={() => router.push('/mood')}
            />
          </View>
        </HeroBand>

        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Tile
            icon={<VelaIcon name="readiness" size={14} color={t.brand[600]} strokeWidth={2.2} />}
            title={`${capitalise(daily.openWindow)} read`}
            value={daily.current === null ? '—' : String(daily.current + 1)}
            unit={daily.current === null ? undefined : 'of 5'}
            pill={daily.allLogged ? 'All three in' : daily.current === null ? 'Not logged' : 'Logged'}
            pillBg={daily.current === null ? t.softFill : t.tint.mint}
            pillFg={daily.current === null ? t.textSecondary : t.status.good}
            meta={daily.read.symptom === 'Nothing' ? 'No symptoms' : daily.read.symptom}
            strip={<TideBars values={daily.strip} />}
            onPress={() => router.push('/mood')}
          />

          <Tile
            icon={<Utensils size={14} color={t.status.warning} strokeWidth={2.2} />}
            title="Fuel"
            value={kcal ? kcal.toLocaleString('en-GB') : '0'}
            unit="kcal"
            pill={`${slotCount} of 4`}
            pillBg={slotCount === 0 ? t.softFill : t.tint.cream}
            pillFg={slotCount === 0 ? t.textSecondary : t.brand[700]}
            meta={target ? `of ${target.toLocaleString('en-GB')}` : 'No target set'}
            strip={<SlotStrip logged={loggedSlots} />}
            onPress={() => router.push('/(tabs)/nutrition')}
          />
        </View>

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
          <Card title="Rest day" style={{ borderRadius: 22 }}>
            <View style={{ alignItems: 'center', marginBottom: t.space.md }}>
              <Illustration name="rest" width={168} />
            </View>
            <Body size={14} color={t.textSecondary}>
              Nothing scheduled today. Rest is part of the programme, not a gap in it.
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

        {client?.weeksPostpartum != null && (
          <Link href="/readiness" asChild>
            <Pressable>
              <Card fill={t.dark ? 'rgba(92,135,247,0.12)' : t.tint.peach} style={{ borderRadius: 22 }}>
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
 * Band → the dial's colour.
 *
 * Green at the top and amber in the middle, and deliberately not red at the bottom: a
 * postpartum client opening this app to a red ring has been told she is broken by an
 * average of three numbers. Violet is the palette's recovery colour and says "hold" without
 * saying "alarm".
 */
const BAND_TONE = (t: ReturnType<typeof useTheme>): Record<RecoveryBand, string> => ({
  low: t.vitals.hrv,
  moderate: t.status.warningFill,
  good: t.status.good,
  strong: t.status.good,
});

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
): string {
  if (done) return `That's it logged, ${name}. Nothing else needed today.`;
  if (!hasSession) return `No session today, ${name}. Rest counts as programme.`;
  if (readiness === null) return `Morning, ${name}. Tell me how today feels and I'll set the session.`;
  if (readiness <= 1) return `Gently today, ${name}. Something is better than the full thing.`;
  if (readiness >= 4) return `You're in good shape today, ${name}. There's room if you want it.`;
  return `Good to see you, ${name}. Today is ready when you are.`;
}

function friendlyDate(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'Today';
  if (iso === addDays(todayIso, 1)) return 'Tomorrow';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
