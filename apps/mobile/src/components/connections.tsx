import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import { Body, Button, Card } from '@/components/kit';
import { useTheme } from '@/theme';
import {
  connectStrava,
  disconnectStrava,
  subscribeInAppleCalendar,
  subscribeInGoogleCalendar,
  stravaReturnMessage,
  syncStrava,
  useCalendarLinks,
  useStravaLink,
} from '@/lib/integrations';

const STRAVA_ORANGE = '#FC4C02';

/**
 * Where her training meets the rest of her phone.
 *
 * Strava: the button is orange and says "Connect with Strava" because Strava's brand
 * guidelines ask for exactly that. Calendar: two doors, because the two calendars open
 * differently — Apple subscribes from a webcal link on the spot, Google wants its own
 * add-by-URL page. Both get the same feed, with every session's exercises in the notes
 * and a link that marks the session done.
 */
export function ConnectionsCard() {
  const t = useTheme();
  const strava = useStravaLink();
  const calendar = useCalendarLinks();
  const [busy, setBusy] = useState<'connect' | 'sync' | 'disconnect' | null>(null);
  const router = useRouter();
  const params = useLocalSearchParams<{ strava?: string }>();

  // Back from Strava: say what happened, refresh the card, and clear the param so a
  // re-render does not say it twice.
  useEffect(() => {
    const message = stravaReturnMessage(params.strava);
    if (!message) return;
    void strava.reload();
    Alert.alert(message.title, message.body);
    router.setParams({ strava: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.strava]);

  async function onConnect() {
    setBusy('connect');
    const res = await connectStrava();
    setBusy(null);
    if (!res.ok) Alert.alert('Strava', res.error);
    // Otherwise Strava is now open in the browser; the deep link back lands on Profile,
    // which reads the outcome from its route params and reloads this card.
  }

  async function onSync() {
    setBusy('sync');
    const res = await syncStrava();
    setBusy(null);
    await strava.reload();
    if (res.error) Alert.alert('Could not sync', res.error);
    else
      Alert.alert(
        'Synced',
        res.imported === 0
          ? 'Nothing new on Strava.'
          : `${res.imported} new ${res.imported === 1 ? 'activity' : 'activities'}${res.matched ? `, ${res.matched} matched to your plan` : ''}.`,
      );
  }

  function onDisconnect() {
    Alert.alert('Disconnect Strava?', 'Activities already imported stay in your history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setBusy('disconnect');
          const res = await disconnectStrava();
          setBusy(null);
          if (!res.ok) Alert.alert('Strava', res.error);
          await strava.reload();
        },
      },
    ]);
  }

  return (
    <Card title="Connections">
      <View style={{ gap: 18 }}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: STRAVA_ORANGE }}
            />
            <Body size={15} weight="medium" style={{ flex: 1 }}>
              Strava
            </Body>
            {strava.data && (
              <Body size={12} color={t.textMuted}>
                {strava.data.athleteName ?? 'Connected'}
              </Body>
            )}
          </View>
          <Body size={13} color={t.textSecondary} style={{ marginTop: 4, lineHeight: 18 }}>
            {strava.data
              ? `Runs and rides land here as sessions, with pace, heart rate, cadence and power for your physio.${
                  strava.data.lastError ? `\nLast sync had a problem: ${strava.data.lastError}` : ''
                }`
              : 'Record a run on Strava and it counts as your session — pace, heart rate, cadence and power included.'}
          </Body>
          <View style={{ marginTop: 12 }}>
            {strava.data ? (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label={busy === 'sync' ? 'Syncing…' : 'Sync now'}
                    variant="secondary"
                    onPress={onSync}
                    disabled={busy !== null}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label={busy === 'disconnect' ? '…' : 'Disconnect'}
                    variant="secondary"
                    onPress={onDisconnect}
                    disabled={busy !== null}
                  />
                </View>
              </View>
            ) : (
              <Pressable
                onPress={onConnect}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel="Connect with Strava"
                style={({ pressed }) => ({
                  backgroundColor: STRAVA_ORANGE,
                  borderRadius: t.radius.pill,
                  paddingVertical: 15,
                  alignItems: 'center',
                  opacity: pressed || busy ? 0.85 : 1,
                })}
              >
                <Text style={{ fontFamily: t.font.displaySemi, fontSize: 15, color: '#FFFFFF' }}>
                  {busy === 'connect' ? 'Opening Strava…' : 'Connect with Strava'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        <View style={{ height: 1, backgroundColor: t.border }} />

        <View>
          <Body size={15} weight="medium">
            Your calendar
          </Body>
          <Body size={13} color={t.textSecondary} style={{ marginTop: 4, lineHeight: 18 }}>
            See every planned session in your own calendar, with the exercises in the notes and a
            link to mark the whole session done without opening the app.
          </Body>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <Button
                label="Apple Calendar"
                variant="secondary"
                disabled={!calendar.data}
                onPress={() => calendar.data && subscribeInAppleCalendar(calendar.data)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label="Google Calendar"
                variant="secondary"
                disabled={!calendar.data}
                onPress={() => calendar.data && subscribeInGoogleCalendar(calendar.data)}
              />
            </View>
          </View>
        </View>
      </View>
    </Card>
  );
}
