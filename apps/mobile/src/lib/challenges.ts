import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { challengeStanding, listChallenges, type Challenge, type ChallengeStanding } from '@vela/api';
import { supabase } from './supabase';
import { useSession } from './session';

export interface ClientChallenge {
  challenge: Challenge;
  standing: ChallengeStanding;
}

/**
 * The challenges this client is in, each with the group's number and her own.
 *
 * `listChallenges` reaches her own challenges through the participant policy; the totals
 * come from `challenge_standing`, which is the only call in the app that aggregates across
 * clients. It returns four integers and no names — she learns that six people logged
 * sixty-eight sessions, never who logged them, and never that any particular person is a
 * patient of the same physiotherapist.
 */
export function useMyChallenges() {
  const { client } = useSession();
  const [data, setData] = useState<ClientChallenge[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      if (!client) {
        setData([]);
        setLoading(false);
        return;
      }

      void (async () => {
        const challenges = await listChallenges(supabase);
        const withStanding = await Promise.all(
          challenges.map(async (challenge) => {
            const standing = await challengeStanding(supabase, challenge.id);
            return standing ? { challenge, standing } : null;
          }),
        );
        if (live) {
          setData(withStanding.filter((x): x is ClientChallenge => x !== null));
          setLoading(false);
        }
      })();

      return () => {
        live = false;
      };
    }, [client]),
  );

  return { data, loading };
}
