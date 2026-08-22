import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { METRIC_META, type MetricType } from '@vela/api';
import { Body, Button, Card, Display, Pill, Screen } from '@/components/kit';
import { useTheme } from '@/theme';
import { READ_PERMISSION_LABELS, isHealthAvailable, requestHealthAccess, syncHealth } from '@/lib/health';
import { latestOf, useMetrics } from '@/lib/data';

const SHOWN: MetricType[] = ['weight_kg', 'resting_hr', 'hrv_ms', 'steps', 'vo2max'];

/**
 * Apple Health connection and sync.
 *
 * The permission list is spelled out in plain words before we ask. Apple's own sheet is
 * the legal gate, but a client deciding whether to share her health data deserves to
 * know what we want and why in our words first.
 */
export default function HealthScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const metrics = useMetrics(SHOWN, 90);

  useEffect(() => {
    isHealthAvailable().then(setAvailable);
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    setResult(null);

    const { granted, error: authError } = await requestHealthAccess();
    if (authError) {
      setError(authError);
      setBusy(false);
      return;
    }
    if (!granted) {
      setError('Apple Health access was not granted. You can change this in Settings → Health.');
      setBusy(false);
      return;
    }

    const { written, scanned, error: syncError } = await syncHealth(30);
    if (syncError) setError(syncError);
    else {
      // Two numbers because they answer different questions: `scanned` is how much Apple
      // Health held, `written` is how many days that condensed into. Reporting only the
      // first made a successful sync of one day look like thousands of readings.
      setResult(
        written === 0
          ? `Checked ${scanned} readings — nothing to import yet.`
          : `Imported ${written} day${written === 1 ? '' : 's'} of readings from ${scanned} samples.`,
      );
      metrics.reload();
    }
    setBusy(false);
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: insets.top + t.space.xl,
          paddingBottom: t.space.xxl,
          gap: t.space.md,
        }}
      >
        <Display size={30}>Apple Health</Display>
        <Body size={14} color={t.textSecondary} style={{ lineHeight: 20 }}>
          Vela reads a few measurements so your physio can see how training is landing
          against your sleep, resting heart rate and weight. It never writes to Apple
          Health, and it never reads anything not listed here.
        </Body>

        <Card title="What Vela reads">
          <View style={{ gap: 8 }}>
            {READ_PERMISSION_LABELS.map((label) => (
              <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.brand[500] }}
                />
                <Body size={14}>{label}</Body>
              </View>
            ))}
          </View>
          <Body size={12} color={t.textMuted} style={{ marginTop: t.space.lg, lineHeight: 17 }}>
            Read-only. You can revoke any of this at any time in Settings → Health → Data
            Access, and delete everything Vela holds from your profile.
          </Body>
        </Card>

        {available === false && (
          <Card>
            <Pill tone="warning">Not available here</Pill>
            <Body size={13} color={t.textSecondary} style={{ marginTop: t.space.md, lineHeight: 19 }}>
              Apple Health isn&apos;t available on this device. On the Simulator that is
              expected — the connection needs a real iPhone.
            </Body>
          </Card>
        )}

        {error && (
          <Card>
            <Body size={13} color={t.status.critical}>
              {error}
            </Body>
          </Card>
        )}
        {result && (
          <Card>
            <Body size={13} style={{ color: t.status.good }}>
              {result}
            </Body>
          </Card>
        )}

        <Button
          label={busy ? 'Syncing…' : available === false ? 'Apple Health unavailable' : 'Connect and sync'}
          disabled={busy || available === false}
          onPress={connect}
        />

        <Card title="Latest readings">
          {metrics.loading ? (
            <ActivityIndicator color={t.brand[600]} />
          ) : metrics.data.length === 0 ? (
            <Body size={13} color={t.textSecondary}>
              Nothing yet. Once connected, your readings appear here and on your
              physio&apos;s dashboard.
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
                        {m
                          ? m.source === 'healthkit'
                            ? 'Apple Health'
                            : m.source === 'manual'
                              ? 'Entered manually'
                              : 'Recorded by your physio'
                          : 'No data'}
                      </Body>
                    </View>
                    <Body size={18} weight="semibold">
                      {m ? m.value.toFixed(meta.decimals) : '—'}
                      {meta.unit ? ` ${meta.unit}` : ''}
                    </Body>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  );
}
