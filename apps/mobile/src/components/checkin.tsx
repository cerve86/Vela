import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Card } from '@/components/kit';
import { useTheme } from '@/theme';

/**
 * The check-in card: the one place the app asks how it is going, not just what was done.
 *
 * The sentence is built from the week so far and the goal she gave, so it reads as a
 * question about her rather than a prompt about the app. The button leads to the daily
 * read, which is where the answer is recorded.
 */
export function CheckInCard({
  completed,
  due,
  goal,
  allLogged,
  readGiven,
}: {
  completed: number;
  due: number;
  goal: string | null;
  allLogged: boolean;
  readGiven: boolean;
}) {
  const t = useTheme();
  const router = useRouter();

  const week =
    due === 0
      ? 'A quiet week on the plan so far.'
      : completed === due
        ? `${completed} of ${due} sessions done this week — every one of them.`
        : `${completed} of ${due} sessions done this week.`;
  const ask = goal
    ? `How is the training feeling, and how close does “${goal}” feel right now?`
    : 'How is the training feeling, and how is the coaching going for you?';

  return (
    <Card fill={t.dark ? 'rgba(124,58,237,0.16)' : t.tint.lilac} style={{ borderRadius: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C3AED' }} />
        <Body size={11} weight="medium" color={t.textSecondary} style={{ letterSpacing: 0.6 }}>
          CHECK-IN
        </Body>
        {readGiven && (
          <Body size={11} color={t.textMuted} style={{ marginLeft: 'auto' }}>
            {allLogged ? 'All three reads in' : 'Read given'}
          </Body>
        )}
      </View>
      <Text
        style={{
          fontFamily: t.font.regular,
          fontSize: 16.5,
          lineHeight: 24,
          color: t.textPrimary,
          marginTop: 10,
        }}
      >
        {week} {ask}
      </Text>
      <Pressable
        onPress={() => router.push('/mood')}
        accessibilityRole="button"
        style={({ pressed }) => ({
          marginTop: 16,
          backgroundColor: '#7C3AED',
          borderRadius: t.radius.pill,
          paddingVertical: 15,
          alignItems: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text style={{ fontFamily: t.font.displaySemi, fontSize: 15.5, color: '#FFFFFF' }}>
          {readGiven ? 'Update my check-in →' : 'Start check-in →'}
        </Text>
      </Pressable>
    </Card>
  );
}
