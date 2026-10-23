import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock } from 'lucide-react-native';
import { activePlan, painLabel, readinessGate } from '@vela/shared';
import {
  Body,
  Button,
  Card,
  Display,
  DosePill,
  PainScale,
  PlanTag,
  Screen,
} from '@/components/kit';
import { Prose } from '@/components/prose';
import { Rise, Tap } from '@/components/motion';
import { CelebrationCard } from '@/components/session-kit';
import {
  ACUTE_OPTIONS,
  ChoiceChips,
  NumberScale,
  PAIN_LOCATIONS,
  READINESS_WORD,
  RPE_WORD,
} from '@/components/scales';
import { useTheme } from '@/theme';
import { useSession } from '@/lib/session';
import { useSessionMeta, useSessionPlan } from '@/lib/data';
import { clock, useSessionLog } from '@/lib/sessionLog';

/**
 * A session: before, during, after.
 *
 * Before, she says how fresh she feels (0–10, the gate), anything acute, the pelvic-floor
 * question when her physio has it on, and her symptom score. During, the movements are a
 * sheet to read — no ticking. After, how hard it was, how much of it she did, and how it
 * feels now. What she says before is written at once, because it decides today and raises
 * any flag for her physio; the report goes when she sends it.
 */
type Phase = 'pre' | 'during' | 'after' | 'held';

const readinessColor = (n: number) => (n <= 2 ? '#C4184A' : n <= 6 ? '#E8A200' : '#0E9F6E');
const rpeColor = (n: number) => (n <= 3 ? '#0E9F6E' : n <= 6 ? '#E8A200' : '#C4184A');

