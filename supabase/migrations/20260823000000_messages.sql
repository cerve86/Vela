-- ---------------------------------------------------------------------------
-- Messages between a client and her physiotherapist
-- ---------------------------------------------------------------------------

/**
 * One thread per client. There is no thread table and no participant table, because there
 * are only ever exactly two people in a conversation — a client and the coach who invited
 * her — and `client_id` already names both. Inventing a thread row would add a join and a
 * second place for the pairing to disagree with `clients.coach_id`.
 *
 * This ships as a table rather than as device storage, unlike the daily read. A readiness
 * note kept on the phone is merely incomplete; a message kept on the phone is a broken
 * promise — the client believes she has told her physiotherapist something, and she has
 * not. Either it reaches the coach or the feature should not exist.
 */
create table public.messages (
  id uuid primary key default gen_random_uuid (),
  client_id uuid not null references public.clients (id) on delete cascade,
  /**
   * Who wrote it, not who it is for. Stored rather than derived from the author's profile
   * so a thread still reads correctly after a coach account is closed and the profile row
   * is gone.
   */
  sender public.user_role not null,
  body text not null check (length(btrim(body)) between 1 and 4000),
  /**
   * The session this message is about, when it is about one.
   *
   * Nulled rather than cascaded on delete: the remark "this one hurt more than usual" is
   * still worth reading after the session row is gone, just without its attachment.
   */
  session_id uuid references public.sessions (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_client_time_idx on public.messages (client_id, created_at desc);

alter table public.messages enable row level security;

/**
 * Both sides read the whole thread; both write only as themselves.
 *
 * The `sender` check is what stops a client posting a message that appears to come from
 * her physiotherapist. Without it the column would be a decoration that anyone could set,
 * and clinical advice could be forged by the person receiving it.
 */
create policy messages_client_read on public.messages for
select
  using (public.is_the_client (client_id));

create policy messages_client_write on public.messages for insert
with
  check (
    public.is_the_client (client_id)
    and sender = 'client'
  );

create policy messages_coach_read on public.messages for
select
  using (public.is_coach_of (client_id));

create policy messages_coach_write on public.messages for insert
with
  check (
    public.is_coach_of (client_id)
    and sender = 'coach'
  );

/**
 * Marking as read is the only update either side may make, and only on the other party's
 * messages — nobody marks their own message read, and nobody edits a sent message. An
 * edited clinical instruction with no trace is worse than a wrong one.
 */
create policy messages_mark_read on public.messages
for update
  using (
    (public.is_the_client (client_id) and sender = 'coach')
    or (public.is_coach_of (client_id) and sender = 'client')
  )
with
  check (
    (public.is_the_client (client_id) and sender = 'coach')
    or (public.is_coach_of (client_id) and sender = 'client')
  );

grant
select,
insert,
update on public.messages to authenticated;
