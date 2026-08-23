import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock } from 'lucide-react-native';
import { SYMPTOMS, activePlan, isBlocking, painLabel, planMinutes } from '@vela/shared';
import {
  Body,
  Button,
  Card,
  Display,
  DosePill,
  PainScale,
  PlanTag,
  Screen,
  StatTile,
} from '@/components/kit';
import { Rise, Tap } from '@/components/motion';
import { CelebrationCard, ProgressRing, RestBar, SetTickRow } from '@/components/session-kit';
import { useTheme } from '@/theme';
import { useSessionMeta, useSessionPlan } from '@/lib/data';
import { useDailyRead } from '@/lib/daily';
import { clock, setKey, useSessionLog } from '@/lib/sessionLog';

/**
 * Logging a session: three phases of one screen.
 *
 * The prototype models these as separate screens driven by a single `screen` value, and
 * they stay one route here for the same reason — pre-session, the checklist and the summary
 * are one continuous piece of state, and splitting them across routes would mean threading
 * a half-finished session through navigation or hoisting it into a store that nothing else
 * reads.
 */
type Phase = 'pre' | 'log' | 'summary';

export default function SessionScreen() {
  const t = useTheme();
  const router = useRouter();
  // Presented as a sheet, which never reaches the status bar — adding the device's
  // top inset here just opens a dead gap under the grabber.
  const insets = useSafeAreaInsets();
  const topPad = Math.min(insets.top, 12);

  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const plan = useSessionPlan(sessionId ?? null);
  const meta = useSessionMeta(sessionId ?? null);
  const daily = useDailyRead();

  // The same trim Today applied. Reading it from one function is what stops the session
  // asking for five exercises when Today promised three.
  const active = activePlan(plan.data, daily.current, daily.read.symptom);
  const log = useSessionLog(sessionId ?? null, active.items);

  const [phase, setPhase] = useState<Phase>('pre');
  const [symptom, setSymptom] = useState(daily.read.symptom);
  const [painBefore, setPainBefore] = useState<number | null>(2);
  const [painAfter, setPainAfter] = useState<number | null>(null);
  const [stopped, setStopped] = useState(false);
  const [nudge, setNudge] = useState<string | null>(null);

  const loading = plan.loading || meta.loading || !log.restored;
  const title = meta.data?.title ?? 'Session';
  const mins = planMinutes(active.items.map((i) => ({ sets: i.sets, restSec: i.restSec })));

  // Resuming lands straight in the checklist — asking for a symptom score a second time
  // would overwrite the one the session was actually built from.
  if (phase === 'pre' && log.started) setPhase('log');

  function begin() {
    log.begin(painBefore, symptom);
    // The symptom only. `painBefore` is a 0-10 symptom score and readiness is a 0-4 step —
    // passing one as the other would have written nonsense into the read. The before-score
    // is carried by the session itself, which is where the coach reads it from.
    void daily.setSymptom(symptom);
    setPhase('log');
  }

  function finish() {
    if (log.completed === 0) {
      setNudge('Log at least one set first.');
      return;
    }
    setNudge(null);
    setPhase('summary');
  }

  function stopEarly() {
    setStopped(true);
    setPhase('summary');
  }

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.brand[600]} />
        </View>
      </Screen>
    );
  }

  /* ── Before you start ─────────────────────────────────────── */
  if (phase === 'pre') {
    const blocked = isBlocking(symptom);

    return (
      <Screen>
        <ScrollView
          contentContainerStyle={{
            padding: t.space.lg,
            paddingTop: topPad + t.space.lg,
            paddingBottom: t.space.xxl,
            gap: 14,
          }}
          showsVerticalScrollIndicator={false}
        >
          <Body size={11} weight="medium" color={t.textMuted} style={{ letterSpacing: 0.5 }}>
            BEFORE YOU START
          </Body>
          <Display size={28}>{title}</Display>

          <Rise>
            <Card style={{ borderRadius: 22 }}>
              <Body size={11} weight="medium" color={t.textSecondary} style={{ letterSpacing: 0.5 }}>
                ANYTHING GOING ON?
              </Body>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
                {SYMPTOMS.map((s) => {
                  const on = symptom === s;
                  return (
                    <Tap
                      key={s}
                      onPress={() => setSymptom(s)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        borderRadius: t.radius.pill,
                        borderWidth: 1.5,
                        borderColor: on ? t.brand[600] : t.border,
                        backgroundColor: on ? t.brand[50] : t.surface,
                      }}
                    >
                      <Body size={13.5} weight="medium" color={on ? t.brand[700] : t.textSecondary}>
                        {s}
                      </Body>
                    </Tap>
                  );
                })}
              </View>

              {blocked && (
                <View
                  style={{
                    marginTop: 14,
                    padding: 14,
                    borderRadius: t.radius.md,
                    backgroundColor: t.dark ? 'rgba(224,72,155,0.12)' : '#FDEBF4',
                  }}
                >
                  <Body size={13} color={t.textSecondary} style={{ lineHeight: 19 }}>
                    Today drops to breath and connection work. That is the session — not a
                    lesser version of one — and your physio will see why.
                  </Body>
                </View>
              )}
            </Card>
          </Rise>

          <Rise delay={60}>
            <Card style={{ borderRadius: 22 }}>
              <Body size={11} weight="medium" color={t.textSecondary} style={{ letterSpacing: 0.5 }}>
                SYMPTOM BEFORE TRAINING
              </Body>
              <View style={{ marginTop: 12 }}>
                <PainScale value={painBefore} onChange={setPainBefore} />
              </View>
            </Card>
          </Rise>

          <Button label="Start" onPress={begin} />
          <Button label="Not now" variant="secondary" onPress={() => router.back()} />
        </ScrollView>
      </Screen>
    );
  }

  /* ── The checklist ────────────────────────────────────────── */
  if (phase === 'log') {
    return (
      <Screen>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingHorizontal: t.space.lg,
            paddingTop: topPad + t.space.md,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: t.border,
            backgroundColor: t.page,
          }}
        >
          <ProgressRing value={log.ratio} />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: t.font.displaySemi,
                fontSize: 18,
                letterSpacing: -0.5,
                color: t.textPrimary,
              }}
            >
              {title}
            </Text>
            <Body size={12.5} color={t.textSecondary}>
              {log.completed} of {log.total} sets
            </Body>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 3 }}>
            <Text
              style={{
                fontFamily: t.font.displaySemi,
                fontSize: 18,
                letterSpacing: -0.5,
                color: t.brand[600],
              }}
            >
              {Math.round(log.ratio * 100)}%
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingVertical: 4,
                paddingHorizontal: 9,
                borderRadius: t.radius.pill,
                backgroundColor: t.dark ? t.brand[900] : '#12172B',
              }}
            >
              <Clock size={11} color={t.brand[300]} strokeWidth={2.8} />
              <Text
                style={{
                  fontFamily: t.font.displaySemi,
                  fontSize: 12.5,
                  color: '#FFFFFF',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {clock(log.elapsed)}
              </Text>
            </View>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{
            padding: t.space.lg,
            paddingBottom: 160,
            gap: 12,
          }}
          showsVerticalScrollIndicator={false}
        >
          {active.items.map((item, idx) => (
            <Rise key={item.itemId} delay={idx * 40}>
              <Card style={{ borderRadius: 22, paddingVertical: 22 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: t.font.displaySemi,
                      fontSize: 18,
                      letterSpacing: -0.5,
                      color: t.textPrimary,
                      flex: 1,
                    }}
                  >
                    {item.exerciseName}
                  </Text>
                  <DosePill>
                    {item.sets} × {item.reps}
                  </DosePill>
                </View>

                {item.cues.length > 0 && (
                  <Body
                    size={12.5}
                    color={t.textSecondary}
                    style={{ marginTop: 5, fontStyle: 'italic' }}
                  >
                    {item.cues[0]}
                  </Body>
                )}

                <View style={{ gap: 8, marginTop: 14 }}>
                  {Array.from({ length: item.sets }, (_, i) => (
                    <SetTickRow
                      key={i}
                      n={i + 1}
                      load={
                        !active.dropLoad && item.targetLoadKg
                          ? `${item.targetLoadKg} kg`
                          : item.reps
                      }
                      done={Boolean(log.done[setKey(item.itemId, i)])}
                      onToggle={() =>
                        log.toggle(
                          item.itemId,
                          i,
                          item.restSec,
                          i + 1 < item.sets
                            ? `Next: set ${i + 2} of ${item.exerciseName}`
                            : (active.items[idx + 1]?.exerciseName ?? 'Last one — then finish'),
                        )
                      }
                    />
                  ))}
                </View>
              </Card>
            </Rise>
          ))}

          {nudge && (
            <Body size={13} color={t.status.warning} style={{ textAlign: 'center' }}>
              {nudge}
            </Body>
          )}

          <Button label="Finish and review" onPress={finish} />

          <Tap
            onPress={stopEarly}
            style={{
              borderWidth: 1.5,
              borderColor: t.dark ? 'rgba(196,24,74,0.5)' : 'rgba(196,24,74,0.35)',
              borderRadius: t.radius.tile,
              paddingVertical: 16,
              alignItems: 'center',
            }}
          >
            <Body size={15} weight="medium" color={t.status.critical}>
              Something&apos;s not right — stop here
            </Body>
          </Tap>
        </ScrollView>

        {log.rest && (
          <RestBar
            runId={log.rest.runId}
            remaining={log.rest.remaining}
            total={log.rest.total}
            nextLabel={log.rest.next}
            onSkip={log.skipRest}
          />
        )}
      </Screen>
    );
  }

  /* ── Summary and send ─────────────────────────────────────── */
  const sent = log.sendState === 'sent';

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: topPad + t.space.lg,
          paddingBottom: t.space.xxl,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        {log.allDone && !stopped ? (
          <CelebrationCard
            message={`${log.total} sets, ${clock(log.elapsed)} on the clock. Your physio sees this as soon as you send it.`}
          />
        ) : (
          <Rise>
            <Card style={{ borderRadius: 22 }}>
              <PlanTag
                label={stopped ? 'Stopped early' : 'Partly done'}
                tone={stopped ? t.status.critical : t.status.warning}
              />
              <Display size={24} style={{ marginTop: 12 }}>
                {log.completed} of {log.total} sets
              </Display>
              <Body size={13.5} color={t.textSecondary} style={{ marginTop: 4, lineHeight: 19 }}>
                {stopped
                  ? 'Stopping when something feels wrong is the right call. Your physio will see what you managed and why.'
                  : 'What you did counts. Send it and your physio can adjust from there.'}
              </Body>
            </Card>
          </Rise>
        )}

        <Rise delay={60}>
          <Card style={{ borderRadius: 22 }}>
            <Body size={11} weight="medium" color={t.textSecondary} style={{ letterSpacing: 0.5 }}>
              WHAT YOU DID
            </Body>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <StatTile label="TIME" value={clock(log.elapsed)} dark flex={1.3} />
              <StatTile label="SETS" value={`${log.completed}`} />
              <StatTile label="OF" value={`${log.total}`} />
            </View>
            <Body size={12.5} color={t.textSecondary} style={{ marginTop: 12 }}>
              Planned {mins} min · {active.tag.toLowerCase()}
            </Body>
          </Card>
        </Rise>

        <Rise delay={120}>
          <Card style={{ borderRadius: 22 }}>
            <Body size={11} weight="medium" color={t.textSecondary} style={{ letterSpacing: 0.5 }}>
              HOW DOES IT FEEL NOW?
            </Body>
            <Body size={12.5} color={t.textMuted} style={{ marginTop: 4 }}>
              Before you started: {painBefore === null ? 'not recorded' : painLabel(painBefore)}
            </Body>
            <View style={{ marginTop: 12 }}>
              <PainScale value={painAfter} onChange={setPainAfter} />
            </View>
          </Card>
        </Rise>

        {sent ? (
          <Rise>
            <Card fill={t.dark ? 'rgba(14,159,110,0.14)' : t.tint.mint} style={{ borderRadius: 22 }}>
              <Body size={15} weight="semibold">
                Sent to your physio
              </Body>
              <Body size={13} color={t.textSecondary} style={{ marginTop: 4, lineHeight: 19 }}>
                Nothing else needed today.
              </Body>
            </Card>
            <View style={{ marginTop: 14 }}>
              <Button label="Done" onPress={() => router.back()} />
            </View>
          </Rise>
        ) : (
          <>
            {log.sendState === 'failed' && (
              <Card
                fill={t.dark ? 'rgba(196,24,74,0.12)' : '#FDEBF4'}
                style={{ borderRadius: 22 }}
              >
                <Body size={13.5} weight="semibold" color={t.status.critical}>
                  Couldn&apos;t reach Vela
                </Body>
                <Body size={12.5} color={t.textSecondary} style={{ marginTop: 4, lineHeight: 18 }}>
                  Your session is saved on this phone — nothing is lost. Try again when you
                  have signal.
                </Body>
                {log.sendError && (
                  <Body size={11} color={t.textMuted} style={{ marginTop: 6 }}>
                    {log.sendError}
                  </Body>
                )}
              </Card>
            )}

            <Button
              label={
                log.sendState === 'sending'
                  ? 'Sending…'
                  : log.sendState === 'failed'
                    ? 'Try again'
                    : 'Send to your physio'
              }
              disabled={log.sendState === 'sending'}
              onPress={() => void log.send(painAfter, stopped)}
            />
            {/*
              A way to say something the scores cannot. The session travels with the message,
              so "this one hurt more than usual" arrives attached to the day it is about and
              the coach does not have to ask which.
            */}
            <Button
              label="Say something about it"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: '/messages',
                  params: { session: sessionId ?? '', about: title },
                })
              }
            />
            <Button label="Keep for later" variant="secondary" onPress={() => router.back()} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
