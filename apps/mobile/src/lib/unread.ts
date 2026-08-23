import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { listMessages, unreadCount } from '@vela/api';
import { supabase } from './supabase';
import { useSession } from './session';

/**
 * How many messages from the coach are unread.
 *
 * This exists for the dot on the Profile tab, which is where the thread is reached from. It
 * refetches on focus rather than polling: a message arriving while the app is open is not
 * worth a timer, and a message arriving while it is closed shows up the moment a tab is
 * touched.
 *
 * Bounded to the recent thread rather than counting the whole history — the badge only ever
 * needs "is there anything", and the number never reaches the ceiling in a real thread.
 */
export function useUnreadFromCoach(): number {
  const { client } = useSession();
  const [count, setCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      if (!client) {
        setCount(0);
        return;
      }
      void listMessages(supabase, client.id, 50).then((rows) => {
        if (live) setCount(unreadCount(rows, 'coach'));
      });
      return () => {
        live = false;
      };
    }, [client]),
  );

  return count;
}
