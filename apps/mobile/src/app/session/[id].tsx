import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { estimateOneRepMax } from '@coachapp/shared';
import { Button, Card, PainScale, Pill, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { todayPlan } from '@/lib/today';

interface LoggedSet {
  reps: string;
  weight: string;
  done: boolean;
}

/**
 * Active session logging.
 *
 * Design intent: the client is mid-set, standing, phone in one hand. Every control is a
 * large tap target, the previous session's numbers are pre-filled so the common case is
 * "tap done", and nothing here requires a network round-trip — Phase 3 writes straight
 * to SQLite and syncs later.
 */
export default function SessionScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [painBefore, setPainBefore] = useState<number | null>(2);
  const [started, setStarted] = useState(false);
  const [sets, setSets] = useState<Record<string, LoggedSet[]>>(() =>
    Object.fromEntries(
      todayPlan.map((item) => [
        item.id,
        Array.from({ length: item.sets }, () => ({
          reps: item.reps.split('-')[0] ?? '8',
          weight: item.targetLoadKg ? String(item.targetLoadKg) : '0',
          done: false,
        })),
      ]),
    ),
  );

  const completed = useMemo(
    () => Object.values(sets).flat().filter((s) => s.done).length,
    [sets],
  );
  const total = useMemo(() => Object.values(sets).flat().length, [sets]);

  function update(itemId: string, index: number, patch: Partial<LoggedSet>) {
    setSets((prev) => {
      const list = [...(prev[itemId] ?? [])];
      const current = list[index];
      if (!current) return prev;
      list[index] = { ...current, ...patch };
      return { ...prev, [itemId]: list };
    });
  }

  if (!started) {
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={{
            padding: t.space.lg,
            paddingTop: insets.top + t.space.lg,
            gap: t.space.lg,
          }}
        >
          <Text style={{ color: t.textPrimary, fontSize: 24, fontWeight: '700' }}>
            Before you start
          </Text>
          <Card title="How is your knee right now?">
            <PainScale value={painBefore} onChange={setPainBefore} />
            <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 12 }}>
              We ask before and after every session. The comparison is what tells your
              physiotherapist whether the current load is right for you.
            </Text>
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
          paddingTop: insets.top + 8,
          paddingHorizontal: t.space.lg,
          paddingBottom: t.space.md,
          backgroundColor: t.surface,
          borderBottomWidth: 1,
          borderBottomColor: t.border,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ color: t.textPrimary, fontSize: 18, fontWeight: '700' }}>
              Lower body + core
            </Text>
            <Text style={{ color: t.textSecondary, fontSize: 13 }}>
              {completed} of {total} sets · pain before {painBefore}/10
            </Text>
          </View>
          <Pill tone="warning">Offline — will sync</Pill>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: t.space.lg, paddingBottom: t.space.xxl, gap: t.space.md }}
      >
        {todayPlan.map((item) => (
          <Card key={item.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.textPrimary, fontSize: 17, fontWeight: '600' }}>
                  {item.name}
                </Text>
                <Text style={{ color: t.textSecondary, fontSize: 13, marginTop: 2 }}>
                  {item.sets} × {item.reps}
                  {item.targetRpe ? ` @ RPE ${item.targetRpe}` : ''}
                  {item.tempo ? ` · tempo ${item.tempo}` : ''}
                </Text>
              </View>
              <Text style={{ color: t.textMuted, fontSize: 12 }}>{item.restSec}s rest</Text>
            </View>

            {item.cues[0] && (
              <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 8, fontStyle: 'italic' }}>
                {item.cues[0]}
              </Text>
            )}

            <View style={{ marginTop: t.space.lg, gap: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 2 }}>
                <Text style={{ width: 28, color: t.textMuted, fontSize: 11 }}>SET</Text>
                <Text style={{ flex: 1, color: t.textMuted, fontSize: 11 }}>KG</Text>
                <Text style={{ flex: 1, color: t.textMuted, fontSize: 11 }}>REPS</Text>
                <Text style={{ width: 52, color: t.textMuted, fontSize: 11, textAlign: 'center' }}>
                  DONE
                </Text>
              </View>

              {(sets[item.id] ?? []).map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Text
                    style={{ width: 28, color: t.textSecondary, fontSize: 15, fontWeight: '600' }}
                  >
                    {i + 1}
                  </Text>
                  <TextInput
                    value={s.weight}
                    onChangeText={(v) => update(item.id, i, { weight: v })}
                    keyboardType="decimal-pad"
                    style={{
                      flex: 1,
                      backgroundColor: t.dark ? '#26292c' : '#f2f3f2',
                      borderRadius: t.radius.sm,
                      paddingVertical: 11,
                      paddingHorizontal: 12,
                      color: t.textPrimary,
                      fontSize: 16,
                      fontVariant: ['tabular-nums'],
                    }}
                  />
                  <TextInput
                    value={s.reps}
                    onChangeText={(v) => update(item.id, i, { reps: v })}
                    keyboardType="number-pad"
                    style={{
                      flex: 1,
                      backgroundColor: t.dark ? '#26292c' : '#f2f3f2',
                      borderRadius: t.radius.sm,
                      paddingVertical: 11,
                      paddingHorizontal: 12,
                      color: t.textPrimary,
                      fontSize: 16,
                      fontVariant: ['tabular-nums'],
                    }}
                  />
                  <Pressable
                    onPress={() => update(item.id, i, { done: !s.done })}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: s.done }}
                    accessibilityLabel={`Set ${i + 1} complete`}
                    style={{
                      width: 52,
                      height: 42,
                      borderRadius: t.radius.sm,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: s.done ? t.status.good : t.dark ? '#26292c' : '#f2f3f2',
                    }}
                  >
                    <Text style={{ color: s.done ? '#fff' : t.textMuted, fontSize: 17 }}>✓</Text>
                  </Pressable>
                </View>
              ))}
            </View>

            {(() => {
              const best = (sets[item.id] ?? [])
                .filter((s) => s.done)
                .map((s) => estimateOneRepMax(Number(s.weight), Number(s.reps)))
                .filter((n): n is number => n !== null);
              if (best.length === 0) return null;
              return (
                <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 10 }}>
                  Estimated 1RM this session: {Math.max(...best).toFixed(1)} kg
                </Text>
              );
            })()}
          </Card>
        ))}

        <Card title="Finish session">
          <Text style={{ color: t.textSecondary, fontSize: 13, marginBottom: 12 }}>
            How is the knee now, after the session?
          </Text>
          <PainScale value={null} onChange={() => {}} />
          <View style={{ marginTop: t.space.xl }}>
            <Button
              label={`Save session (${completed}/${total} sets)`}
              onPress={() => router.back()}
            />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
