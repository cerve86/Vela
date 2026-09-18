import { listActiveAssignments, listSessions } from '@vela/api';
import { createServerSupabase } from '@/lib/supabase/server';
import { CalendarView, type CalendarClient, type CalendarSession, type View } from './CalendarView';
import { addDays, monthEnd, monthStart, mondayOf } from './dates';

export const metadata = { title: 'Calendar — Vela' };

/**
 * Every client's training on one calendar, and one client's in a side panel.
 *
 * The URL is the state — view, date, and which client's panel is open — so a coach can
 * send a colleague "Marta, the week of the 14th" as a link and the back button walks
 * through what she looked at. The server loads the month around the date plus a margin,
 * enough for any week or day inside it; moving further reloads with a new date.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; client?: string }>;
}) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const view: View = params.view === 'day' || params.view === 'month' ? params.view : 'week';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date ?? '') ? params.date! : today;

  const supabase = await createServerSupabase();
  const from = addDays(mondayOf(monthStart(date)), -7);
  const to = addDays(monthEnd(date), 14);

  const [{ data: clientRows }, assignments, sessions] = await Promise.all([
    supabase
      .from('clients')
      .select('id, email, first_name_hint, last_name_hint, status')
      .order('first_name_hint', { ascending: true }),
    listActiveAssignments(supabase),
    listSessions(supabase, { from, to }),
  ]);

  const byClient = new Map(assignments.map((a) => [a.clientId, a]));
  const clients: CalendarClient[] = (clientRows ?? []).map((c) => {
    const a = byClient.get(c.id) ?? null;
    return {
      id: c.id,
      name: `${c.first_name_hint ?? ''} ${c.last_name_hint ?? ''}`.trim() || c.email,
      status: c.status,
      program: a
        ? {
            id: a.programId,
            name: a.programName,
            kind: a.kind,
            durationWeeks: a.durationWeeks,
            startDate: a.startDate,
          }
        : null,
    };
  });

  const rows: CalendarSession[] = sessions.map((s) => ({
    id: s.id,
    clientId: s.clientId,
    title: s.title,
    discipline: s.discipline,
    date: s.scheduledDate,
    status: s.status,
    prescribed: s.programDayId !== null,
    setsDone: s.setsDone,
    setsPlanned: s.setsPlanned,
    painBefore: s.painBefore,
    painAfter: s.painAfter,
    durationSec: s.durationSec,
    loggedVia: s.loggedVia,
    dayNotes: s.dayNotes,
    doneItemIds: s.doneItemIds,
  }));

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 md:p-8">
      <CalendarView
        clients={clients}
        sessions={rows}
        today={today}
        view={view}
        date={date}
        openClientId={params.client ?? null}
        loaded={{ from, to }}
      />
    </div>
  );
}
