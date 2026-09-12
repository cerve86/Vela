import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { Body, Screen } from '@/components/kit';
import { Prose } from '@/components/prose';
import { useTheme } from '@/theme';
import { useAssignedProgram } from '@/lib/data';

/**
 * A written programme, read through.
 *
 * The physiotherapist wrote what to do as prose and this shows it as she wrote it: blank
 * lines make paragraphs, a line starting with a number or a dash is a list item, a line
 * that ends in a colon or stands alone in capitals is a heading. Nothing is interpreted
 * beyond that — the text is the prescription and it is hers.
 */
export default function ProgramScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const assigned = useAssignedProgram();
  const program = assigned.data;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.space.lg,
          paddingTop: insets.top + t.space.md,
          paddingBottom: t.space.xxl * 2,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back to Today"
            style={({ pressed }) => ({
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.border,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: pressed ? 0.965 : 1 }],
            })}
          >
            <ChevronLeft size={16} color={t.textPrimary} strokeWidth={2.5} />
          </Pressable>
          {program ? (
            <Body size={12.5} weight="medium" color={t.textSecondary}>
              {program.durationWeeks} weeks · from {friendly(program.startDate)}
            </Body>
          ) : null}
        </View>

        {program?.kind === 'descriptive' && program.body ? (
          <>
            <Text
              style={{
                fontFamily: t.font.displaySemi,
                fontSize: 30,
                letterSpacing: -1,
                lineHeight: 34,
                color: t.textPrimary,
                marginTop: 6,
              }}
            >
              {program.name}
            </Text>
            {program.description ? (
              <Body size={13.5} color={t.textSecondary} style={{ marginTop: -6 }}>
                {program.description}
              </Body>
            ) : null}
            <Prose body={program.body} />
            <Body size={12.5} color={t.textMuted} style={{ textAlign: 'center', marginTop: 8 }}>
              Written by your physio. If anything is unclear, or feels heavy or dragging, tell her
              in Messages.
            </Body>
          </>
        ) : (
          <>
            <Text
              style={{
                fontFamily: t.font.displaySemi,
                fontSize: 30,
                letterSpacing: -1,
                lineHeight: 34,
                color: t.textPrimary,
                marginTop: 6,
              }}
            >
              Your programme
            </Text>
            <Body size={14} color={t.textSecondary} style={{ lineHeight: 20 }}>
              {assigned.loading
                ? 'Loading…'
                : 'Nothing written for you at the moment. When your physio assigns one, it appears here and on Today.'}
            </Body>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function friendly(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}
