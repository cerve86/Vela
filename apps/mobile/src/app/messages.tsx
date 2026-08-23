import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Send } from 'lucide-react-native';
import { listMessages, markRead, sendMessage, type Message } from '@vela/api';
import { Body, Card, Screen } from '@/components/kit';
import { Rise, Tap } from '@/components/motion';
import { VelaMark } from '@/components/brand';
import { Illustration } from '@/components/Illustration';
import { useTheme } from '@/theme';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

/**
 * The thread with your physiotherapist.
 *
 * Deliberately one conversation and no inbox: there is exactly one other person, and a
 * list of threads with a single row in it is furniture rather than navigation.
 *
 * A session can be attached, which is what makes this worth having over text — "this one
 * hurt more than usual" is a different message when the session it refers to travels with
 * it, and the coach does not have to ask which day.
 */
export default function MessagesScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { client } = useSession();
  const { session: attachedSession, about } = useLocalSearchParams<{
    session?: string;
    about?: string;
  }>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(about ? `About ${about}: ` : '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scroller = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!client) return;
    const rows = await listMessages(supabase, client.id);
    setMessages(rows);
    setLoading(false);
    // Reading the thread is what marks it read. Doing it on send instead would leave a
    // badge sitting on a message she has plainly already seen.
    void markRead(supabase, client.id, 'coach');
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    if (!client || sending) return;
    const body = draft.trim();
    if (!body) return;

    setSending(true);
    setError(null);
    const { error: err } = await sendMessage(supabase, {
      clientId: client.id,
      sender: 'client',
      body,
      sessionId: attachedSession ?? null,
    });
    setSending(false);

    if (err) {
      // The draft is kept. Losing what someone just typed because the network dipped is
      // the one failure this screen must never have.
      setError('That did not send. Your message is still here — try again.');
      return;
    }
    setDraft('');
    void load();
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingHorizontal: t.space.lg,
            paddingTop: insets.top + t.space.md,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: t.border,
          }}
        >
          <Tap
            onPress={() => router.back()}
            accessibilityLabel="Back"
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: t.surface,
              borderWidth: 1,
              borderColor: t.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ChevronLeft size={16} color={t.textPrimary} strokeWidth={2.5} />
          </Tap>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: t.brand[600],
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <VelaMark size={17} mode="onBrand" />
          </View>
          <View style={{ flex: 1 }}>
            <Body size={15} weight="semibold">
              Your physiotherapist
            </Body>
            <Body size={11} color={t.textSecondary}>
              Replies land here, not by email
            </Body>
          </View>
        </View>

        <ScrollView
          ref={scroller}
          contentContainerStyle={{
            padding: t.space.lg,
            paddingBottom: t.space.xl,
            gap: 10,
          }}
          onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <ActivityIndicator color={t.brand[600]} />
          ) : messages.length === 0 ? (
            <Card style={{ borderRadius: 22, marginTop: t.space.lg }}>
              <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
                <Illustration name="welcome" width={150} />
                <Body size={13} color={t.textSecondary} style={{ textAlign: 'center', lineHeight: 19 }}>
                  Nothing here yet. Anything that felt off, or a question between
                  appointments — this is the place for it.
                </Body>
              </View>
            </Card>
          ) : (
            messages.map((m, i) => <Bubble key={m.id} message={m} index={i} />)
          )}

          {attachedSession && (
            <View
              style={{
                alignSelf: 'flex-end',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: t.softFill,
                borderRadius: t.radius.md,
                paddingVertical: 9,
                paddingHorizontal: 12,
              }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.brand[600] }} />
              <Body size={11} color={t.textSecondary}>
                About {about ?? 'this session'}
              </Body>
            </View>
          )}
        </ScrollView>

        {error && (
          <Body
            size={12.5}
            color={t.status.critical}
            style={{ paddingHorizontal: t.space.lg, paddingBottom: 8 }}
          >
            {error}
          </Body>
        )}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 8,
            paddingHorizontal: t.space.lg,
            paddingBottom: Math.max(insets.bottom, t.space.lg),
            paddingTop: 8,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder="Write to your physio"
            placeholderTextColor={t.textMuted}
            accessibilityLabel="Message"
            style={{
              flex: 1,
              maxHeight: 120,
              backgroundColor: t.inputFill,
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingTop: 12,
              paddingBottom: 12,
              color: t.textPrimary,
              fontFamily: t.font.regular,
              fontSize: 15,
            }}
          />
          <Tap
            onPress={send}
            disabled={!draft.trim() || sending}
            accessibilityLabel="Send"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: draft.trim() && !sending ? t.brand[600] : t.softFill,
            }}
          >
            <Send
              size={18}
              color={draft.trim() && !sending ? '#FFFFFF' : t.textMuted}
              strokeWidth={2.2}
            />
          </Tap>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/**
 * One message.
 *
 * The coach's side is a plain surface and the client's is brand-filled — the convention
 * everyone already reads without being told, so the thread needs no labels.
 */
function Bubble({ message, index }: { message: Message; index: number }) {
  const t = useTheme();
  const mine = message.sender === 'client';

  return (
    <Rise delay={Math.min(index, 6) * 30}>
      <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
        <View
          style={{
            maxWidth: '86%',
            backgroundColor: mine ? t.brand[600] : t.surface,
            borderWidth: mine ? 0 : 1,
            borderColor: t.border,
            borderRadius: 18,
            borderBottomRightRadius: mine ? 6 : 18,
            borderBottomLeftRadius: mine ? 18 : 6,
            paddingVertical: 11,
            paddingHorizontal: 14,
          }}
        >
          <Text
            style={{
              fontFamily: t.font.regular,
              fontSize: 15,
              lineHeight: 21,
              color: mine ? '#FFFFFF' : t.textPrimary,
            }}
          >
            {message.body}
          </Text>
        </View>
        <Body size={10.5} color={t.textMuted} style={{ marginTop: 4, marginHorizontal: 4 }}>
          {when(message.createdAt)}
        </Body>
      </View>
    </Rise>
  );
}

/** Time for today, weekday and time for this week, date beyond that. */
function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (days === 0) return time;
  if (days < 7) return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${time}`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
