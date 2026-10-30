import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { Body, Card } from '@/components/kit';
import { VelaMark } from '@/components/brand';
import { useTheme } from '@/theme';
import { useCoachInbox } from '@/lib/unread';

function when(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (days === 0) return time;
  if (days < 7) return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * A message from her physio she has not read, at the top of Today: the latest one, and the
 * way into the thread. Nothing when the thread is read — Today is not an inbox.
 */
export function CoachMessageCard() {
  const t = useTheme();
  const router = useRouter();
  const { unread, latest } = useCoachInbox();
  if (!latest) return null;

  return (
    <Pressable
      onPress={() => router.push('/messages')}
      accessibilityRole="button"
      accessibilityLabel={`${unread === 1 ? 'A new message' : `${unread} new messages`} from your physio. Open messages`}
    >
      <Card style={{ borderRadius: 22, borderWidth: 1.5, borderColor: t.brand[600] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              backgroundColor: t.brand[600],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <VelaMark size={15} mode="onBrand" />
          </View>
          <Body
            size={11}
            weight="medium"
            color={t.brand[600]}
            style={{ flex: 1, letterSpacing: 0.5 }}
          >
            {unread === 1
              ? 'NEW MESSAGE FROM YOUR PHYSIO'
              : `${unread} NEW MESSAGES FROM YOUR PHYSIO`}
          </Body>
          <Body size={11} color={t.textMuted}>
            {when(latest.createdAt)}
          </Body>
        </View>
        <Body size={14.5} numberOfLines={3} style={{ marginTop: 10, lineHeight: 20 }}>
          {latest.body}
        </Body>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 }}>
          <Body size={13} weight="medium" color={t.brand[600]}>
            Open messages
          </Body>
          <ChevronRight size={15} color={t.brand[600]} strokeWidth={2.4} />
        </View>
      </Card>
    </Pressable>
  );
}
