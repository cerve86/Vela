import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fuelForSession, type FuelCard } from '@vela/shared';
import { Body, Card, Display, Screen } from '@/components/kit';
import { FuelCardView, SessionFuel } from '@/components/fuelCard';
import { FuelCheckCard } from '@/components/fuelCheck';
import { useTheme } from '@/theme';
import { useSession } from '@/lib/session';
import { useFuelCards, useLuteal, useWeek, useWeightKg } from '@/lib/data';

/**
 * Fuel, without counting: today's card from the session, or the plate reminder on a day
 * without one, and the supplement cards her physio has published. No diary, no ring, no
 * numbers on the face — amounts sit behind a tap, and not at all for a client flagged for
 * restrictive patterns.
 */
export function FuelGuide() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { client } = useSession();
  const week = useWeek();
  const fuel = useFuelCards();
  const restrictive = client?.restrictivePattern === true;
  const weightKg = useWeightKg();
  const cycle = useLuteal();
  const luteal = cycle.luteal;

  useFocusEffect(
    useCallback(() => {
      fuel.reload();
      cycle.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const today = week.todaySession;
  // A day without a session: the plate card, the second-half-of-cycle cue when she is in it,
  // and the golden rule — amounts worked out (or taken off) as on a session day.
  const rest = fuelForSession(fuel.data, 'easy', { restrictive, weightKg, luteal, rest: true });
  const plate = rest.main;
  const supplements = fuel.data.filter((c) => c.kind === 'supplement' && c.published);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: insets.top + t.space.md,
          paddingBottom: 120,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Display size={28}>Fuel for today</Display>
        {today ? (
          <SessionFuel
            cards={fuel.data}
            session={today}
            restrictive={restrictive}
            weightKg={weightKg}
            luteal={luteal}
            bare
          />
        ) : (
          <>
            {plate && <FuelCardView card={plate} label="No session today · Build the plate" />}
            {rest.extras.map((c) => (
              <FuelCardView key={c.key} card={c} />
            ))}
          </>
        )}

        <FuelCheckCard />

        {supplements.length > 0 && (
          <>
            <Body
              size={11}
              weight="medium"
              color={t.textSecondary}
              style={{ letterSpacing: 0.5, marginTop: 8 }}
            >
              SUPPLEMENTS
            </Body>
            {supplements.map((s) => (
              <SupplementCard key={s.key} card={s} />
            ))}
            <Body size={12} color={t.textMuted}>
              No doses here on purpose: your physio sets any amount with you.
            </Body>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function SupplementCard({ card }: { card: FuelCard }) {
  const t = useTheme();
  const strong = card.evidence === 'strong';
  return (
    <Card style={{ borderRadius: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Body size={15} weight="semibold" style={{ flex: 1 }}>
          {card.title}
        </Body>
        {card.evidence && (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 999,
              backgroundColor: strong ? 'rgba(14,159,110,0.14)' : 'rgba(27,79,216,0.12)',
            }}
          >
            <Body size={11} weight="medium" color={strong ? t.status.good : t.brand[600]}>
              {strong ? 'Strong evidence' : 'Emerging evidence'}
            </Body>
          </View>
        )}
        {card.tag ? (
          <Body size={11.5} color={t.textSecondary}>
            {card.tag}
          </Body>
        ) : null}
      </View>
      {card.face.cue ? (
        <Body size={13.5} style={{ marginTop: 6, lineHeight: 19 }}>
          {card.face.cue}
        </Body>
      ) : null}
    </Card>
  );
}
