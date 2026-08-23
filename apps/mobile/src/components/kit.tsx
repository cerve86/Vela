import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import { painColor, painLabel } from '@vela/shared/tokens';
import { useTheme } from '@/theme';

/**
 * Component kit, restyled to the reference: white surfaces, very round corners, soft
 * grey chip rows, heavy tight headlines against light body text.
 */

export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={{ flex: 1, backgroundColor: t.page }}>{children}</View>;
}

/** Heavy, tightly-tracked display type — the reference's signature move. */
export function Display({
  children,
  size = 28,
  style,
}: {
  children: ReactNode;
  size?: number;
  style?: TextStyle;
}) {
  const t = useTheme();
  return (
    <Text
      style={[
        {
          fontFamily: t.font.display,
          fontSize: size,
          letterSpacing: t.typography.tracking.display,
          color: t.textPrimary,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  size = 14,
  weight = 'regular',
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  color?: string;
  style?: TextStyle;
  /** Truncation, for metadata sharing a row with something that must not be pushed off it. */
  numberOfLines?: number;
}) {
  const t = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { fontFamily: t.font[weight], fontSize: size, color: color ?? t.textPrimary },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Card({
  title,
  right,
  children,
  style,
  fill,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  style?: ViewStyle;
  /** Tinted variant for promo / highlight cards, as in the reference. */
  fill?: string;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: fill ?? t.surface,
          borderRadius: t.radius.xl,
          borderWidth: fill ? 0 : StyleSheet.hairlineWidth,
          borderColor: t.border,
          padding: t.space.xl,
        },
        style,
      ]}
    >
      {(title || right) && (
        <View style={styles.cardHeader}>
          {title && (
            <Text style={{ fontFamily: t.font.displaySemi, fontSize: 16, color: t.textPrimary }}>
              {title}
            </Text>
          )}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

/** Soft grey row, the reference's list primitive. */
export function ChipRow({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.softFill,
          borderRadius: t.radius.lg,
          paddingHorizontal: t.space.lg,
          paddingVertical: t.space.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.space.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: 'good' | 'warning' | 'critical' | 'neutral' | 'brand' | 'accent';
  children: ReactNode;
}) {
  const t = useTheme();
  const map = {
    good: t.status.good,
    warning: t.status.warning,
    critical: t.status.critical,
    brand: t.brand[600],
    accent: t.accent[500],
    neutral: t.textMuted,
  } as const;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: t.radius.pill,
        backgroundColor: t.softFill,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: map[tone] }} />
      <Text style={{ fontFamily: t.font.semibold, fontSize: 12, color: t.textPrimary }}>
        {children}
      </Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const t = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: primary ? t.brand[600] : 'transparent',
        borderWidth: primary ? 0 : 1,
        borderColor: t.border,
        borderRadius: t.radius.pill,
        paddingVertical: 16,
        alignItems: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: t.font.displaySemi,
          color: primary ? '#fff' : t.textPrimary,
          fontSize: 16,
          letterSpacing: -0.2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The 0-10 numeric rating scale. Deliberately a row of large tap targets rather than a
 * slider: clients log this mid-session with sweaty hands, and a slider demands precision
 * the moment does not allow.
 */
export function PainScale({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (n: number) => void;
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
              accessibilityLabel={`Pain ${i} out of 10`}
              style={{
                flex: 1,
                minWidth: 0,
                aspectRatio: 0.8,
                borderRadius: t.radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? painColor(i) : t.softFill,
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
      <View style={styles.scaleLegend}>
        <Body size={11} color={t.textMuted}>
          No pain
        </Body>
        <Body size={12} weight="semibold">
          {value === null ? 'Not recorded' : painLabel(value)}
        </Body>
        <Body size={11} color={t.textMuted}>
          Worst imaginable
        </Body>
      </View>
    </View>
  );
}

export function StatRow({ items }: { items: { label: string; value: string; unit?: string }[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row' }}>
      {items.map((it) => (
        <View key={it.label} style={{ flex: 1 }}>
          <Body size={12} color={t.textSecondary}>
            {it.label}
          </Body>
          <Text
            style={{
              fontFamily: t.font.display,
              fontSize: 22,
              letterSpacing: -0.6,
              color: t.textPrimary,
              marginTop: 2,
            }}
          >
            {it.value}
            {it.unit && (
              <Text style={{ fontFamily: t.font.medium, fontSize: 12, color: t.textMuted }}>
                {' '}
                {it.unit}
              </Text>
            )}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function ProgressBar({ value, color }: { value: number; color: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        height: 8,
        borderRadius: t.radius.pill,
        overflow: 'hidden',
        backgroundColor: t.softFill,
      }}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(1, value)) * 100}%`,
          height: '100%',
          borderRadius: t.radius.pill,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/** Circular avatar with initials — the reference uses round photos everywhere. */
export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const t = useTheme();
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.brand[100],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{ fontFamily: t.font.displayBold, color: t.brand[800], fontSize: size * 0.36 }}
      >
        {initials}
      </Text>
    </View>
  );
}

/**
 * The dose badge — "3 × 8-10", "22.5 kg".
 *
 * A raised chip rather than plain text, because it sits inside a row that is already tinted
 * and the prescription is the one thing on that row a client scans for. Tabular numerals
 * keep a column of doses from jittering as digits change width.
 */
export function DosePill({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.dark ? t.border : 'rgba(27,79,216,0.18)',
        borderRadius: t.radius.sm,
        paddingVertical: 5,
        paddingHorizontal: 9,
      }}
    >
      <Text
        style={{
          fontFamily: t.font.medium,
          fontSize: 12.5,
          color: t.brand[600],
          fontVariant: ['tabular-nums'],
        }}
      >
        {children}
      </Text>
    </View>
  );
}

/** One prescribed movement, as listed on Today. Dot, name, dose. */
export function PlanRow({ name, dose }: { name: string; dose: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.softFill,
        borderRadius: t.radius.md,
        paddingVertical: 11,
        paddingHorizontal: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.brand[400] }} />
      <Body size={15} weight="medium" style={{ flex: 1 }}>
        {name}
      </Body>
      <DosePill>{dose}</DosePill>
    </View>
  );
}

/**
 * One of the three figures summarising a session — time, moves, sets.
 *
 * `dark` inverts it. The design fills the first tile with ink/900 so the eye lands on
 * duration first; the other two stay tinted. That ordering is the point, so the variant
 * lives here rather than being re-derived at each call site.
 */
export function StatTile({
  label,
  value,
  unit,
  dark: inverted = false,
  flex = 1,
}: {
  label: string;
  value: string;
  unit?: string;
  dark?: boolean;
  flex?: number;
}) {
  const t = useTheme();
  const fg = inverted ? '#FFFFFF' : t.textPrimary;
  const labelFg = inverted ? t.brand[300] : t.textSecondary;

  return (
    <View
      style={{
        flex,
        backgroundColor: inverted ? (t.dark ? t.brand[900] : '#12172B') : t.softFill,
        borderRadius: t.radius.md,
        paddingVertical: 14,
        paddingHorizontal: 16,
      }}
    >
      <Text
        style={{
          fontFamily: t.font.medium,
          fontSize: 11,
          letterSpacing: 0.5,
          color: labelFg,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: t.font.displaySemi,
          fontSize: 24,
          letterSpacing: -0.7,
          color: fg,
          marginTop: 4,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
        {unit ? (
          <Text style={{ fontFamily: t.font.regular, fontSize: 13.5, color: labelFg }}>
            {' '}
            {unit}
          </Text>
        ) : null}
      </Text>
    </View>
  );
}

/** The tag above a plan title — "As prescribed", "Trimmed to fit". */
export function PlanTag({ label, tone }: { label: string; tone: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderRadius: t.radius.pill,
        backgroundColor: t.softFill,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone }} />
      <Body size={12.5} weight="medium">
        {label}
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  scaleLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
});
