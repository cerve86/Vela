import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { estimateOneRepMax } from '@vela/shared';
import { DISCIPLINE_LABEL } from '@vela/api';
import { ActivityIndicator } from 'react-native';
import { Body, Button, Card, Display, PainScale, Pill, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { useSessionMeta, useSessionPlan } from '@/lib/data';
import { supabase } from '@/lib/supabase';

interface LoggedSet {
  reps: string;
  weight: string;
  done: boolean;
}

/** "8-10" → "8", "8 each side" → "8", "AMRAP" → "". Prescriptions are free text; the input is not. */
function defaultReps(prescription: string): string {
  return /^\d+/.exec(prescription)?.[0] ?? '';
}

/**
 * `minWidth: 0` matters: a text input's intrinsic min-content width otherwise refuses to
 * shrink below roughly 20 characters, which pushes the DONE column off the right edge.
 */
const fieldBase = StyleSheet.create({
  input: {
    flex: 1,
    minWidth: 0,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    fontSize: 16,
    fontVariant: ['tabular-nums'] as const,
  },
}).input;

/**
 * Active session logging.
 *
 * Design intent: the client is mid-set, standing, phone in one hand. Every control is a
 * large tap target and the prescription's numbers are pre-filled, so the common case is
 * "tap done". Logging itself is all local state; only finishing writes to the server.
 * Phase 3 moves that write behind an offline outbox.
 */
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
  const todayPlan = plan.data;

  const [painBefore, setPainBefore] = useState<number | null>(2);
  const [painAfter, setPainAfter] = useState<number | null>(null);
  const [started, setStarted] = useState(false);
  const [sets, setSets] = useState<Record<string, LoggedSet[]>>({});

  // Seed the log grid once the prescription arrives. Keyed on item id so a plan that
  // loads late does not wipe anything the client has already typed.
  useEffect(() => {
    setSets((prev) => {
      const next = { ...prev };
      for (const item of todayPlan) {
        if (next[item.itemId]) continue;
        next[item.itemId] = Array.from({ length: item.sets }, () => ({
          reps: defaultReps(item.reps),
          // Bodyweight work has no load to log — an empty string, not a misleading 0.
          weight: item.targetLoadKg ? String(item.targetLoadKg) : '',
          done: false,
        }));
      }
      return next;
    });
  }, [todayPlan]);

  const completed = useMemo(() => Object.values(sets).flat().filter((s) => s.done).length, [sets]);
  const total = useMemo(() => Object.values(sets).flat().length, [sets]);

  const [saving, setSaving] = useState(false);

  /**
   * Marks the session complete with the before/after pain scores. Set-by-set logs land
   * in Phase 3 with the offline outbox; writing the session outcome now means the
   * coach's adherence and pain trend are real rather than seeded.
   */
  async function save() {
    if (!sessionId) return;
    setSaving(true);
    await supabase
      .from('sessions')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        pain_before: painBefore,
        pain_after: painAfter,
      })
      .eq('id', sessionId);
    setSaving(false);
    router.back();
  }

  function update(itemId: string, index: number, patch: Partial<LoggedSet>) {
    setSets((prev) => {
      const list = [...(prev[itemId] ?? [])];
      const current = list[index];
      if (!current) return prev;
      list[index] = { ...current, ...patch };
      return { ...prev, [itemId]: list };
    });
  }

  if (plan.loading && todayPlan.length === 0) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.brand[600]} />
        </View>
      </Screen>
    );
  }

  if (!started) {
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={{
            padding: t.space.lg,
            paddingTop: topPad + t.space.xl,
            gap: t.space.lg,
          }}
        >
          <Display size={30}>Before you start</Display>
          <Card title="How are you feeling right now?">
            <PainScale value={painBefore} onChange={setPainBefore} />
            <Body size={12} color={t.textMuted} style={{ marginTop: 14 }}>
              Score the strongest of pain, heaviness, dragging or leaking. We ask before
              and after every session — the comparison is what tells your physiotherapist
              whether the current load is right for you.
            </Body>
          </Card>
          <Button label="Begin session" onPress={() => setStarted(true)} />
          <Button label="Cancel" variant="secondary" onPress={() => router.back()} />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <View
        style={{
          paddingTop: topPad + 10,
          paddingHorizontal: t.space.lg,
          paddingBottom: t.space.md,
          backgroundColor: t.surface,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: t.border,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Display size={19}>{meta.data?.title ?? 'Session'}</Display>
            <Body size={13} color={t.textSecondary}>
              {completed} of {total} sets · pain before {painBefore}/10
            </Body>
          </View>
          {meta.data && <Pill tone="brand">{DISCIPLINE_LABEL[meta.data.discipline]}</Pill>}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: t.space.lg, paddingBottom: t.space.xxl * 2, gap: t.space.md }}
        showsVerticalScrollIndicator={false}
      >
        {todayPlan.map((item) => (
          <Card key={item.itemId}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Display size={18}>{item.exerciseName}</Display>
                <Body size={13} color={t.textSecondary} style={{ marginTop: 2 }}>
                  {item.sets} × {item.reps}
                  {item.targetRpe ? ` @ RPE ${item.targetRpe}` : ''}
                  {item.tempo ? ` · tempo ${item.tempo}` : ''}
                </Body>
              </View>
              <Body size={12} color={t.textMuted}>
                {item.restSec}s rest
              </Body>
            </View>

            {item.cues[0] && (
              <Body size={12} color={t.textMuted} style={{ marginTop: 8, fontStyle: 'italic' }}>
                {item.cues[0]}
              </Body>
            )}

            <View style={{ marginTop: t.space.lg, gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
                <Body size={11} weight="bold" color={t.textMuted} style={{ width: 28 }}>
                  SET
                </Body>
                <Body size={11} weight="bold" color={t.textMuted} style={{ flex: 1 }}>
                  KG
                </Body>
                <Body size={11} weight="bold" color={t.textMuted} style={{ flex: 1 }}>
                  REPS
                </Body>
                <Body size={11} weight="bold" color={t.textMuted} style={{ width: 52, textAlign: 'center' }}>
                  DONE
                </Body>
              </View>

              {(sets[item.itemId] ?? []).map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Text
                    style={{
                      width: 28,
                      fontFamily: t.font.displayBold,
                      fontSize: 15,
                      color: t.textSecondary,
                    }}
                  >
                    {i + 1}
                  </Text>
                  <TextInput
                    value={s.weight}
                    onChangeText={(v) => update(item.itemId, i, { weight: v })}
                    keyboardType="decimal-pad"
                    placeholder={item.targetLoadKg ? undefined : 'BW'}
                    placeholderTextColor={t.textMuted}
                    accessibilityLabel={`Set ${i + 1} weight in kilograms`}
                    style={[
                      fieldBase,
                      { backgroundColor: t.inputFill, color: t.textPrimary, fontFamily: t.font.medium },
                    ]}
                  />
                  <TextInput
                    value={s.reps}
                    onChangeText={(v) => update(item.itemId, i, { reps: v })}
                    keyboardType="number-pad"
                    accessibilityLabel={`Set ${i + 1} repetitions`}
                    style={[
                      fieldBase,
                      { backgroundColor: t.inputFill, color: t.textPrimary, fontFamily: t.font.medium },
                    ]}
                  />
                  <Pressable
                    onPress={() => update(item.itemId, i, { done: !s.done })}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: s.done }}
                    accessibilityLabel={`Set ${i + 1} complete`}
                    style={{
                      width: 52,
                      height: 46,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: s.done ? t.brand[600] : t.inputFill,
                    }}
                  >
                    <Text style={{ color: s.done ? '#fff' : t.textMuted, fontSize: 17 }}>✓</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            {(() => {
              const best = (sets[item.itemId] ?? [])
                .filter((s) => s.done)
                .map((s) => estimateOneRepMax(Number(s.weight), Number(s.reps)))
                .filter((n): n is number => n !== null);
              if (best.length === 0) return null;
              return (
                <Body size={12} color={t.textMuted} style={{ marginTop: 12 }}>
                  Estimated 1RM this session: {Math.max(...best).toFixed(1)} kg
                </Body>
              );
            })()}
          </Card>
        ))}

        <Card title="Finish session">
          <Body size={13} color={t.textSecondary} style={{ marginBottom: 14 }}>
            How are you feeling now, after the session?
          </Body>
          <PainScale value={painAfter} onChange={setPainAfter} />
          <View style={{ marginTop: t.space.xl }}>
            <Button
              label={saving ? 'Saving…' : `Save session (${completed}/${total} sets)`}
              disabled={saving}
              onPress={save}
            />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
