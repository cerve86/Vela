-- Take the anonymous role off every table in `public`.
--
-- Probing the deployed project with the public anon key returned `[]` for sessions,
-- metrics, food_logs and nutrition_targets, rather than the `42501 permission denied`
-- that clients and profiles gave. Empty and denied look equally safe from outside, but
-- they are not the same: `[]` means anon holds SELECT and only row level security stood
-- between an anonymous caller and the health data. A hosted project applies its own
-- default privileges, so grants that were never written locally exist there.
--
-- The design has always been two independent layers — GRANTs decide table access, RLS
-- decides rows — and this restores the first one. Nothing anonymous is meant to read any
-- of this: the portal's sign-in page touches no table, and invite redemption happens
-- through auth and then a SECURITY DEFINER function.

revoke all on all tables in schema public from anon;

revoke all on all sequences in schema public from anon;

revoke all on all functions in schema public from anon;

-- Future tables must not quietly reacquire it. `alter default privileges` only affects
-- objects created afterwards, so this is the half that stops the problem recurring.
alter default privileges in schema public revoke all on tables from anon;

alter default privileges in schema public revoke all on sequences from anon;

alter default privileges in schema public revoke all on functions from anon;
