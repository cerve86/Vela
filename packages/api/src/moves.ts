import type { VelaClient } from './client';

/**
 * Moving sessions, every block a client has had, and a client's requests to move.
 *
 * The rules live in the database: only a planned session from today on can move, a
 * moved one keeps its programmed date so the reflow leaves it where the coach put it,
 * and a client can only ask. These are thin calls onto those functions.
 */

export async function moveSession(
  supabase: VelaClient,
  sessionId: string,
  to: string,
  ripple = false,
): Promise<{ moved: number; error: string | null }> {
  const { data, error } = await supabase.rpc('move_session', {
    p_session: sessionId,
    p_to: to,
    p_ripple: ripple,
  });
  return { moved: data ?? 0, error: error?.message ?? null };
}

export type BlockStatus = 'active' | 'completed' | 'cancelled' | 'replaced';

export interface Block {
  assignmentId: string;
  clientId: string;
  programId: string;
  programName: string;
  programKind: 'structured' | 'descriptive';
  durationWeeks: number;
  /** The Monday the block is anchored on. */
  startDate: string;
  /** The day the coach chose; earlier days of that week were never scheduled. */
  firstDay: string;
  /** The Sunday of its last week. */
  endDate: string;
  status: BlockStatus;
  planned: number;
  done: number;
  moved: number;
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Every block, newest first; one client's, or every client the reader can see. */
export async function listBlocks(supabase: VelaClient, clientId?: string): Promise<Block[]> {
  let q = supabase
    .from('block_progress')
    .select(
      'assignment_id, client_id, program_id, program_name, program_kind, duration_weeks, start_date, first_day, status, planned, done, moved',
    )
    .order('created_at', { ascending: false });
  if (clientId) q = q.eq('client_id', clientId);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    assignmentId: r.assignment_id!,
    clientId: r.client_id!,
    programId: r.program_id!,
    programName: r.program_name!,
    programKind: (r.program_kind as Block['programKind']) ?? 'structured',
    durationWeeks: r.duration_weeks ?? 0,
    startDate: r.start_date!,
    firstDay: r.first_day!,
    endDate: addDays(r.start_date!, (r.duration_weeks ?? 0) * 7 - 1),
    status: r.status as BlockStatus,
    planned: r.planned ?? 0,
    done: r.done ?? 0,
    moved: r.moved ?? 0,
  }));
}

export interface MoveRequest {
  id: string;
  clientId: string;
  sessionId: string;
  fromDate: string;
  toDate: string;
  note: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  createdAt: string;
}

export async function listMoveRequests(
  supabase: VelaClient,
  opts: { clientId?: string; sessionId?: string; pending?: boolean } = {},
): Promise<MoveRequest[]> {
  let q = supabase
    .from('move_requests')
    .select('id, client_id, session_id, from_date, to_date, note, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  if (opts.clientId) q = q.eq('client_id', opts.clientId);
  if (opts.sessionId) q = q.eq('session_id', opts.sessionId);
  if (opts.pending) q = q.eq('status', 'pending');
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: r.id,
    clientId: r.client_id,
    sessionId: r.session_id,
    fromDate: r.from_date,
    toDate: r.to_date,
    note: r.note,
    status: r.status as MoveRequest['status'],
    createdAt: r.created_at,
  }));
}

/** The client asks to move one of her planned sessions. */
export async function requestSessionMove(
  supabase: VelaClient,
  sessionId: string,
  to: string,
  note?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('request_session_move', {
    p_session: sessionId,
    p_to: to,
    p_note: note ?? undefined,
  });
  return { error: error?.message ?? null };
}

export async function withdrawMoveRequest(
  supabase: VelaClient,
  sessionId: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('withdraw_move_request', { p_session: sessionId });
  return { error: error?.message ?? null };
}

/** The coach grants a request (to the day asked, or another) or keeps the session. */
export async function decideMoveRequest(
  supabase: VelaClient,
  sessionId: string,
  accept: boolean,
  to?: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('decide_move_request', {
    p_session: sessionId,
    p_accept: accept,
    ...(to ? { p_to: to } : {}),
  });
  return { error: error?.message ?? null };
}
