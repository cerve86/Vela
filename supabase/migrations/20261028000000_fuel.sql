-- Phase 6 of the coaching-layer spec: fuel for today.
--
-- 1. A programme day can name its fuelling type (long, quality, easy, strength); left
--    empty, the app reads it from the discipline and title.
-- 2. The coach writes the fuelling and supplement cards; the app renders them. A card is
--    hers to edit, and a client reads only her own coach's published cards. Session cards
--    fall back to the defaults Vela ships from her framework; supplement cards show only
--    once she has published them.
-- 3. Per client: a restrictive-pattern flag hides every amount, and calorie tracking is a
--    choice, off unless the coach turns it on. Nothing logged is deleted.

alter table public.program_days
add column if not exists fuel_type text;

alter table public.program_days
add constraint program_days_fuel_type_known check (
  fuel_type is null
  or fuel_type in ('long', 'quality', 'easy', 'strength')
);

alter table public.clients
add column if not exists restrictive_pattern boolean not null default false,
add column if not exists calorie_tracking boolean not null default false;

comment on column public.clients.restrictive_pattern is 'Hide every amount (grams, kilocalories) from her fuelling and supplement cards.';

comment on column public.clients.calorie_tracking is 'Show the food diary, scanner and calorie ring. Off by default; nothing logged is deleted when it is off.';

create table public.fuel_cards (
  coach_id uuid not null references public.coaches (id) on delete cascade,
  key text not null,
  kind text not null check (kind in ('session', 'cue', 'supplement')),
  title text not null,
  -- Session cards: {before, during, after}; cue and supplement cards: {cue}. No numbers.
  face jsonb not null default '{}',
  -- The same keys with amounts, behind a tap; never shown to a restrictive-pattern client.
  detail jsonb not null default '{}',
  why text,
  evidence text check (
    evidence is null
    or evidence in ('strong', 'moderate')
  ),
  tag text,
  published boolean not null default false,
  sort integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (coach_id, key)
);

alter table public.fuel_cards enable row level security;

create policy fuel_cards_coach_all on public.fuel_cards for all using (coach_id = auth.uid ())
with
  check (coach_id = auth.uid ());

create policy fuel_cards_client_read on public.fuel_cards for
select
  using (
    published
    and exists (
      select 1
      from public.clients c
      where c.coach_id = fuel_cards.coach_id and c.profile_id = auth.uid ()
    )
  );

grant select, insert, update, delete on public.fuel_cards to authenticated;
