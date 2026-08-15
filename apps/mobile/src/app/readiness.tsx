import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LOAD_TESTS,
  STRENGTH_TESTS,
  SYMPTOM_LABEL,
  evaluateReadiness,
  type LoadTestResult,
  type StrengthTestResult,
  type SymptomFlag,
} from '@vela/shared';
import { Body, Button, Card, Display, Pill, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { useSession } from '@/lib/session';

const SYMPTOMS: SymptomFlag[] = ['none', 'pain', 'heaviness', 'dragging', 'leaking'];

/**
 * Return-to-running readiness screen.
 *
 * Follows the Goom / Donnelly / Brockwell (2019) postnatal guidelines. The key design
 * decision: each test asks "did anything happen?" *before* it asks "did you finish?".
 * Completing ten hops while leaking is a fail in the guideline, and an interface that
 * leads with a tick box quietly encourages people to tick it.
 */
export default function ReadinessScreen() {
  const t = useTheme();
  const { client } = useSession();
  const weeksPostpartum = client?.weeksPostpartum ?? 0;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [load, setLoad] = useState<Record<string, LoadTestResult>>(() =>
    Object.fromEntries(
      LOAD_TESTS.map((x) => [x.id, { testId: x.id, completed: false, symptom: 'none' as SymptomFlag }]),
    ),
  );
  const [strength, setStrength] = useState<Record<string, StrengthTestResult>>(() =>
    Object.fromEntries(
      STRENGTH_TESTS.map((x) => [x.id, { testId: x.id, reps: 0, symptom: 'none' as SymptomFlag }]),
    ),
  );
  const [submitted, setSubmitted] = useState(false);

  const outcome = useMemo(
    () =>
      evaluateReadiness({
        id: 'screen_draft',
        clientId: client?.id ?? '',
        performedOn: '2026-08-11',
        weeksPostpartum,
        loadResults: Object.values(load),
        strengthResults: Object.values(strength),
        coachNotes: null,
      }),
    [load, strength, client?.id, weeksPostpartum],
  );

  const tone =
    outcome.verdict === 'ready_to_progress'
      ? 'good'
      : outcome.verdict === 'address_first'
        ? 'critical'
        : 'warning';

  const verdictColor =
    outcome.verdict === 'ready_to_progress'
      ? t.status.good
      : outcome.verdict === 'address_first'
        ? t.status.critical
        : t.status.warning;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: insets.top + t.space.lg,
          paddingBottom: t.space.xxl * 2,
          gap: t.space.md,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Display size={30}>Return-to-running check</Display>
          <Body size={14} color={t.textSecondary} style={{ marginTop: 4, lineHeight: 20 }}>
            Work through each test with your physio. Stop at the first sign of pain,
            heaviness, dragging or leaking — that is the result, not a failure.
          </Body>
          <View style={{ marginTop: t.space.md }}>
            <Pill tone="brand">
              {weeksPostpartum} weeks postpartum
            </Pill>
          </View>
        </View>

        <Card title="Load and impact">
          <Body size={12} color={t.textMuted} style={{ marginBottom: t.space.md }}>
            Each must be completed without symptoms.
          </Body>
          <View style={{ gap: t.space.lg }}>
            {LOAD_TESTS.map((test) => {
              const r = load[test.id]!;
              return (
                <View key={test.id} style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Body size={15} weight="semibold" style={{ flex: 1 }}>
                      {test.name}
                    </Body>
                    <Body size={13} color={t.textSecondary}>
                      {test.dose}
                    </Body>
                  </View>
                  <Body size={12} color={t.textMuted}>
                    {test.cue}
                  </Body>

                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {SYMPTOMS.map((sym) => {
                      const on = r.symptom === sym;
                      const good = sym === 'none';
                      return (
                        <Pressable
                          key={sym}
                          onPress={() =>
                            setLoad((p) => ({ ...p, [test.id]: { ...r, symptom: sym } }))
                          }
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 8,
                            borderRadius: t.radius.pill,
                            backgroundColor: on
                              ? good
                                ? t.brand[600]
                                : t.status.critical
                              : t.softFill,
                          }}
                        >
                          <Body size={12} weight="semibold" color={on ? '#fff' : t.textSecondary}>
                            {SYMPTOM_LABEL[sym]}
                          </Body>
                        </Pressable>
                      );
                    })}
                  </View>

                  <Pressable
                    onPress={() =>
                      setLoad((p) => ({ ...p, [test.id]: { ...r, completed: !r.completed } }))
                    }
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: r.completed }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        borderWidth: r.completed ? 0 : 1.5,
                        borderColor: t.axis,
                        backgroundColor: r.completed ? t.brand[600] : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {r.completed && <Check size={14} color="#fff" strokeWidth={3} />}
                    </View>
                    <Body size={13} color={t.textSecondary}>
                      Completed the full dose
                    </Body>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </Card>

        <Card title="Strength">
          <Body size={12} color={t.textMuted} style={{ marginBottom: t.space.md }}>
            Reps to fatigue, aiming for 20. Falling short here shapes your strength work —
            it does not hold your running back.
          </Body>
          <View style={{ gap: t.space.md }}>
            {STRENGTH_TESTS.map((test) => {
              const r = strength[test.id]!;
              return (
                <View
                  key={test.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}
                >
                  <View style={{ flex: 1 }}>
                    <Body size={14} weight="medium">
                      {test.name}
                    </Body>
                    <Body size={12} color={t.textMuted}>
                      {test.cue}
                    </Body>
                  </View>
                  <TextInput
                    value={r.reps === 0 ? '' : String(r.reps)}
                    onChangeText={(v) =>
                      setStrength((p) => ({
                        ...p,
                        [test.id]: { ...r, reps: Number(v.replace(/\D/g, '')) || 0 },
                      }))
                    }
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={t.textMuted}
                    accessibilityLabel={`${test.name} repetitions`}
                    style={{
                      width: 70,
                      backgroundColor: t.inputFill,
                      borderRadius: t.radius.md,
                      paddingVertical: 12,
                      textAlign: 'center',
                      color: t.textPrimary,
                      fontSize: 17,
                      fontFamily: t.font.medium,
                    }}
                  />
                  <Body size={12} color={t.textMuted} style={{ width: 34 }}>
                    /{test.target}
                  </Body>
                </View>
              );
            })}
          </View>
        </Card>

        {submitted && (
          <Card style={{ borderWidth: 1.5, borderColor: verdictColor }}>
            <Pill tone={tone}>{outcome.headline}</Pill>
            <Body size={14} color={t.textSecondary} style={{ marginTop: t.space.md, lineHeight: 20 }}>
              {outcome.detail}
            </Body>

            <View style={{ marginTop: t.space.lg, gap: 6 }}>
              <Body size={13} weight="semibold">
                Load and impact: {outcome.loadPassed} of {outcome.loadTotal} clear
              </Body>
              {outcome.symptomatic.map((sx) => (
                <Body key={sx.testId} size={13} color={t.status.critical}>
                  · {LOAD_TESTS.find((l) => l.id === sx.testId)?.name} —{' '}
                  {SYMPTOM_LABEL[sx.symptom].toLowerCase()}
                </Body>
              ))}
            </View>

            {outcome.strengthGaps.length > 0 && (
              <View style={{ marginTop: t.space.md, gap: 6 }}>
                <Body size={13} weight="semibold">
                  Strength work to prioritise
                </Body>
                {outcome.strengthGaps.map((g) => (
                  <Body key={g.testId} size={13} color={t.textSecondary}>
                    · {STRENGTH_TESTS.find((s) => s.id === g.testId)?.name} — {g.reps}/{g.target}
                  </Body>
                ))}
              </View>
            )}

            <Body size={11} color={t.textMuted} style={{ marginTop: t.space.lg, lineHeight: 16 }}>
              Based on Goom, Donnelly &amp; Brockwell (2019) returning-to-running postnatal
              guidelines. This is a screening aid shared with your physiotherapist, not a
              medical clearance.
            </Body>
          </Card>
        )}

        <Button
          label={submitted ? 'Send to my physio' : 'See my result'}
          onPress={() => (submitted ? router.back() : setSubmitted(true))}
        />
        {!submitted && (
          <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
        )}
      </ScrollView>
    </Screen>
  );
}
