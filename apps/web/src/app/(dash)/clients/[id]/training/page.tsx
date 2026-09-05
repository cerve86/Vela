import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  DISCIPLINE_LABEL,
  getSessionPlan,
  getStravaLink,
  listActivities,
  listDailyReads,
  listSessions,
} from '@vela/api';
import { ActivitiesCard } from './ActivitiesCard';
import { isBlocking, tide } from '@vela/shared';
import { Card, EmptyState, PainDot, StatusPill } from '@/components/ui';
import { SessionResponse } from './SessionResponse';
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
  const [sessions, activities, stravaLink] = await Promise.all([
    listSessions(supabase, { clientId: id }),
    listActivities(supabase, { clientId: id, limit: 12 }),
    getStravaLink(supabase, id),
  ]);

  const completed = sessions.filter((s) => s.status === 'completed');

  /**
   * The session under review: the most recent one she finished.
   *
   * The prescription is fetched rather than reconstructed, because what the coach needs to
   * see is what the app actually served that day. Set-by-set results are not here — they
   * stay on the phone until the send, and only the outcome is written — so the card shows
   * the prescription and the outcome and does not invent a per-exercise verdict it cannot
   * know.
   */
  const review =
    [...completed].sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1))[0] ?? null;

  const [reviewPlan, reviewReads] = await Promise.all([
    review ? getSessionPlan(supabase, review.id) : Promise.resolve([]),
    review
      ? listDailyReads(supabase, {
          clientId: id,
          from: review.scheduledDate,
          to: review.scheduledDate,
        })
      : Promise.resolve([]),
  ]);

  // What she reported on the day, which is what decided whether the app trimmed the work.
  const blockingRead = reviewReads.find((r) => isBlocking(r.symptom)) ?? null;
  const lowestRead = [...reviewReads].sort((a, b) => a.readiness - b.readiness)[0] ?? null;

  const suggestions = review
    ? [
        blockingRead
          ? `Good call stopping the impact work when the ${blockingRead.symptom.toLowerCase()} showed up.`
          : 'That looked comfortable — we can add a little next week.',
        review.painAfter !== null &&
        review.painBefore !== null &&
        review.painAfter > review.painBefore
          ? 'Symptoms came up during that one. Let us hold the load where it is.'
          : 'Symptoms stayed settled, which is what I was watching for.',
        'How did it feel the next morning?',
      ]
    : [];
  /**
   * What is still ahead of her, including anything she has open right now.
   *
   * `in_progress` is in this list rather than filtered out with the finished ones: the app
   * writes that status the moment she taps Start, and a session she opened this morning and
   * has not sent yet belongs under the coach's eye, not in a gap between two lists. It is
   * also the one status worth calling out by name — "started, not sent" is a different
   * conversation from "not started".
   */
  const upcoming = sessions.filter(
    (s) => s.scheduledDate >= todayIso && (s.status === 'scheduled' || s.status === 'in_progress'),
  );

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
    { id: string; name: string; duration_weeks: number } | null | undefined;

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
              <Link
                href={`/programs/${program.id}`}
                className="text-base font-semibold hover:underline"
              >
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

      {review && (
        <Card
          title="Latest session"
          action={
            <span className="text-xs ink-3">
              {new Date(`${review.scheduledDate}T00:00:00Z`).toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              })}
            </span>
          }
        >
          <div className="flex items-start justify-between gap-5">
            <div>
              <h3 className="display-face text-2xl font-semibold">{review.title}</h3>
              <p className="mt-1 text-sm ink-2">
                {/*
                  What she did, then what she was given — in that order, because "3 of 9"
                  is the fact that changes the conversation and it used to be absent
                  entirely. A session that stopped a third of the way in and one she
                  finished both read "Completed" here until the app started sending its
                  volume.
                */}
                {review.setsDone !== null && review.setsPlanned !== null
                  ? `${review.setsDone} of ${review.setsPlanned} sets`
                  : `${reviewPlan.reduce((n, i) => n + i.sets, 0)} sets prescribed`}
                {' · '}
                {reviewPlan.length} movements
                {review.durationSec !== null && ` · ${Math.round(review.durationSec / 60)} min`}
                {' · '}
                {review.painBefore !== null && review.painAfter !== null
                  ? `symptoms ${review.painBefore}/10 before, ${review.painAfter}/10 after`
                  : 'no symptom scores recorded'}
              </p>
            </div>
            {blockingRead ? (
              <StatusPill tone="warning">Symptom flagged</StatusPill>
            ) : (
              <StatusPill tone="good">Completed</StatusPill>
            )}
          </div>

          {blockingRead && (
            <div className="mt-4 rounded-[16px] p-4" style={{ background: 'var(--tint-cream)' }}>
              <div className="text-sm font-medium">
                She reported {blockingRead.symptom.toLowerCase()} on her {blockingRead.window} read
              </div>
              <p className="mt-1 text-sm ink-2">
                The app withdrew the impact work for that day on its own and served breath and
                connection work instead. Readiness was{' '}
                {tide[blockingRead.readiness]?.label.toLowerCase() ?? 'unrecorded'}. Worth
                confirming whether it settled by the evening.
              </p>
            </div>
          )}

          {!blockingRead && lowestRead && lowestRead.readiness <= 1 && (
            <div className="mt-4 rounded-[16px] p-4" style={{ background: 'var(--tint-cream)' }}>
              <div className="text-sm font-medium">
                Readiness was {tide[lowestRead.readiness]?.label.toLowerCase()} that day
              </div>
              <p className="mt-1 text-sm ink-2">
                The session was trimmed automatically before she started it — fewer sets and no load
                — so a full log here means she completed the trimmed version.
              </p>
            </div>
          )}

          {reviewPlan.length > 0 && (
            <ul className="mt-4 space-y-2">
              {reviewPlan.map((i) => (
                <li
                  key={i.itemId}
                  className="flex items-center gap-3.5 rounded-[16px] px-4 py-3"
                  style={{ background: 'var(--ghost)' }}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: 'var(--series-1)' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{i.exerciseName}</div>
                    {i.cues[0] && <div className="text-[11px] ink-2">{i.cues[0]}</div>}
                  </div>
                  <span
                    className="tnum shrink-0 rounded-[9px] px-2.5 py-1.5 text-xs font-medium whitespace-nowrap"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--series-1)',
                    }}
                  >
                    {i.sets} × {i.reps}
                    {i.targetLoadKg ? ` · ${i.targetLoadKg} kg` : ''}
                  </span>
                </li>
              ))}
              <li className="pt-1 text-xs ink-3">
                What she was prescribed. Which sets she ticked stays on her phone until set-by-set
                logs sync — this card does not guess at a per-movement verdict.
              </li>
            </ul>
          )}

          <div className="mt-6 border-t pt-5" style={{ borderColor: 'var(--border)' }}>
            <SessionResponse
              clientId={id}
              sessionId={review.id}
              sessionTitle={review.title}
              suggestions={suggestions}
            />
          </div>
        </Card>
      )}

      <Card
        title="Pain before and after"
        action={<span className="text-xs ink-3">Last 8 weeks</span>}
      >
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
              Set-by-set load and session RPE join this tab when per-set logs land. How much of each
              session she completed, and how long it took, are recorded now.
            </p>
          </>
        )}
      </Card>

      <ActivitiesCard activities={activities} link={stravaLink} />

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
                  <th className="pb-2 font-medium">Sets</th>
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
                      {/* Blank for sessions logged before the app sent its volume, rather
                          than a zero that would read as "she did nothing". */}
                      <td className="tnum py-2.5 ink-2">
                        {s.setsDone !== null && s.setsPlanned !== null
                          ? `${s.setsDone}/${s.setsPlanned}`
                          : '—'}
                      </td>
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
                {s.status === 'in_progress' && <StatusPill tone="warning">Started</StatusPill>}
                <StatusPill tone="neutral">{DISCIPLINE_LABEL[s.discipline]}</StatusPill>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
