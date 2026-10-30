import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { listMessages, unreadCount, type Message } from '@vela/api';
import { supabase } from './supabase';
import { useSession } from './session';

/**
 * Her physio's messages she has not read yet: how many, and the latest of them.
 *
 * This feeds the dot on the Profile tab and the card at the top of Today, which is where a
 * new message has to be seen — the thread itself sits behind Profile. It refetches on
 * focus rather than polling: a message arriving while the app is closed shows up the moment
 * a tab is touched.
 *
 * Bounded to the recent thread rather than counting the whole history — the badge only ever
 * needs "is there anything", and the number never reaches the ceiling in a real thread.
 */
export function useCoachInbox(): { unread: number; latest: Message | null } {
  const { client } = useSession();
  const [state, setState] = useState<{ unread: number; latest: Message | null }>({
    unread: 0,
    latest: null,
  });

  useFocusEffect(
    useCallback(() => {
      let live = true;
      if (!client) {
        setState({ unread: 0, latest: null });
        return;
      }
      void listMessages(supabase, client.id, 50).then((rows) => {
        if (!live) return;
        const waiting = rows.filter((m) => m.sender === 'coach' && m.readAt === null);
        setState({ unread: unreadCount(rows, 'coach'), latest: waiting.at(-1) ?? null });
      });
      return () => {
        live = false;
      };
    }, [client]),
  );

  return state;
}

/** How many messages from the coach are unread — the dot on the Profile tab. */
export function useUnreadFromCoach(): number {
  return useCoachInbox().unread;
}
