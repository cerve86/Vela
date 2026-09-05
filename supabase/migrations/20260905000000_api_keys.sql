-- Personal API keys, so a coach can let a tool act as her.
--
-- The import endpoint already accepts a coach's own Supabase session as a Bearer token,
-- and that is the right credential for a script that runs once. It is the wrong one for
-- anything that runs for weeks: an access token lasts an hour and the refresh token
-- rotates, so a Claude extension on the coach's laptop would have to keep a rotating
-- secret on disk and mint a new session every hour. A key is the boring answer. It is
-- long-lived, it can be named, it can be revoked without touching her sign-in, and the
-- portal shows her when it was last used.
--
-- Only the hash is stored. The key itself is shown once, at creation, and then exists
-- nowhere Vela can read it — the same discipline as invite tokens. A leaked database
-- row is therefore not a leaked credential.
--
-- A key grants exactly what the coach's session grants, no more: the portal resolves it
-- to a session for that coach and every query still goes through row level security as
-- her. There is no "API role" with its own policies to keep in step.
create table public.api_keys (
  id uuid primary key default gen_random_uuid (),
  coach_id uuid not null references public.coaches (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  /** sha256 of the full key, hex. Unique, so a lookup by hash names one coach. */
  key_hash text not null unique,
  /** The first characters of the key, so the coach can tell her keys apart in a list
      without the list being able to reconstruct any of them. */
  prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index api_keys_coach_idx on public.api_keys (coach_id);

comment on table public.api_keys is 'Long-lived credentials a coach mints for tools acting as her. Hash only; the key is shown once.';

alter table public.api_keys enable row level security;

-- The coach manages her own keys from the portal, as herself. Resolving a key on the
-- way in is done by the server with the service role, which bypasses this policy by
-- design — a caller presenting a key has no session yet to be filtered by.
create policy api_keys_own on public.api_keys for all using (coach_id = auth.uid ())
with
  check (coach_id = auth.uid ());

grant
select,
insert,
update,
delete on public.api_keys to authenticated;

-- The server resolves a presented key with the service role, which on this database is
-- an ordinary role with RLS bypass rather than a superuser: it still needs the grant, or
-- every key is refused with "permission denied" and the coach is told her key was
-- revoked. SELECT to find the row, UPDATE for last_used_at; nothing else.
grant
select,
update on public.api_keys to service_role;
