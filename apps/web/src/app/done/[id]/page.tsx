import { getSession, getSessionPlan } from '@vela/api';
import { adminClient, clientAsUser } from '@/lib/impersonate';
import { DoneForm } from './DoneForm';

export const metadata = { title: 'Mark as done — Vela' };

/**
 * /done/{session}?t={calendar token} — the page behind a calendar entry's link.
 *
 * Public by URL, private by token: the token resolves to the client and the session is
 * read as her, so a guessed session id shows nothing. A confirmation button rather than
 * completing on GET, because link previews and mail scanners fetch URLs and a session
 * must not be logged by a robot reading her calendar.
 */
export default async function DonePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { id } = await params;
  const { t: token = '' } = await searchParams;

  const admin = adminClient();
  const row =
    admin && /^[0-9a-f]{48}$/.test(token)
      ? (
          await admin
            .from('calendar_tokens')
            .select('profile_id, revoked_at')
            .eq('token', token)
            .maybeSingle()
        ).data
      : null;
  const asUser = row && !row.revoked_at ? await clientAsUser(row.profile_id) : null;
  const session = asUser ? await getSession(asUser, id) : null;
  const plan = asUser && session ? await getSessionPlan(asUser, id) : [];

  return (
    <main className="mx-auto max-w-lg p-6 sm:p-10">
      {!session ? (
        <div className="surface rounded-[20px] p-6" style={{ background: 'var(--surface)' }}>
          <h1 className="display-face text-xl font-semibold">This link does not open a session</h1>
          <p className="mt-2 text-sm ink-2">
            It may have been replaced by a newer calendar link. Open the Vela app, go to Profile,
            and add the calendar again.
          </p>
        </div>
      ) : (
        <DoneForm
          sessionId={session.id}
          token={token}
          title={session.title}
          date={session.scheduledDate}
          completed={session.status === 'completed'}
          items={plan.map((i) => ({
            name: i.exerciseName,
            dose: `${i.sets} × ${i.reps}${i.targetLoadKg ? ` · ${i.targetLoadKg} kg` : ''}`,
          }))}
        />
      )}
    </main>
  );
}
