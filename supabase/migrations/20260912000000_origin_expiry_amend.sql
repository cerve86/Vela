-- Four small things the evaluation asked for.
--
-- 1. Origin. A message, a weekly plan or an audit row written through a personal API key
--    was indistinguishable from one the coach wrote herself in the portal. `via` says
--    which: the phone app, the portal, or her assistant acting with her key.
alter table public.messages
  add column if not exists via text not null default 'app'
    check (via in ('app', 'portal', 'assistant'));
alter table public.client_plans
  add column if not exists via text not null default 'portal'
    check (via in ('portal', 'assistant'));
alter table public.audit_log
  add column if not exists via text not null default 'portal';

-- 2. Keys expire. Six months by default; the portal shows when, and a new key is a click.
alter table public.api_keys
  add column if not exists expires_at timestamptz;
update public.api_keys set expires_at = created_at + interval '180 days' where expires_at is null;

-- 3. A read can be changed for fifteen minutes after it was locked — a mis-tap is a
--    mis-tap — and not after, so the three-a-day cap keeps meaning what it means.
drop policy if exists daily_reads_client_amend on public.daily_reads;
create policy daily_reads_client_amend on public.daily_reads for update
  using (public.is_the_client (client_id) and created_at > now() - interval '15 minutes')
  with check (public.is_the_client (client_id));
grant update (readiness, symptom) on public.daily_reads to authenticated;
