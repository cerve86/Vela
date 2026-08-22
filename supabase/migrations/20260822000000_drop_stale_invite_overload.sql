-- ---------------------------------------------------------------------------
-- One create_client_invite, not two
-- ---------------------------------------------------------------------------

/**
 * The postpartum migration added an eight-argument create_client_invite whose last three
 * parameters carry defaults. It used `create or replace`, which replaces a function of the
 * SAME signature — and a different argument list is a different signature, so the original
 * five-argument version was left in place beside it rather than superseded.
 *
 * Both then matched any five-argument call, and Postgres will not guess:
 *
 *   Could not choose the best candidate function between:
 *     public.create_client_invite(p_email => text, ..., p_goal => text),
 *     public.create_client_invite(p_email => text, ..., p_breastfeeding => boolean)
 *
 * Which broke inviting a client from the portal completely, because `createInvite` sends
 * exactly those five arguments and lets the postpartum context fall to its defaults.
 *
 * It survived to production because the one automated exercise of this path — the demo
 * seed — passes all eight arguments explicitly. Eight arguments match the new function
 * uniquely, so the seed resolved cleanly every time while the only shape the application
 * actually sends was ambiguous. The accompanying test now asserts the arity the portal
 * uses, and that exactly one such function exists.
 *
 * Dropping the old one leaves the eight-argument version as the sole candidate; its
 * defaults make it a superset, so five-argument callers keep working unchanged.
 */
drop function if exists public.create_client_invite (text, text, text, text, text);
