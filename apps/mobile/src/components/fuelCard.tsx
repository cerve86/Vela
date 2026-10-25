import { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  FUEL_LINES,
  FUEL_TYPE_LABEL,
  fuelForSession,
  fuelTypeFor,
  type FuelCard,
  type FuelLines,
  type FuelType,
} from '@vela/shared';
import { Body, Card } from '@/components/kit';
import { useTheme } from '@/theme';

const LINE_LABEL: Record<keyof FuelLines, string> = {
  before: 'Before',
  during: 'During',
  after: 'After',
  cue: '',
};

/** One card: plain lines on the face, amounts and the why behind a tap. */
export function FuelCardView({ card, label }: { card: FuelCard; label?: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  // In reading order: a card she saved comes back from the database with its keys sorted.
  const keys = FUEL_LINES.filter((k) => card.face[k]);
  const detail = keys.filter((k) => card.detail[k]);
  const more = detail.length > 0 || !!card.why;
  return (
    <Card style={{ borderRadius: 22 }}>
      <Body size={11} weight="medium" color={t.textSecondary} style={{ letterSpacing: 0.5 }}>
        {(label ?? card.title).toUpperCase()}
      </Body>
      <View style={{ marginTop: 10, gap: 6 }}>
        {keys.map((k) => (
          <View key={k} style={{ flexDirection: 'row', gap: 8 }}>
            {LINE_LABEL[k] ? (
              <Body size={13} weight="medium" style={{ width: 58 }}>
                {LINE_LABEL[k]}
              </Body>
            ) : null}
            <Body size={14} style={{ flex: 1, lineHeight: 20 }}>
              {card.face[k]}
            </Body>
          </View>
        ))}
      </View>
      {more && (
        <Pressable
          onPress={() => setOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          hitSlop={8}
          style={{ marginTop: 10 }}
        >
          <Body size={12.5} weight="medium" color={t.brand[600]}>
            {open ? 'Less' : detail.length ? 'Amounts and why' : 'Why'}
          </Body>
        </Pressable>
      )}
      {open && (
        <View style={{ marginTop: 6, gap: 4 }}>
          {detail.map((k) => (
            <Body key={k} size={12.5} color={t.textSecondary} style={{ lineHeight: 18 }}>
              {LINE_LABEL[k] ? `${LINE_LABEL[k]}: ` : ''}
              {card.detail[k]}
            </Body>
          ))}
          {card.why ? (
            <Body size={12.5} style={{ lineHeight: 18 }}>
              {card.why}
            </Body>
          ) : null}
        </View>
      )}
    </Card>
  );
}

/**
 * Fuel for today, for one session: the card its type picks (the plate reminder on an easy
 * day), and on a long run the heat and pre-dawn cues. The client never picks.
 */
export function SessionFuel({
  cards,
  session,
  restrictive,
  weightKg = null,
  bare = false,
}: {
  /** On the Fuel screen itself, where "Fuel for today" is already the title. */
  bare?: boolean;
  cards: FuelCard[];
  session: {
    discipline: string;
    title: string;
    dayNotes?: string | null;
    fuelType?: FuelType | null;
  };
  restrictive: boolean;
  /** Her latest weight, so per-kg amounts read in grams for her. */
  weightKg?: number | null;
}) {
  const type = fuelTypeFor({
    discipline: session.discipline,
    title: session.title,
    notes: session.dayNotes,
    override: session.fuelType,
  });
  const f = fuelForSession(cards, type, { restrictive, weightKg });
  if (!f.main && f.extras.length === 0) return null;
  return (
    <>
      {f.main && (
        <FuelCardView
          card={f.main}
          label={
            f.main.kind === 'session'
              ? bare
                ? FUEL_TYPE_LABEL[type]
                : `Fuel for today · ${FUEL_TYPE_LABEL[type]}`
              : undefined
          }
        />
      )}
      {f.extras.map((c) => (
        <FuelCardView key={c.key} card={c} />
      ))}
    </>
  );
}
