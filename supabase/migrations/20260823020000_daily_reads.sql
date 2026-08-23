-- ---------------------------------------------------------------------------
-- The daily readiness read
-- ---------------------------------------------------------------------------

/**
 * Three reads a day, in fixed windows, each locked once submitted.
 *
 * The constraint is the feature. An open-ended mood log becomes a chore and then a lie —
 * entries drift toward whatever the person thinks she ought to feel, and a diary written
 * from memory at 9pm is worse than no diary. Three timestamped reads are enough to see a
 * pattern and few enough to stay honest.
 *
 * This existed only on the device until now, which cost two things: the coach could not see
 * any of it, and the client's own history vanished on reinstall. Readiness gates what the
 * app prescribes, so the one person qualified to judge whether that gating is working was
 * the one person who could not see the input.
 */
create type public.read_window as enum ('morning', 'midday', 'evening');

create table public.daily_reads (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  /** The local date as the phone saw it. See the note on the unique index. */
  read_on date not null,
  read_window public.read_window not null,
  /** 0-4, matching the five readiness steps in the shared tokens. */
  readiness smallint not null check (readiness between 0 and 4),
  /**
   * What she reported alongside the read.
   *
   * Kept per read rather than per day: symptoms change between morning and evening, and
   * collapsing them to one value a day would throw away the more useful half. The symptom
   * "in force" is simply the most recent read's.
   */
  symptom text not null default 'Nothing',
  created_at timestamptz not null default now()
);

/**
 * One read per window per day — the lock, enforced here rather than in the app.
 *
 * The column is `read_window`, not `window`: the latter is a reserved word in Postgres —
 * it introduces a window function — and an unquoted `window` column is a syntax error.
 *
 * `read_on` is the date the phone was living in, not a UTC derivation of the timestamp. A
 * client in Singapore logging an evening read at 21:00 local is on the previous UTC day,
 * and deriving the date server-side would file it under yesterday and let her log a second
 * evening read an hour later.
 */
create unique index daily_reads_one_per_window
  on public.daily_reads (client_id, read_on, read_window);

create index daily_reads_client_date_idx on public.daily_reads (client_id, read_on desc);

alter table public.daily_reads enable row level security;

/**
 * She owns her reads; her coach may read them.
 *
 * No update and no delete for anybody. A locked window that can be revised is not locked,
 * and a readiness history a coach can edit is not a record of what the client said.
 */
create policy daily_reads_client_read on public.daily_reads for
select
  using (public.is_the_client (client_id));

create policy daily_reads_client_write on public.daily_reads for insert
with
  check (public.is_the_client (client_id));

create policy daily_reads_coach_read on public.daily_reads for
select
  using (public.is_coach_of (client_id));

grant
select,
insert on public.daily_reads to authenticated;

/**
 * And explicitly take away the rest.
 *
 * This is not belt-and-braces, it is a correction. `alter default privileges in schema
 * public` (20260810020000) hands `authenticated` full DML on every table created
 * afterwards, so this table arrived with UPDATE and DELETE already granted and the `grant`
 * above changed nothing. Row level security still refused both — with no policy for them,
 * no row qualifies — but it refused them the quiet way: the statement succeeds and reports
 * zero rows affected rather than raising.
 *
 * For a locked record that is the wrong failure mode. An immutability guarantee that
 * depends solely on the continued absence of a policy is one careless `for all` away from
 * gone, and it would go silently. Revoking the privilege makes the attempt an error.
 */
revoke update,
delete on public.daily_reads from authenticated;
