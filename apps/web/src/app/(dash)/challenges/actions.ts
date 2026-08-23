'use server';

import { revalidatePath } from 'next/cache';
import {
  addParticipants,
  challengeBoard,
  challengeStanding,
  challengeWeeks,
  createChallenge,
  listChallenges,
  removeParticipant,
  type ChallengeMetric,
} from '@vela/api';
import { createServerSupabase } from '@/lib/supabase/server';

export interface Result {
  ok: boolean;
  error?: string;
  id?: string;
}

async function ctx() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

export async function loadChallenges() {
  const { supabase } = await ctx();
  return listChallenges(supabase);
}

/**
 * Everything the dashboard renders, in one place.
 *
 * Three round trips fired together rather than in sequence: the weekly totals, the board
 * and the standing are independent reads over the same rows, and awaiting them one after
 * another would make the page three times slower for no benefit.
 */
export async function loadChallengeDashboard(id: string) {
  const { supabase } = await ctx();
  const [weeks, board, standing] = await Promise.all([
    challengeWeeks(supabase, id),
    challengeBoard(supabase, id),
    challengeStanding(supabase, id),
  ]);

  const { data } = await supabase
    .from('challenges')
    .select('id, name, summary, metric, starts_on, weeks, weekly_target')
    .eq('id', id)
    .maybeSingle();

  return {
    challenge: data
      ? {
          id: data.id,
          name: data.name,
          summary: data.summary,
          metric: data.metric as ChallengeMetric,
          startsOn: data.starts_on,
          weeks: data.weeks,
          weeklyTarget: data.weekly_target,
        }
      : null,
    weeks,
    board,
    standing,
  };
}

export async function createChallengeAction(formData: FormData): Promise<Result> {
  const { supabase, userId } = await ctx();
  if (!userId) return { ok: false, error: 'Not signed in.' };

  const name = String(formData.get('name') ?? '').trim();
  if (!name) return { ok: false, error: 'Give the challenge a name.' };

  const clientIds = JSON.parse(String(formData.get('clientIds') ?? '[]')) as string[];
  if (clientIds.length < 2) {
    // Not an arbitrary floor. A "group total" of one person is that person's own total
    // wearing a different label, and it would show her a group she is alone in.
    return { ok: false, error: 'A challenge needs at least two people to be a group.' };
  }

  const { id, error } = await createChallenge(supabase, {
    coachId: userId,
    name,
    summary: String(formData.get('summary') ?? '').trim() || null,
    metric: (String(formData.get('metric') ?? 'sessions_completed') as ChallengeMetric),
    startsOn: String(formData.get('startsOn') ?? ''),
    weeks: Number(formData.get('weeks') ?? 4),
    weeklyTarget: Number(formData.get('weeklyTarget') ?? 3),
    clientIds,
  });

  if (error) return { ok: false, error, id: id ?? undefined };
  revalidatePath('/challenges');
  return { ok: true, id: id ?? undefined };
}

export async function addParticipantsAction(
  challengeId: string,
  clientIds: string[],
): Promise<Result> {
  const { supabase, userId } = await ctx();
  if (!userId) return { ok: false, error: 'Not signed in.' };
  const { error } = await addParticipants(supabase, challengeId, userId, clientIds);
  if (error) return { ok: false, error };
  revalidatePath(`/challenges/${challengeId}`);
  return { ok: true };
}

export async function removeParticipantAction(
  challengeId: string,
  clientId: string,
): Promise<Result> {
  const { supabase } = await ctx();
  const { error } = await removeParticipant(supabase, challengeId, clientId);
  if (error) return { ok: false, error };
  revalidatePath(`/challenges/${challengeId}`);
  return { ok: true };
}
