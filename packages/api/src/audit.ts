import type { VelaClient } from './client';

/** Where an action came from: the coach in the portal, or her assistant with her key. */
export type Via = 'portal' | 'assistant';

/**
 * One audit row. The actor is whoever the session belongs to — an assistant acting with
 * a coach's key is the coach, as far as the database is concerned — so `via` is what
 * tells the two apart later, when someone asks who changed what.
 */
export async function logAudit(
  supabase: VelaClient,
  input: { actorId: string; action: string; entity: string; entityId: string | null; via: Via },
): Promise<void> {
  await supabase.from('audit_log').insert({
    actor_id: input.actorId,
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId,
    via: input.via,
  });
}
