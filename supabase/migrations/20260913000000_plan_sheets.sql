-- Plan sheets: a fifth discipline, and a client may read the notes of her own days.
--
-- A physiotherapist's weekly plan has cross-training days — a spin, a swim, Pilates —
-- that are neither a run nor mobility work. And a day from such a plan is often a
-- sentence rather than a list of movements ("60 min · 4 blocks of ~15 min, run 5 /
-- walk 1"), which lives in program_days.notes; the client has to be able to read that
-- for the day she has been given, and nothing else of the programme.

alter table public.program_days
  drop constraint if exists program_days_discipline_check;

alter table public.program_days
  add constraint program_days_discipline_check
  check (discipline in ('strength', 'run', 'mobility', 'rehab', 'cross'));

-- Her own days only: the ones a session of hers points at. Template work and other
-- clients' programmes stay closed, as before.
create policy program_days_client_read on public.program_days for
select
  using (
    exists (
      select
        1
      from
        public.sessions s
      where
        s.program_day_id = program_days.id
        and public.is_the_client (s.client_id)
    )
  );
