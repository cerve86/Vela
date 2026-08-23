-- Onboarding: remember that the welcome flow has been seen.
--
-- Kept on the client row rather than on the device so a reinstall or a second phone does
-- not walk somebody through the introduction again, and so the coach can tell the
-- difference between "invited and never opened it" and "in the app and started".

alter table public.clients
add column if not exists onboarded_at timestamptz;

comment on column public.clients.onboarded_at is 'When the client finished the welcome flow. Written only through mark_onboarded(); there is no policy permitting a client to set it directly.';

-- A function rather than an update policy, and the reason is the grant.
--
-- `authenticated` already holds table-wide UPDATE on public.clients for the coach's sake,
-- and RLS policies cannot restrict which columns an update touches. Adding a
-- "client may update her own row" policy would therefore hand every client write access to
-- coach_id, status and weeks_postpartum on her own record — she could reassign herself to
-- another physiotherapist. Column-level grants cannot fix it either, since privileges
-- attach to the role and the coach needs most of those columns.
--
-- Definer rights close the hole by removing the choice: this is the only path, it writes
-- one column, and the row it writes is fixed by auth.uid() rather than passed in.
create or replace function public.mark_onboarded () returns timestamptz language plpgsql security definer
set
  search_path = public,
  pg_temp as $$
declare
  stamp timestamptz;
begin
  -- coalesce keeps it idempotent: a second call returns the original moment rather than
  -- resetting it, so re-running the flow cannot rewrite when she actually started.
  update public.clients
     set onboarded_at = coalesce(onboarded_at, now())
   where profile_id = auth.uid()
  returning onboarded_at into stamp;

  return stamp;
end;
$$;

comment on function public.mark_onboarded () is 'Stamps the caller''s own client row as onboarded. Idempotent. Definer rights so no client-facing UPDATE policy on clients is needed.';

revoke all on function public.mark_onboarded ()
from
  public;

grant
execute on function public.mark_onboarded () to authenticated;
