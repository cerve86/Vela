import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { X } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addPeriodStart,
  CYCLE_STATUS_LABEL,
  getCycleContext,
  hasCycleConsent,
  recordConsent,
  removePeriodStart,
  saveCycleStatus,
  withdrawCycleConsent,
  type CycleStatus,
} from '@vela/api';
import { cycleDay } from '@vela/shared';
import { Body, Button, Card, Display, Screen } from '@/components/kit';
import { ChoiceChips } from '@/components/scales';
import { useTheme } from '@/theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { today } from '@/lib/data';

/** Bump when the consent wording changes; a grant covers only the version she read. */
const CYCLE_POLICY_VERSION = '2026-10-25';

const STATUSES: CycleStatus[] = [
  'regular',
  'irregular',
  'perimenopause',
  'menopause',
  'not_currently',
];

const shift = (iso: string, by: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
};

const pretty = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

/**
 * Cycle and menopause context, shared with her physio only if she chooses.
 *
 * It is special-category health data, so it has its own consent, separate from the
 * health-data consent she gave at sign-up. It never changes a session: her physio reads
 * it beside her load and wellness, because effort can feel different across a cycle.
 * Stopping deletes everything recorded here.
 */
export default function CycleScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client } = useSession();
  const [loading, setLoading] = useState(true);
  const [consented, setConsented] = useState(false);
  const [status, setStatus] = useState<CycleStatus | null>(null);
  const [starts, setStarts] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    const [ok, ctx] = await Promise.all([
      hasCycleConsent(supabase, client.id),
      getCycleContext(supabase, client.id),
    ]);
    setConsented(ok);
    setStatus(ctx?.status ?? null);
    setStarts(ctx?.periodStarts ?? []);
    setLoading(false);
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<{ error: string | null }>) {
    setBusy(true);
    setError(null);
    const { error: e } = await fn();
    setBusy(false);
    if (e) setError('That did not save. Try again in a moment.');
    await load();
  }

  async function agree() {
    await run(() => recordConsent(supabase, ['cycle_context'], CYCLE_POLICY_VERSION));
  }

  function stop() {
    if (!client) return;
    Alert.alert(
      'Stop sharing?',
      'Your physio will no longer see your cycle context, and everything recorded here is deleted.',
      [
        { text: 'Keep sharing', style: 'cancel' },
        {
          text: 'Stop and delete',
          style: 'destructive',
          onPress: () => void run(() => withdrawCycleConsent(supabase, client.id)),
        },
      ],
    );
  }

  const now = today();
  const position = cycleDay(starts, now);
  const tracksPeriods =
    status === 'regular' || status === 'irregular' || status === 'perimenopause';

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          padding: t.space.lg,
          paddingTop: Math.min(insets.top, 12) + t.space.lg,
          paddingBottom: t.space.xxl,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Display size={28}>Your cycle</Display>
        <Body size={14} color={t.textSecondary} style={{ lineHeight: 20 }}>
          Optional. Effort can feel different across a cycle and around menopause, so your physio
          can read it beside your training. It never changes a session.
        </Body>

        {loading ? (
          <ActivityIndicator color={t.brand[600]} style={{ marginTop: 24 }} />
        ) : !consented ? (
          <>
            <Card style={{ borderRadius: 22 }}>
              <Body size={15} weight="medium">
                Sharing my cycle context
              </Body>
              <Body size={13.5} color={t.textSecondary} style={{ marginTop: 8, lineHeight: 20 }}>
                I agree that Vela may store whether I have periods, the days they start, or that I
                am in perimenopause or menopause, and share it with my physiotherapist as context
                for my training. I can stop at any time from this screen, which deletes it.
              </Body>
            </Card>
            {error && (
              <Body size={13} color={t.status.critical} style={{ textAlign: 'center' }}>
                {error}
              </Body>
            )}
            <Button
              label={busy ? 'Saving…' : 'I agree, share it'}
              disabled={busy}
              onPress={() => void agree()}
            />
            <Button label="Not now" variant="secondary" onPress={() => router.back()} />
          </>
        ) : (
          <>
            <Card style={{ borderRadius: 22 }}>
              <Body size={15} weight="medium">
                Which is closest?
              </Body>
              <View style={{ marginTop: 12 }}>
                <ChoiceChips
                  options={STATUSES.map((s) => ({ value: s, label: CYCLE_STATUS_LABEL[s] }))}
                  value={status}
                  onChange={(v) =>
                    client && void run(() => saveCycleStatus(supabase, client.id, v as CycleStatus))
                  }
                />
              </View>
            </Card>

            {tracksPeriods && client && (
              <Card style={{ borderRadius: 22 }}>
                <Body size={15} weight="medium">
                  {position ? `Day ${position.day}` : 'When did your last period start?'}
                </Body>
                {position && (
                  <Body size={13} color={t.textSecondary} style={{ marginTop: 4 }}>
                    Started {pretty(position.lastStart)}
                    {position.averageLength
                      ? ` · your cycles average ${position.averageLength} days`
                      : ''}
                  </Body>
                )}
                {position && (
                  <Body size={13} color={t.textSecondary} style={{ marginTop: 14 }}>
                    A new period started:
                  </Body>
                )}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: position ? 8 : 14 }}>
                  {[
                    ['Today', now],
                    ['Yesterday', shift(now, -1)],
                    ['2 days ago', shift(now, -2)],
                  ].map(([label, day]) => (
                    <View key={day} style={{ flex: 1 }}>
                      <Button
                        label={label!}
                        variant="secondary"
                        disabled={busy}
                        onPress={() => void run(() => addPeriodStart(supabase, client.id, day!))}
                      />
                    </View>
                  ))}
                </View>
                {starts.length > 0 && (
                  <View style={{ marginTop: 14, gap: 6 }}>
                    {starts.slice(0, 6).map((d) => (
                      <View key={d} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Body size={13.5} style={{ flex: 1 }}>
                          {pretty(d)}
                        </Body>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${pretty(d)}`}
                          hitSlop={10}
                          disabled={busy}
                          onPress={() => void run(() => removePeriodStart(supabase, client.id, d))}
                        >
                          <X size={16} color={t.textMuted} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            )}

            {error && (
              <Body size={13} color={t.status.critical} style={{ textAlign: 'center' }}>
                {error}
              </Body>
            )}
            <Button label="Done" onPress={() => router.back()} />
            <Button label="Stop sharing and delete" variant="secondary" onPress={stop} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