export default function SessionScreen() {
  const t = useTheme();
  const router = useRouter();
  // Presented as a sheet, which never reaches the status bar.
  const insets = useSafeAreaInsets();
  const topPad = Math.min(insets.top, 12);

  const { client } = useSession();
  const { id: sessionId } = useLocalSearchParams<{ id: string }>();
  const plan = useSessionPlan(sessionId ?? null);
  const meta = useSessionMeta(sessionId ?? null);
  const log = useSessionLog(sessionId ?? null);

  const [phase, setPhase] = useState<Phase>('pre');
  const [readiness, setReadiness] = useState<number | null>(null);
  const [acute, setAcute] = useState<string>('none');
  const [pfFlag, setPfFlag] = useState<'no' | 'yes' | null>(null);
  const [painBefore, setPainBefore] = useState<number | null>(0);
  const [painLocation, setPainLocation] = useState<string | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [completion, setCompletion] = useState<'all' | 'some' | 'none' | null>(null);
  const [painAfter, setPainAfter] = useState<number | null>(null);
  const [painAfterLocation, setPainAfterLocation] = useState<string | null>(null);
  const [nudge, setNudge] = useState<string | null>(null);

  const loading = plan.loading || meta.loading || !log.restored;
  const title = meta.data?.title ?? 'Session';
  const dayNotes = meta.data?.dayNotes ?? null;
  const pfGate = client?.pfGate === true;

  // Before she starts, the plan follows what she is tapping; once started, what she sent.
  const said = log.before;
  const active = activePlan(plan.data, {
    readiness: said?.readiness ?? readiness,
    pfFlag: said ? said.pfFlag : pfFlag === 'yes',
    acute: said?.acute ?? null,
    adjustedTo: meta.data?.adjustedTo ?? null,
    adjustedNote: meta.data?.adjustedNote ?? null,
  });

  // Resuming lands where she left off.
  if (phase === 'pre' && log.started) setPhase('during');

  async function start() {
    if (readiness === null) {
      setNudge('Tap how fresh you feel first — it sets today.');
      return;
    }
    if (pfGate && pfFlag === null) {
      setNudge('Answer the pelvic-floor question first.');
      return;
    }
    setNudge(null);
    const isAcute = acute !== 'none';
    await log.begin({
      readiness,
      painBefore,
      painLocation: painBefore && painBefore > 0 ? painLocation : null,
      pfFlag: pfGate ? pfFlag === 'yes' : null,
      acute: isAcute ? acute : null,
      adjustedTo: !isAcute && readinessGate(readiness) === 'reduced' ? 'reduced' : null,
    });
    setPhase(isAcute ? 'held' : 'during');
  }

  function finish(stopped: boolean) {
    if (stopped && completion === null) setCompletion('some');
    if (!stopped && completion === null) setCompletion('all');
    setPhase('after');
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

  const pad = {
    padding: t.space.lg,
    paddingTop: topPad + t.space.lg,
    paddingBottom: t.space.xxl,
    gap: 14,
  };
  const label = (text: string) => (
    <Body size={11} weight="medium" color={t.textSecondary} style={{ letterSpacing: 0.5 }}>
      {text}
    </Body>
  );

  /* ── Held: an acute symptom ─────────────────────────────── */
  if (phase === 'held') {
    return (
      <Screen>
        <ScrollView contentContainerStyle={pad}>
          <Display size={28}>Rest today</Display>
          <Card style={{ borderRadius: 22 }}>
            <Body size={15} style={{ lineHeight: 22 }}>
              Your physio has been told and will be in touch. Nothing to do now but rest.
            </Body>
          </Card>
          <Button label="Done" onPress={() => router.back()} />
        </ScrollView>
      </Screen>
    );
  }

  /* ── Before you start ───────────────────────────────────── */
  if (phase === 'pre') {
    return (
      <Screen>
        <ScrollView contentContainerStyle={pad} showsVerticalScrollIndicator={false}>
          {label('BEFORE YOU START')}
          <Display size={28}>{title}</Display>

          {dayNotes && (
            <Card style={{ borderRadius: 22 }}>
              {label('WHAT TO DO')}
              <View style={{ marginTop: 10 }}>
                <Prose body={dayNotes} />
              </View>
            </Card>
          )}

          <Rise>
            <Card style={{ borderRadius: 22 }}>
              {label('HOW FRESH DO YOU FEEL RIGHT NOW?')}
              <View style={{ marginTop: 12 }}>
                <NumberScale
                  value={readiness}
                  onChange={setReadiness}
                  low="Empty"
                  high="Fresh"
                  word={READINESS_WORD}
                  color={readinessColor}
                  label="Readiness"
                />
              </View>
              {readiness !== null && acute === 'none' && (
                <View style={{ marginTop: 14, gap: 4 }}>
                  <PlanTag label={active.tag} tone={active.tone} />
                  <Body size={13} color={t.textSecondary} style={{ lineHeight: 19 }}>
                    {active.note}
                  </Body>
                </View>
              )}
            </Card>
          </Rise>

          <Rise delay={40}>
            <Card style={{ borderRadius: 22 }}>
              {label('ANY OF THESE TODAY?')}
              <View style={{ marginTop: 12 }}>
                <ChoiceChips
                  options={[...ACUTE_OPTIONS]}
                  value={acute}
                  onChange={setAcute}
                  tone={acute === 'none' ? undefined : t.status.critical}
                />
              </View>
            </Card>
          </Rise>

          {pfGate && (
            <Rise delay={60}>
              <Card style={{ borderRadius: 22 }}>
                {label('PELVIC FLOOR')}
                <Body size={14} style={{ marginTop: 8, lineHeight: 20 }}>
                  Any heaviness, dragging or leaking today?
                </Body>
                <View style={{ marginTop: 12 }}>
                  <ChoiceChips
                    options={[
                      { value: 'no', label: 'No' },
                      { value: 'yes', label: 'Yes' },
                    ]}
                    value={pfFlag}
                    onChange={setPfFlag}
                  />
                </View>
              </Card>
            </Rise>
          )}

          <Rise delay={80}>
            <Card style={{ borderRadius: 22 }}>
              {label('SYMPTOM BEFORE TRAINING')}
              <View style={{ marginTop: 12 }}>
                <PainScale value={painBefore} onChange={setPainBefore} />
              </View>
              {painBefore !== null && painBefore > 0 && (
                <View style={{ marginTop: 12 }}>
                  <Body size={12.5} color={t.textSecondary} style={{ marginBottom: 8 }}>
                    Where?
                  </Body>
                  <ChoiceChips
                    options={[...PAIN_LOCATIONS]}
                    value={painLocation}
                    onChange={setPainLocation}
                  />
                </View>
              )}
            </Card>
          </Rise>

          {nudge && (
            <Body size={13} color={t.status.warning} style={{ textAlign: 'center' }}>
              {nudge}
            </Body>
          )}
          <Button
            label={acute !== 'none' ? 'Tell my physio' : 'Start'}
            onPress={() => void start()}
          />
          <Button label="Not now" variant="secondary" onPress={() => router.back()} />
        </ScrollView>
      </Screen>
    );
  }

  /* ── During: a sheet to read ────────────────────────────── */
  if (phase === 'during') {
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
              {active.tag}
            </Body>
          </View>
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

        <ScrollView
          contentContainerStyle={{ padding: t.space.lg, paddingBottom: 80, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {(dayNotes || active.items.length === 0) && (
            <Card style={{ borderRadius: 22 }}>
              {label('WHAT TO DO')}
              <View style={{ marginTop: 10 }}>
                {dayNotes ? <Prose body={dayNotes} /> : null}
                {active.items.length === 0 && (
                  <Body
                    size={14}
                    color={t.textSecondary}
                    style={{ marginTop: dayNotes ? 8 : 0, lineHeight: 20 }}
                  >
                    {active.note}
                  </Body>
                )}
              </View>
            </Card>
          )}

          {active.items.map((item, idx) => (
            <Rise key={item.itemId} delay={idx * 40}>
              <Card style={{ borderRadius: 22, paddingVertical: 18 }}>
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
                      fontSize: 17,
                      letterSpacing: -0.4,
                      color: t.textPrimary,
                      flex: 1,
                    }}
                  >
                    {item.exerciseName}
                  </Text>
                  <DosePill>
                    {item.sets} × {item.reps}
                    {!active.dropLoad && item.targetLoadKg ? ` · ${item.targetLoadKg} kg` : ''}
                  </DosePill>
                </View>
                {item.cues[0] ? (
                  <Body
                    size={12.5}
                    color={t.textSecondary}
                    style={{ marginTop: 5, fontStyle: 'italic' }}
                  >
                    {item.cues[0]}
                  </Body>
                ) : null}
                {item.notes ? (
                  <Body size={13} style={{ marginTop: 6, lineHeight: 19 }}>
                    {item.notes}
                  </Body>
                ) : null}
                <Body size={12} color={t.textMuted} style={{ marginTop: 6 }}>
                  Rest {item.restSec}s between sets
                </Body>
              </Card>
            </Rise>
          ))}

          <Button label="Done — tell my physio how it went" onPress={() => finish(false)} />
          <Tap
            onPress={() => finish(true)}
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
      </Screen>
    );
  }

  /* ── After: the report ──────────────────────────────────── */
  const sent = log.sendState === 'sent';
  return (
    <Screen>
      <ScrollView contentContainerStyle={pad} showsVerticalScrollIndicator={false}>
        {sent ? (
          <CelebrationCard
            title={completion === 'none' ? 'Sent' : 'Done'}
            message={`${clock(log.elapsed)} on the clock. Your physio sees this now.`}
          />
        ) : (
          <Display size={26}>How did it go?</Display>
        )}

        {!sent && (
          <>
            <Rise>
              <Card style={{ borderRadius: 22 }}>
                {label('HOW HARD WAS THAT, OVERALL?')}
                <View style={{ marginTop: 12 }}>
                  <NumberScale
                    value={rpe}
                    onChange={setRpe}
                    low="Rest"
                    high="Maximal"
                    word={RPE_WORD}
                    color={rpeColor}
                    label="Effort"
                  />
                </View>
              </Card>
            </Rise>

            <Rise delay={40}>
              <Card style={{ borderRadius: 22 }}>
                {label('HOW MUCH OF IT DID YOU DO?')}
                <View style={{ marginTop: 12 }}>
                  <ChoiceChips
                    options={[
                      { value: 'all', label: 'All of it' },
                      { value: 'some', label: 'Some of it' },
                      { value: 'none', label: 'None today' },
                    ]}
                    value={completion}
                    onChange={setCompletion}
                  />
                </View>
              </Card>
            </Rise>

            <Rise delay={80}>
              <Card style={{ borderRadius: 22 }}>
                {label('HOW DOES IT FEEL NOW?')}
                <Body size={12.5} color={t.textMuted} style={{ marginTop: 4 }}>
                  Before you started:{' '}
                  {said?.painBefore == null ? 'not recorded' : painLabel(said.painBefore)}
                </Body>
                <View style={{ marginTop: 12 }}>
                  <PainScale value={painAfter} onChange={setPainAfter} />
                </View>
                {painAfter !== null && painAfter > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Body size={12.5} color={t.textSecondary} style={{ marginBottom: 8 }}>
                      Where?
                    </Body>
                    <ChoiceChips
                      options={[...PAIN_LOCATIONS]}
                      value={painAfterLocation ?? said?.painLocation ?? null}
                      onChange={setPainAfterLocation}
                    />
                  </View>
                )}
              </Card>
            </Rise>
          </>
        )}

        {sent ? (
          <Button label="Done" onPress={() => router.back()} />
        ) : (
          <>
            {log.sendState === 'failed' && (
              <Card fill={t.dark ? 'rgba(196,24,74,0.12)' : '#FDEBF4'} style={{ borderRadius: 22 }}>
                <Body size={13.5} weight="semibold" color={t.status.critical}>
                  Couldn&apos;t reach Vela
                </Body>
                <Body size={12.5} color={t.textSecondary} style={{ marginTop: 4, lineHeight: 18 }}>
                  Your answers are saved on this phone — nothing is lost. Try again when you have
                  signal.
                </Body>
              </Card>
            )}
            {nudge && (
              <Body size={13} color={t.status.warning} style={{ textAlign: 'center' }}>
                {nudge}
              </Body>
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
              onPress={() => {
                if (rpe === null || completion === null) {
                  setNudge('Tap how hard it was and how much you did.');
                  return;
                }
                setNudge(null);
                void log.send({
                  rpe,
                  completion,
                  painAfter,
                  painLocation:
                    painAfter && painAfter > 0
                      ? (painAfterLocation ?? said?.painLocation ?? null)
                      : null,
                });
              }}
            />
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
