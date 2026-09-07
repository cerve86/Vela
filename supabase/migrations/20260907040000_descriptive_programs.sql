-- Descriptive programmes: a programme that is a piece of text.
--
-- Not every plan is days of sets and reps. A physiotherapist often writes what to do as
-- prose — "three times this week, 20 minutes of walk-run, then the pelvic floor set" —
-- and the client reads it through. Such a programme has a body and no days; assigning it
-- puts nothing on the calendar, it puts the text on her phone.
alter table public.programs
  add column if not exists kind text not null default 'structured'
    check (kind in ('structured', 'descriptive')),
  add column if not exists body text;

-- A client reads the programme she is assigned — structured or descriptive — but no other.
-- The coach's own policy stays as it is; this only opens the one row to the one person.
drop policy if exists programs_client_read on public.programs;
create policy programs_client_read on public.programs for
select
  using (
    exists (
      select 1 from public.assignments a
      where a.program_id = programs.id and public.is_the_client (a.client_id)
    )
  );
