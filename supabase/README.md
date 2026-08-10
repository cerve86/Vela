# Supabase

## Prerequisites (not yet installed on this machine)

The local stack needs both of these — neither is present yet:

```bash
brew install supabase/tap/supabase
```

Docker Desktop is also required for `supabase start` (the local stack runs Postgres,
GoTrue, Storage and the rest in containers). Install it from docker.com, or skip the
local stack entirely and develop against a hosted project.

## Creating the hosted project

Region **must** be EU — Frankfurt (`eu-central-1`). This is a GDPR requirement for
Article 9 health data, not a preference, and the region cannot be changed after the
project is created.

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

## Layout

| Path | Purpose |
|---|---|
| `migrations/` | Forward-only SQL. Never edit a migration that has been pushed; add a new one. |
| `tests/` | pgTAP tests. `rls_isolation_test.sql` is the executable form of checkpoint CP1. |
| `functions/` | Edge Functions — nightly rollups, data export, account deletion. |

## Running the tests

```bash
supabase test db
```

CP1 is not complete until this passes. It asserts that two clients cannot see each
other, that a coach cannot see another coach's clients, and that an anonymous caller
sees nothing at all.

## Rules

- RLS is enabled on **every** table, with no permissive default. A table with no policy
  returns zero rows — the correct failure mode for clinical data.
- Every table carries `coach_id` (directly or through `clients`) so tenancy holds from
  the first migration.
- Never edit schema through the Supabase dashboard. It drifts from `migrations/` and
  the drift is invisible until a deploy fails.
- No real client data in local or staging environments. Seed fake data only.
