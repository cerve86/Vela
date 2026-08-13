import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Card, Display, Pill, Screen } from '@/components/kit';
import { useTheme } from '@/theme';

/**
 * Nutrition is Phase 5. This screen deliberately shows nothing rather than seeded
 * numbers: a client cannot tell demo data from her own, and a macro ring that is not
 * really hers is worse than an empty state.
 */
export default function NutritionScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: insets.top + t.space.md,
          gap: t.space.md,
        }}
      >
        <Display size={30}>Nutrition</Display>
        <Card>
          <Pill tone="neutral">Coming in Phase 5</Pill>
          <Body size={14} color={t.textSecondary} style={{ marginTop: t.space.md, lineHeight: 20 }}>
            Macro targets set by your physio, barcode scanning and daily logging land here.
            Until then keep using whatever food app you already have — we would rather
            show you nothing than numbers that are not yours.
          </Body>
        </Card>
        <Card title="Why it matters here">
          <Body size={13} color={t.textSecondary} style={{ lineHeight: 19 }}>
            Energy availability affects recovery, bone health and pelvic floor function,
            and it matters more while breastfeeding. When this arrives it will be framed
            around fuelling your training, not restriction.
          </Body>
        </Card>
        <View style={{ height: t.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}
