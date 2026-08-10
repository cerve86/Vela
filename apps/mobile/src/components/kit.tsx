import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { painColor, painLabel } from '@coachapp/shared/tokens';
import { useTheme } from '@/theme';

export function Screen({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={{ flex: 1, backgroundColor: t.page }}>{children}</View>;
}

export function Card({
  title,
  right,
  children,
  style,
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  style?: object;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderRadius: t.radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.border,
          padding: t.space.lg,
        },
        style,
      ]}
    >
      {(title || right) && (
        <View style={styles.cardHeader}>
          {title && (
            <Text style={{ color: t.textPrimary, fontSize: 15, fontWeight: '600' }}>{title}</Text>
          )}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: 'good' | 'warning' | 'critical' | 'neutral' | 'brand';
  children: ReactNode;
}) {
  const t = useTheme();
  const color =
    tone === 'good'
      ? t.status.good
      : tone === 'warning'
        ? t.status.warning
        : tone === 'critical'
          ? t.status.critical
          : tone === 'brand'
            ? t.brand[600]
            : t.textMuted;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        alignSelf: 'flex-start',
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: t.radius.pill,
        backgroundColor: t.dark ? 'rgba(255,255,255,0.07)' : 'rgba(11,11,11,0.05)',
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      <Text style={{ color: t.textPrimary, fontSize: 12, fontWeight: '500' }}>{children}</Text>
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
        backgroundColor: primary ? t.brand[700] : 'transparent',
        borderWidth: primary ? 0 : StyleSheet.hairlineWidth,
        borderColor: t.border,
        borderRadius: t.radius.md,
        paddingVertical: 14,
        alignItems: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          color: primary ? '#fff' : t.textPrimary,
          fontSize: 16,
          fontWeight: '600',
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
 * the moment doesn't allow.
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
                aspectRatio: 0.82,
                borderRadius: t.radius.sm,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? painColor(i) : t.dark ? '#26292c' : '#f0f1f0',
              }}
            >
              <Text
                style={{
                  color: selected ? '#fff' : t.textSecondary,
                  fontWeight: selected ? '700' : '500',
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
        <Text style={{ color: t.textMuted, fontSize: 11 }}>No pain</Text>
        <Text style={{ color: t.textPrimary, fontSize: 12, fontWeight: '600' }}>
          {value === null ? 'Not recorded' : painLabel(value)}
        </Text>
        <Text style={{ color: t.textMuted, fontSize: 11 }}>Worst imaginable</Text>
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
          <Text style={{ color: t.textSecondary, fontSize: 12 }}>{it.label}</Text>
          <Text style={{ color: t.textPrimary, fontSize: 20, fontWeight: '600', marginTop: 2 }}>
            {it.value}
            {it.unit && (
              <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '400' }}> {it.unit}</Text>
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
        borderRadius: 4,
        overflow: 'hidden',
        backgroundColor: t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(11,11,11,0.06)',
      }}
    >
      <View
        style={{
          width: `${Math.max(0, Math.min(1, value)) * 100}%`,
          height: '100%',
          borderRadius: 4,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  scaleLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
});
