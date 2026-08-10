import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { METRIC_META, TODAY, daysBetween, sessionsByClient, volumeLoad, setLogsByClient } from '@coachapp/shared';
import { painColor } from '@coachapp/shared/tokens';
import { Card, Pill, Screen, StatRow } from '@/components/kit';
import { useTheme } from '@/theme';
import { CURRENT_CLIENT_ID, latestMetricValue, myRollup } from '@/lib/today';

export default function ProgressScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();

  const sessions = (sessionsByClient.get(CURRENT_CLIENT_ID) ?? [])
    .filter((s) => s.status === 'completed')
    .slice(-8)
    .reverse();
  const logs = setLogsByClient.get(CURRENT_CLIENT_ID) ?? [];

  const weight = latestMetricValue('weight_kg');
  const hr = latestMetricValue('resting_hr');
  const sleep = latestMetricValue('sleep_min');

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: insets.top + t.space.md,
          paddingBottom: t.space.xxl,
          gap: t.space.md,
        }}
      >
        <Text style={{ color: t.textPrimary, fontSize: 28, fontWeight: '700' }}>Progress</Text>

        <Card title="Last 7 days">
          <StatRow
            items={[
              {
                label: 'Adherence',
                value: `${Math.round(myRollup.adherence7d * 100)}%`,
              },
              {
                label: 'Volume',
                value: (myRollup.volumeLoad7d / 1000).toFixed(1),
                unit: 't',
              },
              {
                label: 'Avg pain',
                value: myRollup.avgPain7d === null ? '—' : String(myRollup.avgPain7d),
                unit: myRollup.avgPain7d === null ? undefined : '/10',
              },
            ]}
          />
          <View style={{ marginTop: t.space.lg }}>
            <Pill tone={myRollup.painTrend === 'improving' ? 'good' : 'neutral'}>
              Pain trend {myRollup.painTrend}
            </Pill>
          </View>
        </Card>

        <Card title="Vitals from Apple Health">
          <View style={{ gap: t.space.md }}>
            {[
              { m: weight, type: 'weight_kg' as const },
              { m: hr, type: 'resting_hr' as const },
              { m: sleep, type: 'sleep_min' as const },
            ].map(({ m, type }) => {
              const meta = METRIC_META[type];
              return (
                <View
                  key={type}
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <View>
                    <Text style={{ color: t.textPrimary, fontSize: 15 }}>{meta.label}</Text>
                    <Text style={{ color: t.textMuted, fontSize: 12 }}>
                      {m
                        ? m.source === 'healthkit'
                          ? 'Apple Health'
                          : 'Entered manually'
                        : 'No data'}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: t.textPrimary,
                      fontSize: 18,
                      fontWeight: '600',
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {m ? m.value.toFixed(meta.decimals) : '—'}
                    <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: '400' }}>
                      {' '}
                      {meta.unit}
                    </Text>
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>

        <Card title="Recent sessions">
          <View style={{ gap: t.space.md }}>
            {sessions.map((s) => {
              const sl = logs.filter((l) => l.sessionId === s.id);
              return (
                <View
                  key={s.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}
                >
                  <View
                    style={{
                      width: 6,
                      height: 34,
                      borderRadius: 3,
                      backgroundColor:
                        s.painAfter === null ? t.textMuted : painColor(s.painAfter),
                    }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.textPrimary, fontSize: 15 }}>{s.title}</Text>
                    <Text style={{ color: t.textMuted, fontSize: 12 }}>
                      {daysBetween(s.scheduledDate, TODAY)} days ago ·{' '}
                      {Math.round(volumeLoad(sl)).toLocaleString('en-GB')} kg
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: t.textSecondary,
                      fontSize: 14,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {s.painAfter === null ? '—' : `${s.painAfter}/10`}
                  </Text>
                </View>
              );
            })}
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
