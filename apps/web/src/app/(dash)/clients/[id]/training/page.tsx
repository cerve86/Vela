import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DISCIPLINE_LABEL, listSessions } from '@vela/api';
import { Card, EmptyState, PainDot, StatusPill } from '@/components/ui';
import { TimeSeriesPanels, type Panel } from '@/components/charts';
import { dateWindow } from '@/lib/series';
import { createServerSupabase } from '@/lib/supabase/server';

export default async function TrainingTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: client } = await supabase.from('clients').select('id').eq('id', id).maybeSingle();
  if (!client) notFound();

  const { data: assignment, error: assignmentError } = await supabase
    .from('assignments')
    .select('id, start_date, status, programs(id, name, duration_weeks)')
    .eq('client_id', id)
    .eq('status', 'active')
    .maybeSingle();

  // A mistyped column comes back as an error with null data, which renders exactly like
  // "no programme assigned". Surfacing it beats quietly telling the coach she has none.
  if (assignmentError) throw new Error(`Could not read assignment: ${assignmentError.message}`);

  const todayIso = new Date().toISOString().slice(0, 10);
  const sessions = await listSessions(supabase, { clientId: id });

  const completed = sessions.filter((s) => s.status === 'completed');
  const upcoming = sessions.filter((s) => s.scheduledDate >= todayIso && s.status === 'scheduled');

  const xLabels = dateWindow(56);
  const before = new Map(
    sessions.filter((s) => s.painBefore !== null).map((s) => [s.scheduledDate, s.painBefore!]),
  );
  const after = new Map(
    sessions.filter((s) => s.painAfter !== null).map((s) => [s.scheduledDate, s.painAfter!]),
  );

  // Before and after share the same 0–10 scale, so one panel with two series is honest —
  // the gap between the lines is exactly the thing the coach is looking for.
  const painPanel: Panel = {
    id: 'pain',
    label: 'Pain around each session (0–10)',
    domain: [0, 10],
    height: 200,
    format: { style: 'fixed', decimals: 0 },
    series: [
      {
        id: 'before',
        label: 'Before',
        color: 'var(--series-1)',
        kind: 'line',
        points: xLabels.map((d) => ({ x: d, y: before.get(d) ?? null })),
        connectGaps: true,
      },
      {
        id: 'after',
        label: 'After',
        color: 'var(--series-2)',
        kind: 'line',
        points: xLabels.map((d) => ({ x: d, y: after.get(d) ?? null })),
        connectGaps: true,
      },
    ],
  };

  const program = assignment?.programs as
    | { id: string; name: string; duration_weeks: number }
    | null
    | undefined;

  return (
    <div className="space-y-4">
      <Card
        title="Assigned programme"
        action={
          assignment ? (
            <StatusPill tone="good">Active</StatusPill>
          ) : (
            <StatusPill tone="neutral">None</StatusPill>
          )
        }
      >
        {assignment && program ? (
          <div className="flex items-baseline justify-between">
            <div>
              <Link href={`/programs/${program.id}`} className="text-base font-semibold hover:underline">
                {program.name}
              </Link>
              <p className="mt-0.5 text-sm ink-2">
                {program.duration_weeks} weeks · started{' '}
                {new Date(`${assignment.start_date}T00:00:00Z`).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                })}
              </p>
            </div>
            <div className="text-right text-sm ink-2">
              {completed.length} of {sessions.length} sessions logged
            </div>
          </div>
        ) : (
          <p className="text-sm ink-2">
            No programme assigned yet. Build one in{' '}
            <Link href="/programs" className="underline">
              Programmes
            </Link>{' '}
            and assign it with a start date — the sessions are generated from there.
          </p>
        )}
      </Card>

      <Card title="Pain before and after" action={<span className="text-xs ink-3">Last 8 weeks</span>}>
        {completed.length === 0 ? (
          <EmptyState
            art="trend"
            title="Nothing logged yet"
            body="Each session she finishes records a pain score before and after. Two or three sessions in, the gap between the lines starts telling you whether the load is right."
          />
        ) : (
          <>
            <TimeSeriesPanels xLabels={xLabels} panels={[painPanel]} />
            <p className="mt-2 text-xs ink-3">
              Set-by-set load, session RPE and duration join this tab when the offline
              outbox syncs them in Phase 3.
            </p>
          </>
        )}
      </Card>

      <Card title="Session history">
        {completed.length === 0 ? (
          <p className="text-sm ink-2">No completed sessions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs ink-3">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Session</th>
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Pain before</th>
                  <th className="pb-2 font-medium">Pain after</th>
                </tr>
              </thead>
              <tbody>
                {completed
                  .slice(-10)
                  .reverse()
                  .map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="tnum py-2.5">
                        {new Date(`${s.scheduledDate}T00:00:00Z`).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          timeZone: 'UTC',
                        })}
                      </td>
                      <td className="py-2.5 font-medium">{s.title}</td>
                      <td className="py-2.5 ink-2">{DISCIPLINE_LABEL[s.discipline]}</td>
                      <td className="py-2.5">
                        <PainDot score={s.painBefore} />
                      </td>
                      <td className="py-2.5">
                        <PainDot score={s.painAfter} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Coming up">
        {upcoming.length === 0 ? (
          <p className="text-sm ink-2">Nothing scheduled ahead.</p>
        ) : (
          <ul className="divide-y">
            {upcoming.slice(0, 8).map((s) => (
              <li key={s.id} className="flex items-center gap-4 py-2.5">
                <span className="tnum w-24 shrink-0 text-sm">
                  {new Date(`${s.scheduledDate}T00:00:00Z`).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  })}
                </span>
                <span className="flex-1 text-sm font-medium">{s.title}</span>
                <StatusPill tone="neutral">{DISCIPLINE_LABEL[s.discipline]}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
