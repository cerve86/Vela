import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';
import { Body, Card, Screen } from '@/components/kit';
import { Tap } from '@/components/motion';
import { useTheme } from '@/theme';
import { WINDOWS, useDailyRead, type Tide } from '@/lib/daily';

/**
 * The daily readiness read.
 *
 * Three fixed windows a day, each locked once submitted. The constraint is the feature: an
 * open-ended mood log becomes a chore and then a lie, because the entries drift toward
 * whatever the person thinks they ought to feel. Three timestamped reads are enough to see
 * a pattern and few enough to stay honest.
 */
export default function MoodScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const daily = useDailyRead();

  const [picked, setPicked] = useState<Tide | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const already = daily.read.reads[daily.openWindow] !== undefined;
  const shut = daily.allLogged || already;
  const win = WINDOWS.find((w) => w.key === daily.openWindow)!;

  async function lock() {
    if (shut) {
      setRefusal(daily.allLogged ? 'Three reads a day is plenty.' : 'This window is already logged.');
      return;
    }
    if (picked === null) return;
    // Awaited now that the lock is a write rather than a device setting. The refusal can
    // come from the database as well as from this screen — two phones, or a reinstall
    // mid-day, both defeated the old local-only check.
    const result = await daily.lock(picked);
    if (!result.ok) {
      setRefusal('This window is already logged.');
      return;
    }
    router.back();
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: t.space.lg,
          paddingTop: insets.top + t.space.md,
          paddingBottom: t.space.xxl,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
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
          <Body size={12.5} weight="medium" color={t.textSecondary}>
            {win.label} · until {String(win.until).padStart(2, '0')}:00
          </Body>
        </View>

        <Text
          style={{
            fontFamily: t.font.displaySemi,
            fontSize: 32,
            letterSpacing: -1.1,
            lineHeight: 35,
            color: t.textPrimary,
            marginTop: 6,
          }}
        >
          {daily.allLogged ? 'All three in —\ncome back tomorrow' : `How is it\nright now?`}
        </Text>
        {!daily.allLogged && (
          <Body size={13.5} color={t.textSecondary} style={{ marginTop: -6 }}>
            One tap. Today is built from your answer.
          </Body>
        )}

        <View style={{ flexDirection: 'row', gap: 7, marginTop: 8, opacity: shut ? 0.45 : 1 }}>
          {t.tide.map((step, i) => {
            const on = picked === i;
            return (
              <Tap
                key={step.label}
                disabled={shut}
                onPress={() => {
                  setPicked(i as Tide);
                  setRefusal(null);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, disabled: shut }}
                accessibilityLabel={step.label}
                style={{
                  flex: 1,
                  borderRadius: 22,
                  paddingVertical: 16,
                  paddingHorizontal: 4,
                  alignItems: 'center',
                  gap: 9,
                  backgroundColor: on ? withAlpha(step.tone, t.dark ? 0.22 : 0.12) : t.surface,
                  borderWidth: 1.5,
                  borderColor: on ? step.tone : t.border,
                }}
              >
                <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
                  {step.paths.map((d) => (
                    <Path
                      key={d}
                      d={d}
                      stroke={on ? step.tone : t.textMuted}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                </Svg>
                <Body
                  size={11}
                  weight="medium"
                  color={on ? t.textPrimary : t.textSecondary}
                  style={{ textAlign: 'center' }}
                >
                  {step.label}
                </Body>
              </Tap>
            );
          })}
        </View>

        <Pressable
          onPress={() => void lock()}
          disabled={picked === null && !shut}
          accessibilityRole="button"
          style={({ pressed }) => ({
            borderRadius: t.radius.pill,
            paddingVertical: 16,
            alignItems: 'center',
            backgroundColor: shut || picked === null ? t.softFill : t.brand[600],
            transform: [{ scale: pressed ? 0.965 : 1 }],
          })}
        >
          <Text
            style={{
              fontFamily: t.font.displaySemi,
              fontSize: 18,
              color: shut || picked === null ? t.textMuted : '#FFFFFF',
            }}
          >
            {shut
              ? 'Nothing more to log today'
              : picked === null
                ? 'Pick one'
                : `Lock ${win.label.toLowerCase()} read`}
          </Text>
        </Pressable>

        {refusal && (
          <Body size={13} color={t.status.warning} style={{ textAlign: 'center' }}>
            {refusal}
          </Body>
        )}

        <Card style={{ borderRadius: 22 }}>
          <Body size={11} weight="medium" color={t.textSecondary} style={{ letterSpacing: 0.5 }}>
            TODAY&apos;S READS
          </Body>

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 16 }}>
            {WINDOWS.map((w, i) => {
              const v = daily.read.reads[w.key];
              const isOpen = w.key === daily.openWindow && v === undefined;
              const tone = v === undefined ? t.grid : t.tide[v]!.tone;

              return (
                <View key={w.key} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ alignItems: 'center', gap: 5, width: 62 }}>
                    <View
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 15,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: v === undefined ? t.softFill : withAlpha(tone, 0.14),
                        borderWidth: 2,
                        borderColor: isOpen ? t.brand[600] : v === undefined ? t.grid : tone,
                      }}
                    >
                      <View
                        style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: tone }}
                      />
                    </View>
                    <Body
                      size={11}
                      weight="medium"
                      color={v === undefined ? t.textMuted : t.textPrimary}
                      style={{ letterSpacing: 0.3 }}
                    >
                      {w.label}
                    </Body>
                    <Body size={11} color={t.textSecondary}>
                      {v === undefined ? (isOpen ? 'open' : '—') : t.tide[v]!.label}
                    </Body>
                  </View>
                  {i < WINDOWS.length - 1 && (
                    <View style={{ flex: 1, height: 2, borderRadius: 1, backgroundColor: t.grid }} />
                  )}
                </View>
              );
            })}
          </View>

          <Body size={11} color={t.textSecondary} style={{ marginTop: 16, lineHeight: 16 }}>
            Three reads a day, each locked once submitted. Enough to see a pattern, not enough
            to become a chore.
          </Body>
        </Card>

        <Body size={11} color={t.textMuted} style={{ textAlign: 'center', lineHeight: 16 }}>
          Saved on this phone for now. Your physio will see these once daily reads are added to
          your record.
        </Body>
      </ScrollView>
    </Screen>
  );
}

/** Hex + alpha -> rgba(). The tide tones are fixed hexes, so no parsing edge cases arise. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
