-- Table privileges.
--
-- Postgres needs BOTH of these and they answer different questions:
--   GRANT — may this role touch the table at all?
--   RLS   — which rows of it may they see?
--
-- Without the grants below every query returns "permission denied", which in an app
-- that swallows errors looks exactly like a correctly-empty result. Worse, an isolation
-- test asserting "the other client sees zero rows" passes for the wrong reason — it
-- passes because *nobody* can see anything. So the grants are deliberately explicit,
-- and the isolation tests assert a positive case alongside every negative one.
--
-- anon deliberately gets nothing. The only thing an unauthenticated caller may do is
-- call peek_client_invite, which is SECURITY DEFINER and returns a fixed, narrow shape.

-- Profiles: read and amend your own; the coach-reads-client policy widens SELECT.
grant
select,
update on public.profiles to authenticated;

grant
select,
insert,
update on public.coaches to authenticated;

grant
select,
insert,
update,
delete on public.clients to authenticated;

grant
select,
insert,
update on public.client_invites to authenticated;

grant
select,
insert,
update on public.consents to authenticated;

grant
select,
insert on public.audit_log to authenticated;

-- audit_log.id is a bigserial, so inserts need the sequence too.
grant usage,
select on all sequences in schema public to authenticated;

-- Future tables in this schema should inherit the same baseline rather than relying on
-- someone remembering to add a grant alongside each new migration.
alter default privileges in schema public
grant
select,
insert,
update,
delete on tables to authenticated;

alter default privileges in schema public
grant usage,
select on sequences to authenticated;

revoke all on all tables in schema public
from
  anon;
