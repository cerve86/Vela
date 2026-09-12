import type { VelaClient } from './client';
import { sendMessage, type MessageVia } from './messages';

/**
 * Telling the client her programme changed.
 *
 * Assigning, taking off and editing a programme all reach her phone silently otherwise:
 * a session vanishes from Today and her calendar with no word why. The weekly plan
 * already sends a line in the thread she watches; these do the same. Edits are batched
 * to one line an hour per client, because a coach reworking a day in the builder makes
 * a dozen small changes and a dozen messages would be noise, not news.
 */
export async function notifyProgramAssigned(
  supabase: VelaClient,
  input: { clientId: string; programName: string; startDate: string; via: MessageVia },
): Promise<void> {
  await sendMessage(supabase, {
    clientId: input.clientId,
    sender: 'coach',
    via: input.via,
    body: `Your programme "${input.programName}" starts on ${pretty(input.startDate)} — it's on Today and in your calendar.`,
  });
}

export async function notifyProgramUnassigned(
  supabase: VelaClient,
  input: { clientId: string; programName: string; via: MessageVia },
): Promise<void> {
  await sendMessage(supabase, {
    clientId: input.clientId,
    sender: 'coach',
    via: input.via,
    body: `I've taken "${input.programName}" off your plan. Your upcoming sessions from it are gone; what you've done stays. I'll be in touch about what's next.`,
  });
}

const EDIT_NOTICE = "I've updated your programme";
const EDIT_QUIET_MS = 60 * 60 * 1000;

/**
 * One line per client per hour when a programme she is on is edited. Sessions on her
 * calendar read their prescriptions from the programme live, so the change is already
 * there; this is what makes her look.
 */
export async function notifyProgramEdited(
  supabase: VelaClient,
  input: { programId: string; programName: string; via: MessageVia },
): Promise<void> {
  const { data: assigned } = await supabase
    .from('assignments')
    .select('client_id')
    .eq('program_id', input.programId)
    .eq('status', 'active');
  for (const a of assigned ?? []) {
    const { data: recent } = await supabase
      .from('messages')
      .select('id')
      .eq('client_id', a.client_id)
      .eq('sender', 'coach')
      .like('body', `${EDIT_NOTICE}%`)
      .gt('created_at', new Date(Date.now() - EDIT_QUIET_MS).toISOString())
      .limit(1);
    if (recent && recent.length > 0) continue;
    await sendMessage(supabase, {
      clientId: a.client_id,
      sender: 'coach',
      via: input.via,
      body: `${EDIT_NOTICE} "${input.programName}" — have a look at your next session before you start it.`,
    });
  }
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}
