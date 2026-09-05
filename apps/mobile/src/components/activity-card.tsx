import { Text, View } from 'react-native';
import type { Activity } from '@vela/api';
import {
  formatDistance,
  formatDuration,
  formatPace,
  paceSecPerKm,
  sportWords,
  stepsPerMinute,
} from '@vela/shared';
import { Body, Card } from '@/components/kit';
import { useTheme } from '@/theme';

const STRAVA_ORANGE = '#FC4C02';

/**
 * One recorded activity, as a card.
 *
 * What a runner wants to see first — distance, pace, time — is big; what a
 * physiotherapist wants to see — heart rate, cadence, power, climb — is the second row.
 * Cadence is in steps per minute (both feet), which is the number she counts, not the
 * one Strava stores. A missing figure is missing, never zero.
 */
export function ActivityCard({ activity, note }: { activity: Activity; note?: string }) {
  const t = useTheme();
  const pace = formatPace(paceSecPerKm(activity.distanceM, activity.movingSec));
  const spm = stepsPerMinute(activity.sportType, activity.avgCadence);

  const headline: { label: string; value: string; unit?: string }[] = [
    ...(activity.distanceM !== null
      ? [
          {
            label: 'DISTANCE',
            value: formatDistance(activity.distanceM)!.replace(/ km| m/, ''),
            unit: activity.distanceM >= 1000 ? 'km' : 'm',
          },
        ]
      : []),
    ...(pace ? [{ label: 'PACE', value: pace.replace(' /km', ''), unit: '/km' }] : []),
    {
      label: 'TIME',
      value: formatDuration(activity.movingSec).replace(' min', ''),
      unit: activity.movingSec < 3600 ? 'min' : '',
    },
  ];

  const detail: { label: string; value: string }[] = [
    ...(activity.avgHr !== null
      ? [{ label: 'Avg HR', value: `${Math.round(activity.avgHr)} bpm` }]
      : []),
    ...(spm !== null ? [{ label: 'Cadence', value: `${spm} spm` }] : []),
    ...(activity.avgWatts !== null
      ? [{ label: 'Power', value: `${Math.round(activity.avgWatts)} W` }]
      : []),
    ...(activity.elevationGainM !== null && activity.elevationGainM >= 5
      ? [{ label: 'Climb', value: `${Math.round(activity.elevationGainM)} m` }]
      : []),
    ...(activity.maxHr !== null
      ? [{ label: 'Max HR', value: `${Math.round(activity.maxHr)} bpm` }]
      : []),
  ].slice(0, 4);

  return (
    <Card style={{ borderRadius: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STRAVA_ORANGE }} />
        <Body
          size={11}
          weight="medium"
          color={t.textSecondary}
          style={{ letterSpacing: 0.5, flex: 1 }}
        >
          {sportWords(activity.sportType).toUpperCase()} · VIA STRAVA
        </Body>
        <Body size={12} color={t.textMuted}>
          {whenWords(activity.localDate)}
        </Body>
      </View>

      <Text
        style={{
          fontFamily: t.font.displaySemi,
          fontSize: 20,
          letterSpacing: -0.4,
          color: t.textPrimary,
          marginTop: 10,
        }}
        numberOfLines={2}
      >
        {activity.name}
      </Text>
      {note && (
        <Body size={13} color={t.textSecondary} style={{ marginTop: 4 }}>
          {note}
        </Body>
      )}

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {headline.map((h) => (
          <View
            key={h.label}
            style={{
              flex: 1,
              backgroundColor: t.softFill,
              borderRadius: t.radius.md,
              paddingVertical: 12,
              paddingHorizontal: 14,
            }}
          >
            <Text
              style={{
                fontFamily: t.font.medium,
                fontSize: 11,
                letterSpacing: 0.5,
                color: t.textSecondary,
              }}
            >
              {h.label}
            </Text>
            <Text
              style={{
                fontFamily: t.font.displaySemi,
                fontSize: 22,
                letterSpacing: -0.5,
                color: t.textPrimary,
                marginTop: 2,
              }}
            >
              {h.value}
              {h.unit ? (
                <Text style={{ fontFamily: t.font.medium, fontSize: 12, color: t.textMuted }}>
                  {' '}
                  {h.unit}
                </Text>
              ) : null}
            </Text>
          </View>
        ))}
      </View>

      {detail.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, rowGap: 8 }}>
          {detail.map((d) => (
            <View key={d.label} style={{ width: '50%' }}>
              <Body size={12} color={t.textSecondary}>
                {d.label}
              </Body>
              <Body size={15} weight="medium">
                {d.value}
              </Body>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function whenWords(localDate: string): string {
  const now = new Date();
  const todayIso = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  if (localDate === todayIso) return 'Today';
  const days = Math.round(
    (new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(`${localDate}T00:00:00Z`).getTime()) /
      86_400_000,
  );
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(`${localDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}
