import type { VelaClient } from './client';

/**
 * Challenges: a group total across a coach's clients, and each client's share of it.
 *
 * The design's line is the constraint — "challenges run across clients, not against them".
 * There is no metric for pain, weight or load in the enum, so the shape of the data refuses
 * a leaderboard ranking women on their bodies rather than relying on nobody building one.
 */

export type ChallengeMetric = 'sessions_completed' | 'fuel_days';

export const CHALLENGE_METRICS: { value: ChallengeMetric; label: string; blurb: string }[] = [
  {
    value: 'sessions_completed',
    label: 'Sessions logged',
    blurb: 'Counts a session once it is finished and sent. The default, and the one most challenges want.',
  },
  {
    value: 'fuel_days',
    label: 'Days eaten well',
    blurb: 'Counts a day when three of the four meal slots hold something. Energy availability, not calories.',
  },
];

export interface Challenge {
  id: string;
  name: string;
  summary: string | null;
  metric: ChallengeMetric;
  startsOn: string;
  weeks: number;
  weeklyTarget: number;
  programId: string | null;
  createdAt: string;
  /** Head count, from the participant rows the caller may see. */
  participants: number;
}

export interface ChallengeWeek {
  weekNo: number;
  total: number;
  target: number;
}

export interface ChallengeBoardRow {
  clientId: string;
  name: string;
  done: number;
  target: number;
}

export interface ChallengeStanding {
  participants: number;
  groupTotal: number;
  groupTarget: number;
  /** The caller's own contribution. Zero for the coach, who is in none of them. */
  mine: number;
}

const COLUMNS =
  'id, name, summary, metric, starts_on, weeks, weekly_target, program_id, created_at, challenge_participants(count)';

/** Every challenge the caller can see: all of the coach's, or the ones a client is in. */
export async function listChallenges(supabase: VelaClient): Promise<Challenge[]> {
  const { data } = await supabase
    .from('challenges')
    .select(COLUMNS)
    .order('created_at', { ascending: false });

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    summary: row.summary,
    metric: row.metric as ChallengeMetric,
    startsOn: row.starts_on,
    weeks: row.weeks,
    weeklyTarget: row.weekly_target,
    programId: row.program_id,
    createdAt: row.created_at,
    // A client only sees her own membership row, so this reads 1 for her — which is why the
    // client-facing surface takes its head count from challenge_standing instead.
    participants: (row.challenge_participants as { count: number }[] | null)?.[0]?.count ?? 0,
  }));
}

/**
 * Creates a challenge and enrols its participants.
 *
 * Two writes rather than one transaction, and the failure is left visible: if the enrolment
 * fails the challenge exists with nobody in it, which the dashboard shows plainly as
 * "0 participants". Silently deleting the parent to fake atomicity would lose the coach's
 * wording with no way to get it back.
 *
 * `coachId` is passed to both tables. On the participant rows it is not trusted input — a
 * composite foreign key onto (challenge.id, challenge.coach_id) means the database rejects
 * any value that does not match the parent.
 */
export async function createChallenge(
  supabase: VelaClient,
  input: {
    coachId: string;
    name: string;
    summary?: string | null;
    metric: ChallengeMetric;
    startsOn: string;
    weeks: number;
    weeklyTarget: number;
    programId?: string | null;
    clientIds: string[];
  },
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from('challenges')
    .insert({
      coach_id: input.coachId,
      name: input.name,
      summary: input.summary ?? null,
      metric: input.metric,
      starts_on: input.startsOn,
      weeks: input.weeks,
      weekly_target: input.weeklyTarget,
      program_id: input.programId ?? null,
    })
    .select('id')
    .single();

  if (error || !data) return { id: null, error: error?.message ?? 'Could not create the challenge.' };

  if (input.clientIds.length > 0) {
    const { error: joinError } = await supabase.from('challenge_participants').insert(
      input.clientIds.map((clientId) => ({
        challenge_id: data.id,
        coach_id: input.coachId,
        client_id: clientId,
      })),
    );
    if (joinError) return { id: data.id, error: joinError.message };
  }

  return { id: data.id, error: null };
}

export async function addParticipants(
  supabase: VelaClient,
  challengeId: string,
  coachId: string,
  clientIds: string[],
): Promise<{ error: string | null }> {
  if (clientIds.length === 0) return { error: null };
  const { error } = await supabase
    .from('challenge_participants')
    .insert(clientIds.map((clientId) => ({ challenge_id: challengeId, coach_id: coachId, client_id: clientId })));
  return { error: error?.message ?? null };
}

export async function removeParticipant(
  supabase: VelaClient,
  challengeId: string,
  clientId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('challenge_participants')
    .delete()
    .eq('challenge_id', challengeId)
    .eq('client_id', clientId);
  return { error: error?.message ?? null };
}

/** Week-by-week group totals. Coach-facing: a participant gets only her own numbers. */
export async function challengeWeeks(
  supabase: VelaClient,
  challengeId: string,
): Promise<ChallengeWeek[]> {
  const { data } = await supabase.rpc('challenge_weeks', { p_challenge: challengeId });
  return (data ?? []).map((r) => ({ weekNo: r.week_no, total: Number(r.total), target: Number(r.target) }));
}

/** Participation, ordered by participation. Coach-facing for the same reason. */
export async function challengeBoard(
  supabase: VelaClient,
  challengeId: string,
): Promise<ChallengeBoardRow[]> {
  const { data } = await supabase.rpc('challenge_board', { p_challenge: challengeId });
  return (data ?? []).map((r) => ({
    clientId: r.client_id,
    name: r.name,
    done: Number(r.done),
    target: Number(r.target),
  }));
}

/**
 * The aggregate a participant is allowed: head count, group total, group target, her own.
 *
 * Four numbers and no names. This is the only call in the app through which one client
 * learns anything derived from another, and it is safe because of what it returns rather
 * than who it trusts.
 */
export async function challengeStanding(
  supabase: VelaClient,
  challengeId: string,
): Promise<ChallengeStanding | null> {
  const { data } = await supabase.rpc('challenge_standing', { p_challenge: challengeId });
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    participants: row.participants,
    groupTotal: Number(row.group_total),
    groupTarget: Number(row.group_target),
    mine: Number(row.mine),
  };
}

/** Which week a challenge is in, 1-based, clamped to its length. Null before it starts. */
export function challengeWeekNow(startsOn: string, weeks: number, today: string): number | null {
  const days = Math.floor((Date.parse(today) - Date.parse(startsOn)) / 86_400_000);
  if (days < 0) return null;
  return Math.min(weeks, Math.floor(days / 7) + 1);
}
