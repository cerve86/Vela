import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveWellness } from '@vela/api';
import { Body, Button, Card, Display, Screen } from '@/components/kit';
import { ChoiceChips } from '@/components/scales';
import { useTheme } from '@/theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { startOfWeek, today } from '@/lib/data';

/**
 * The week's four questions: sleep, fatigue, soreness, stress, each 1–5.
 *
 * One scale direction for all four, 1 good and 5 bad, with the words on every chip, so
 * nobody has to remember which way round sleep goes. Her physio reads them beside her
 * readiness taps; nothing here changes a session on its own.
 */
type Key = 'sleep' | 'fatigue' | 'soreness' | 'stress';

const QUESTIONS: { key: Key; title: string; words: [string, string, string, string, string] }[] = [
  {
    key: 'sleep',
    title: 'How have you slept this week?',
    words: ['Great', 'Good', 'OK', 'Poor', 'Very poor'],
  },
  {
    key: 'fatigue',
    title: 'How tired have you felt?',
    words: ['Fresh', 'Fine', 'Some days tired', 'Tired', 'Exhausted'],
  },
  {
    key: 'soreness',
    title: 'How sore are your muscles?',
    words: ['Not at all', 'A little', 'Some', 'Quite sore', 'Very sore'],
  },
  {
    key: 'stress',
    title: 'How stressed have you been?',
    words: ['Relaxed', 'A little', 'Some', 'Quite', 'Very'],
  },
];

export default function WellnessScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client } = useSession();
  const [answers, setAnswers] = useState<Partial<Record<Key, number>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = QUESTIONS.every((q) => answers[q.key] !== undefined);

  async function save() {
    if (!client || !complete) return;
    setSaving(true);
    setError(null);
    const { error: saveError } = await saveWellness(supabase, client.id, startOfWeek(today()), {
      sleep: answers.sleep!,
      fatigue: answers.fatigue!,
      soreness: answers.soreness!,
      stress: answers.stress!,
    });
    setSaving(false);
    if (saveError) setError('Could not save that. Try again in a moment.');
    else router.back();
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: Math.min(insets.top, 12) + t.space.lg,
          paddingBottom: t.space.xxl,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Display size={28}>This week</Display>
        <Body size={14} color={t.textSecondary} style={{ lineHeight: 20 }}>
          Four quick questions for your physio. Think about the week as a whole.
        </Body>

        {QUESTIONS.map((q) => (
          <Card key={q.key} style={{ borderRadius: 22 }}>
            <Body size={15} weight="medium">
              {q.title}
            </Body>
            <View style={{ marginTop: 12 }}>
              <ChoiceChips
                options={q.words.map((w, i) => ({ value: String(i + 1), label: w }))}
                value={answers[q.key] !== undefined ? String(answers[q.key]) : null}
                onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: Number(v) }))}
              />
            </View>
          </Card>
        ))}

        {error && (
          <Body size={13} color={t.status.critical} style={{ textAlign: 'center' }}>
            {error}
          </Body>
        )}
        <Button
          label={saving ? 'Saving…' : 'Send to your physio'}
          disabled={!complete || saving}
          onPress={() => void save()}
        />
        <Button label="Not now" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
