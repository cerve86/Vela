import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Plus, Trash2 } from 'lucide-react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import type { MealSlotKey } from '@vela/shared';
import { Body } from '@/components/kit';
import { Tap } from '@/components/motion';
import { useTheme } from '@/theme';

/**
 * Fuel's pieces.
 *
 * The four meal slots are the organising idea and they are independent by design: each
 * owns its colour, glyph, entries and its own call to action. The alternative — one "daily
 * log" form with a meal dropdown — is the same data and a worse instrument, because it
 * cannot show at a glance that lunch never got logged.
 */

const SETTLE = Easing.bezier(0.2, 0.8, 0.25, 1);

/* ─────────────────────────────────────────────────────────────
 * Macro bars
 * ───────────────────────────────────────────────────────────── */

/**
 * One macro against its target.
 *
 * The bar fills over 600ms on the UI thread. It is capped at 100% width while the readout
 * keeps counting past the target, because a bar that overflows its track reads as a layout
 * bug, and going over a protein target is not an error worth drawing as one.
 */
export function MacroBar({
  label,
  value,
  target,
  unit,
  color,
}: {
  label: string;
  value: number;
  target: number | null;
  unit: string;
  color: string;
}) {
  const t = useTheme();
  const p = useSharedValue(0);
  const ratio = target ? Math.min(1, value / target) : 0;

  useEffect(() => {
    p.value = withTiming(ratio, { duration: 600, easing: SETTLE });
    return () => cancelAnimation(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio]);

  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Body size={13.5} color={t.textSecondary}>
          {label}
        </Body>
        <Text
          style={{
            fontFamily: t.font.medium,
            fontSize: 13.5,
            color: t.textPrimary,
            fontVariant: ['tabular-nums'],
          }}
        >
          {Math.round(value)}
          {target ? ` / ${Math.round(target)}` : ''} {unit}
        </Text>
      </View>
      <View
        style={{
          height: 8,
          borderRadius: t.radius.pill,
          backgroundColor: t.softFill,
          overflow: 'hidden',
        }}
      >
        <Animated.View style={[{ height: '100%', backgroundColor: color }, fill]} />
      </View>
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Slot picker
 * ───────────────────────────────────────────────────────────── */

/** The four slots as a row of chips. Each carries its own glyph and colour. */
export function SlotPicker({
  value,
  onChange,
}: {
  value: MealSlotKey;
  onChange: (slot: MealSlotKey) => void;
}) {
  const t = useTheme();

  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {t.mealSlots.map((slot) => {
        const on = slot.key === value;
        return (
          <Tap
            key={slot.key}
            onPress={() => onChange(slot.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={slot.label}
            scale={0.97}
            style={{
              flex: 1,
              borderRadius: 14,
              paddingVertical: 9,
              paddingHorizontal: 4,
              alignItems: 'center',
              gap: 5,
              backgroundColor: on ? (t.dark ? withAlpha(slot.color, 0.16) : slot.tint) : t.surface,
              borderWidth: 1.5,
              borderColor: on ? slot.color : t.border,
            }}
          >
            <SlotGlyph slot={slot.key} size={17} on={on} />
            <Body size={11} weight="medium" color={on ? t.textPrimary : t.textSecondary}>
              {slot.label}
            </Body>
          </Tap>
        );
      })}
    </View>
  );
}

/** A meal slot's glyph, on the Lucide grid so it sits beside the rest of the set. */
export function SlotGlyph({
  slot,
  size = 18,
  on = true,
}: {
  slot: MealSlotKey;
  size?: number;
  on?: boolean;
}) {
  const t = useTheme();
  const spec = t.mealSlots.find((s) => s.key === slot);
  if (!spec) return null;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {spec.paths.map((d) => (
        <Path
          key={d}
          d={d}
          stroke={on ? spec.color : t.textMuted}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

/* ─────────────────────────────────────────────────────────────
 * Quick add
 * ───────────────────────────────────────────────────────────── */

/** A known food at its typical portion — one tap, no stepper. */
export function QuickFoodRow({
  name,
  portion,
  kcal,
  accent,
  onAdd,
}: {
  name: string;
  portion: string;
  kcal: number;
  accent: string;
  onAdd: () => void;
}) {
  const t = useTheme();
  return (
    <Tap
      onPress={onAdd}
      scale={0.98}
      accessibilityLabel={`Add ${name}, ${portion}, ${kcal} kilocalories`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
        backgroundColor: t.softFill,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: t.radius.md,
        paddingVertical: 11,
        paddingHorizontal: 13,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body size={13.5} weight="medium" numberOfLines={1}>
          {name}
        </Body>
        <Body size={11} color={t.textSecondary} numberOfLines={1}>
          {portion}
        </Body>
      </View>
      <Text
        style={{
          fontFamily: t.font.medium,
          fontSize: 12.5,
          color: t.textPrimary,
          fontVariant: ['tabular-nums'],
        }}
      >
        {Math.round(kcal)}
      </Text>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          backgroundColor: accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Plus size={13} color="#FFFFFF" strokeWidth={3} />
      </View>
    </Tap>
  );
}

/* ─────────────────────────────────────────────────────────────
 * A slot's logged entries
 * ───────────────────────────────────────────────────────────── */

export interface SlotEntry {
  id: string;
  description: string;
  kcal: number;
  detail: string;
}

/**
 * One slot: its glyph, total, entries, and its own call to action.
 *
 * The CTA changes wording once something is logged — "Add breakfast" becomes "Add more" —
 * because the first is an instruction and the second is an offer, and after the first entry
 * the instruction has been followed.
 */
export function SlotSection({
  slot,
  entries,
  onAdd,
  onDelete,
  softenedCta,
}: {
  slot: MealSlotKey;
  entries: SlotEntry[];
  onAdd: () => void;
  onDelete: (id: string) => void;
  /** Replaces the CTA when a blocking symptom is active. */
  softenedCta?: string;
}) {
  const t = useTheme();
  const spec = t.mealSlots.find((s) => s.key === slot)!;
  const total = entries.reduce((n, e) => n + e.kcal, 0);

  return (
    <View
      style={{
        backgroundColor: t.surface,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 22,
        padding: 18,
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            backgroundColor: t.dark ? withAlpha(spec.color, 0.16) : spec.tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SlotGlyph slot={slot} size={17} />
        </View>
        <Body size={13.5} weight="medium" style={{ flex: 1 }}>
          {spec.label}
        </Body>
        {entries.length > 0 && (
          <Text
            style={{
              fontFamily: t.font.medium,
              fontSize: 12.5,
              color: t.textSecondary,
              fontVariant: ['tabular-nums'],
            }}
          >
            {Math.round(total)} kcal
          </Text>
        )}
      </View>

      {entries.length > 0 && (
        <View style={{ gap: 7 }}>
          {entries.map((e) => (
            <View
              key={e.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 11,
                backgroundColor: t.softFill,
                borderRadius: t.radius.md,
                paddingVertical: 11,
                paddingHorizontal: 13,
              }}
            >
              <View
                style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: spec.color }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Body size={13.5} weight="medium" numberOfLines={1}>
                  {e.description}
                </Body>
                <Body size={11} color={t.textSecondary} numberOfLines={1}>
                  {e.detail}
                </Body>
              </View>
              <Text
                style={{
                  fontFamily: t.font.medium,
                  fontSize: 12.5,
                  color: t.textPrimary,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {Math.round(e.kcal)}
              </Text>
              <Tap
                onPress={() => onDelete(e.id)}
                accessibilityLabel={`Remove ${e.description}`}
                style={{ padding: 4 }}
              >
                <Trash2 size={15} color={t.textMuted} strokeWidth={2} />
              </Tap>
            </View>
          ))}
        </View>
      )}

      <Tap
        onPress={onAdd}
        disabled={Boolean(softenedCta)}
        scale={0.97}
        style={{
          borderRadius: t.radius.md,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: softenedCta ? t.border : withAlpha(spec.color, 0.45),
          paddingVertical: 13,
          alignItems: 'center',
        }}
      >
        <Body size={13.5} weight="medium" color={softenedCta ? t.textMuted : spec.color}>
          {softenedCta ?? (entries.length ? 'Add more' : `Add ${spec.label.toLowerCase()}`)}
        </Body>
      </Tap>
    </View>
  );
}

/** Hex + alpha -> rgba(). Slot colours are fixed hexes, so no parsing edge cases arise. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  return `rgba(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)}, ${alpha})`;
}
