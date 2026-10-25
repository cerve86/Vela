import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import {
  FUEL_ENOUGH_LABEL,
  FUEL_FOLLOWED_LABEL,
  FUEL_GUT_LABEL,
  summariseFuelChecks,
} from '@vela/shared';
import { Body, Card } from '@/components/kit';
import { useTheme } from '@/theme';
import { useHistory } from '@/lib/data';

const day = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

/**
 * How her fuelling went, from the check after each fuelled session: the last four weeks in
 * two counts — fuelled as planned, felt about right — and her latest answers. In words,
 * never a score, and nothing about amounts.
 */
export function FuelCheckCard() {
  const t = useTheme();
  const history = useHistory(4);

  useFocusEffect(
    useCallback(() => {
      history.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const checked = history.data
    .filter((s) => s.fuelCheck)
    .sort((a, b) => b.scheduledDate.localeCompare(a.scheduledDate));
  const sum = summariseFuelChecks(checked.map((s) => s.fuelCheck!));

  return (
    <Card style={{ borderRadius: 22 }}>
      <Body size={11} weight="medium" color={t.textSecondary} style={{ letterSpacing: 0.5 }}>
        HOW YOUR FUELLING WENT · 4 WEEKS
      </Body>
      {sum.answered === 0 ? (
        <Body size={13.5} color={t.textSecondary} style={{ marginTop: 8, lineHeight: 19 }}>
          After a long run, a quality session or a strength day, Vela asks how your fuelling went.
          Your answers show here, and your physio sees them too.
        </Body>
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
            <Stat value={`${sum.followed} of ${sum.answered}`} caption="fuelled as planned" />
            <Stat value={`${sum.right} of ${sum.answered}`} caption="felt about right" />
          </View>
          {(sum.short > 0 || sum.gut > 0) && (
            <Body size={12.5} color={t.textSecondary} style={{ marginTop: 10, lineHeight: 18 }}>
              {sentence([
                sum.short > 0 ? `ran short ${times(sum.short)}` : null,
                sum.gut > 0 ? `stomach trouble ${times(sum.gut)}` : null,
              ])}
              . Worth a word with your physio.
            </Body>
          )}
          <View style={{ marginTop: 12, gap: 8 }}>
            {checked.slice(0, 4).map((s) => {
              const c = s.fuelCheck!;
              return (
                <View key={s.id} style={{ flexDirection: 'row', gap: 10 }}>
                  <Body size={12.5} color={t.textMuted} style={{ width: 82 }}>
                    {day(s.scheduledDate)}
                  </Body>
                  <View style={{ flex: 1 }}>
                    <Body size={13} weight="medium" numberOfLines={1}>
                      {s.title}
                    </Body>
                    <Body size={12.5} color={t.textSecondary}>
                      {[
                        c.followed ? `As planned: ${FUEL_FOLLOWED_LABEL[c.followed]}` : null,
                        c.enough ? FUEL_ENOUGH_LABEL[c.enough] : null,
                        c.gut ? `Stomach: ${FUEL_GUT_LABEL[c.gut]?.toLowerCase()}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Body>
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
    </Card>
  );
}

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

function sentence(parts: (string | null)[]) {
  const s = parts.filter(Boolean).join(' · ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Stat({ value, caption }: { value: string; caption: string }) {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        padding: 12,
        borderRadius: 16,
        backgroundColor: t.brand[50],
      }}
    >
      <Body size={18} weight="semibold">
        {value}
      </Body>
      <Body size={12} color={t.textSecondary} style={{ marginTop: 2 }}>
        {caption}
      </Body>
    </View>
  );
}
