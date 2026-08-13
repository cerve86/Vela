import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { METRIC_META, type MetricType } from '@vela/api';
import { adherenceBand, adherenceStyle, painColor } from '@vela/shared';
import { Body, Card, Display, Pill, ProgressBar, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { latestOf, useMetrics, useUpcoming, useWeek, weekAdherence } from '@/lib/data';

const SHOWN: MetricType[] = ['weight_kg', 'resting_hr', 'hrv_ms', 'steps'];

export default function ProgressScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const week = useWeek();
  const upcoming = useUpcoming(20);
  const metrics = useMetrics(SHOWN, 90);

  const adherence = weekAdherence(week.data);
  const band = adherenceBand(adherence.ratio);

  const completed = week.data.filter((s) => s.status === 'completed');
  const painScores = completed.length;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: insets.top + t.space.md,
          paddingBottom: t.space.xxl * 2,
          gap: t.space.md,
        }}
      >
        <Display size={30}>Progress</Display>

        <Card title="This week">
          <View style={{ gap: t.space.lg }}>
            <View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Body size={13} color={t.textSecondary}>Adherence</Body>
                <Body size={13} weight="semibold">
                  {adherence.completed} of {adherence.due || week.data.length}
                </Body>
              </View>
              <ProgressBar value={adherence.ratio} color={adherenceStyle[band].color} />
            </View>
            <Pill tone={band === 'good' ? 'good' : band === 'watch' ? 'warning' : 'critical'}>
              {adherenceStyle[band].label}
            </Pill>
          </View>
        </Card>

        <Card title="Vitals">
          {metrics.loading ? (
            <ActivityIndicator color={t.brand[600]} />
          ) : metrics.data.length === 0 ? (
            <Body size={13} color={t.textSecondary}>
              No readings yet. Connect Apple Health from the Today tab.
            </Body>
          ) : (
            <View style={{ gap: t.space.md }}>
              {SHOWN.map((type) => {
                const m = latestOf(metrics.data, type);
                const meta = METRIC_META[type];
                return (
                  <View
                    key={type}
                    style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <View>
                      <Body size={15}>{meta.label}</Body>
                      <Body size={12} color={t.textMuted}>
                        {m ? (m.source === 'healthkit' ? 'Apple Health' : 'Entered manually') : 'No data'}
                      </Body>
                    </View>
                    <Text
                      style={{
                        fontFamily: t.font.displaySemi,
                        fontSize: 18,
                        color: t.textPrimary,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {m ? m.value.toFixed(meta.decimals) : '—'}
                      <Text style={{ fontFamily: t.font.regular, fontSize: 12, color: t.textMuted }}>
                        {meta.unit ? ` ${meta.unit}` : ''}
                      </Text>
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        <Card title="Recent sessions">
          {week.loading ? (
            <ActivityIndicator color={t.brand[600]} />
          ) : completed.length === 0 ? (
            <Body size={13} color={t.textSecondary}>
              Nothing logged this week yet.
            </Body>
          ) : (
            <View style={{ gap: t.space.md }}>
              {completed.map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.md }}>
                  <View
                    style={{ width: 6, height: 34, borderRadius: 3, backgroundColor: painColor(2) }}
                  />
                  <View style={{ flex: 1 }}>
                    <Body size={15}>{s.title}</Body>
                    <Body size={12} color={t.textMuted}>{s.scheduledDate}</Body>
                  </View>
                  <Pill tone="good">Done</Pill>
                </View>
              ))}
            </View>
          )}
          <Body size={12} color={t.textMuted} style={{ marginTop: t.space.md }}>
            {painScores > 0
              ? 'Pain trends and volume charts arrive with set-by-set logging in Phase 3.'
              : ''}
          </Body>
        </Card>

        <Card title="Scheduled ahead">
          {upcoming.data.length === 0 ? (
            <Body size={13} color={t.textSecondary}>Nothing scheduled.</Body>
          ) : (
            <View style={{ gap: 8 }}>
              {upcoming.data.slice(0, 8).map((s) => (
                <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Body size={14}>{s.title}</Body>
                  <Body size={13} color={t.textSecondary}>{s.scheduledDate}</Body>
                </View>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}
