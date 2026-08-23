import type { VelaClient } from './client';

/**
 * The thread between a client and her physiotherapist.
 *
 * One thread per client, so nothing here takes a thread id — `clientId` names the
 * conversation. Row level security decides what a caller may see; these functions never
 * filter by hand, which is what makes a mistake in them harmless.
 */

export type MessageSender = 'client' | 'coach';

export interface Message {
  id: string;
  sender: MessageSender;
  body: string;
  /** The session this message is about, when it was sent from a summary. */
  sessionId: string | null;
  readAt: string | null;
  createdAt: string;
}

const COLUMNS = 'id, sender, body, session_id, read_at, created_at';

function toMessage(row: {
  id: string;
  sender: string;
  body: string;
  session_id: string | null;
  read_at: string | null;
  created_at: string;
}): Message {
  return {
    id: row.id,
    sender: row.sender as MessageSender,
    body: row.body,
    sessionId: row.session_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/** The thread, oldest first — the order a conversation is read in. */
export async function listMessages(
  supabase: VelaClient,
  clientId: string,
  limit = 200,
): Promise<Message[]> {
  const { data } = await supabase
    .from('messages')
    .select(COLUMNS)
    .eq('client_id', clientId)
    // Newest-first with an explicit limit, then reversed: the cap has to fall on the
    // oldest end of a long thread, never on what was said this morning.
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data ?? []).map(toMessage).reverse();
}

/**
 * Sends a message.
 *
 * `sender` is passed rather than inferred, and the database checks it against who is
 * calling — a client may only insert as `client`, a coach only as `coach`. That check is
 * the reason clinical advice cannot be fabricated by the person receiving it, so it lives
 * in a policy rather than here.
 */
export async function sendMessage(
  supabase: VelaClient,
  input: { clientId: string; sender: MessageSender; body: string; sessionId?: string | null },
): Promise<{ error: string | null }> {
  const body = input.body.trim();
  if (!body) return { error: 'Nothing to send.' };

  const { error } = await supabase.from('messages').insert({
    client_id: input.clientId,
    sender: input.sender,
    body,
    session_id: input.sessionId ?? null,
  });
  return { error: error?.message ?? null };
}

/**
 * Marks the other party's messages as read.
 *
 * Scoped to the messages this caller did not write. Marking your own message read is
 * meaningless, and the policy refuses it anyway.
 */
export async function markRead(
  supabase: VelaClient,
  clientId: string,
  from: MessageSender,
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .eq('sender', from)
    .is('read_at', null);
  return { error: error?.message ?? null };
}

/** How many of the other party's messages are still unread. */
export function unreadCount(messages: Message[], from: MessageSender): number {
  return messages.filter((m) => m.sender === from && m.readAt === null).length;
}
