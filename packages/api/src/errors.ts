/**
 * A database error, as a sentence a coach can act on.
 *
 * The driver's own words — "new row violates row-level security policy for table
 * programs" — are true and useless on a screen. The classes that reach a coach in
 * practice are few: not hers, still in use, already exists, or the database is away.
 * Anything else keeps its text, since a message that hides the cause is worse.
 */
export function friendlyError(message: string | null | undefined): string {
  const m = (message ?? '').trim();
  if (!m) return 'Something went wrong.';
  if (/row-level security|permission denied/i.test(m))
    return "That isn't yours to change. Sign in again if you think it should be.";
  if (/violates foreign key/i.test(m))
    return 'Something else still points at this; remove that first.';
  if (/duplicate key|already exists/i.test(m)) return 'There is already one with that name.';
  if (/violates check constraint/i.test(m)) return 'One of the values is out of range.';
  if (/fetch failed|ECONNREFUSED|network|timeout/i.test(m))
    return 'Could not reach the database. Try again in a moment.';
  if (/not authenticated|JWT|session/i.test(m)) return 'Your session has ended. Sign in again.';
  return m;
}
