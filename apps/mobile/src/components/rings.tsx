import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Plus } from 'lucide-react-native';
import { useTheme } from '@/theme';

/**
 * One of the three rings under the mascot: a ring for how far along the thing is, the
 * thing's icon inside, a "+" to go and do it, and one line of words underneath.
 *
 * The ring is a 270° arc open at the bottom, where the "+" sits, so the button reads as
 * part of the ring rather than a badge stuck on it. Words carry the state: a full ring with
 * "Done" and an empty one with "Not logged" are the same shape in a screenshot, and the
 * word is what tells them apart.
 */
export function RingStat({
  value,
  color,
  icon,
  label,
  onPress,
  onAdd,
  addLabel,
}: {
  /** 0–1, or null for "nothing to measure yet". */
  value: number | null;
  color: string;
  icon: ReactNode;
  label: string;
  onPress: () => void;
  onAdd: () => void;
  addLabel: string;
}) {
  const t = useTheme();
  const size = 84;
  const stroke = 6;
  const r = size / 2 - stroke;
  const cx = size / 2;
  const cy = size / 2;
  const start = 135;
  const sweep = 270;
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));

  const point = (deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const arc = (from: number, to: number) => {
    const a = point(from);
    const b = point(to);
    return `M ${a.x} ${a.y} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
  };

  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      >
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={size} height={size} style={{ position: 'absolute' }}>
            <Path
              d={arc(start, start + sweep)}
              stroke={t.dark ? 'rgba(255,255,255,0.10)' : 'rgba(18,23,43,0.08)'}
              strokeWidth={stroke}
              strokeLinecap="round"
              fill="none"
            />
            {v > 0.01 && (
              <Path
                d={arc(start, start + sweep * v)}
                stroke={color}
                strokeWidth={stroke}
                strokeLinecap="round"
                fill="none"
              />
            )}
          </Svg>
          {icon}
        </View>
      </Pressable>
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        accessibilityLabel={addLabel}
        hitSlop={8}
        style={({ pressed }) => ({
          marginTop: -16,
          width: 30,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: t.dark ? '#2A3350' : '#12172B',
          borderWidth: 3,
          borderColor: t.bandFill,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Plus size={16} color="#FFFFFF" strokeWidth={2.6} />
      </Pressable>
      <Text
        numberOfLines={1}
        style={{
          marginTop: 8,
          fontFamily: t.font.medium,
          fontSize: 12.5,
          color: t.textSecondary,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </View>
  );
}
