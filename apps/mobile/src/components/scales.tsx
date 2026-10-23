import { Pressable, Text, View } from 'react-native';
import { Body } from '@/components/kit';
import { Tap } from '@/components/motion';
import { useTheme } from '@/theme';

/**
 * A 0–10 tap scale with words at the ends and the chosen value named in the middle.
 *
 * Readiness and session RPE run in opposite directions (10 is fresh; 10 is maximal), so
 * each caller passes its own words and colour: the number alone would invite exactly the
 * confusion the spec warns about.
 */
export function NumberScale({
  value,
  onChange,
  low,
  high,
  word,
  color,
  label,
}: {
  value: number | null;
  onChange: (n: number) => void;
  low: string;
  high: string;
  word: (n: number) => string;
  color: (n: number) => string;
  /** For screen readers: "Readiness", "Effort". */
  label: string;
}) {
  const t = useTheme();
  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {Array.from({ length: 11 }, (_, i) => {
          const selected = value === i;
          return (
            <Pressable
              key={i}
              onPress={() => onChange(i)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${label} ${i} out of 10, ${word(i)}`}
              style={{
                flex: 1,
                minWidth: 0,
                aspectRatio: 0.8,
                borderRadius: t.radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? color(i) : t.softFill,
              }}
            >
              <Text
                style={{
                  fontFamily: selected ? t.font.displayBold : t.font.medium,
                  color: selected ? '#fff' : t.textSecondary,
                  fontSize: 13,
                }}
              >
                {i}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 8,
        }}
      >
        <Body size={11} color={t.textMuted}>
          {low}
        </Body>
        <Body size={12} weight="semibold">
          {value === null ? 'Tap a number' : word(value)}
        </Body>
        <Body size={11} color={t.textMuted}>
          {high}
        </Body>
      </View>
    </View>
  );
}

/** One choice from a few, as chips. */
export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  tone,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  tone?: string;
}) {
  const t = useTheme();
  const on = tone ?? t.brand[600];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <Tap
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={{
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: t.radius.pill,
              borderWidth: 1.5,
              borderColor: selected ? on : t.border,
              backgroundColor: selected ? t.brand[50] : t.surface,
            }}
          >
            <Body size={13.5} weight="medium" color={selected ? on : t.textSecondary}>
              {o.label}
            </Body>
          </Tap>
        );
      })}
    </View>
  );
}

export const READINESS_WORD = (n: number) =>
  n <= 2 ? 'Running on empty' : n <= 4 ? 'Tired' : n <= 6 ? 'OK' : n <= 8 ? 'Good' : 'Fresh';

export const RPE_WORD = (n: number) =>
  [
    'Rest',
    'Very easy',
    'Easy',
    'Moderate',
    'Somewhat hard',
    'Hard',
    'Hard',
    'Very hard',
    'Very hard',
    'Very, very hard',
    'Maximal',
  ][n] ?? '';

export const PAIN_LOCATIONS = [
  { value: 'knee', label: 'Knee' },
  { value: 'shin', label: 'Shin' },
  { value: 'hip', label: 'Hip' },
  { value: 'back', label: 'Back' },
  { value: 'foot', label: 'Foot or ankle' },
  { value: 'pelvic floor', label: 'Pelvic floor' },
  { value: 'other', label: 'Somewhere else' },
] as const;

export const ACUTE_OPTIONS = [
  { value: 'none', label: 'None of these' },
  { value: 'fever', label: 'Fever' },
  { value: 'chest pain or tightness', label: 'Chest pain or tightness' },
  { value: 'dizziness', label: 'Dizziness' },
] as const;
