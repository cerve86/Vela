-- A generic-foods reference, and full-text search over every food.
--
-- Until now a client describing what she ate could only find foods her coach had typed
-- in, or packaged products she had scanned. The reference that arrives in the next
-- migration is the USDA Standard Reference (release 28): 8,789 generic foods with
-- nutrients per 100 g, household portions ("1 large egg = 50 g") and search aliases
-- covering UK, Australian and Indian vocabulary. Public domain, no obligations.
--
-- This migration is the shape; the data follows separately because a new enum value
-- cannot be used in the transaction that adds it.

alter type public.food_source add value if not exists 'usda';

alter table public.foods
add column if not exists ndb_no text unique,
add column if not exists food_group text,
add column if not exists rank_boost real not null default 1,
add column if not exists aliases text[] not null default '{}';

comment on column public.foods.ndb_no is 'USDA identifier. The join key when the reference is refreshed; null for anything not from USDA.';
comment on column public.foods.rank_boost is 'Search relevance multiplier: whole-food staples above brand SKUs, baby food and restaurant items.';

-- array_to_string is only STABLE in Postgres, and a generated column needs IMMUTABLE.
-- For a text[] joined by a space the result never depends on anything but its input,
-- so a wrapper that says so is honest.
create or replace function public.join_words (p text[]) returns text language sql immutable parallel safe as $$
  select array_to_string(p, ' ')
$$;

-- One search column over name, aliases and brand, weighted in that order, kept up to
-- date by the database. A coach's custom "porridge the way Marta makes it" and a USDA
-- "Oats, regular" are found the same way.
alter table public.foods
add column if not exists search tsvector generated always as (
  setweight(to_tsvector('english'::regconfig, coalesce(name, '')), 'A')
  || setweight(to_tsvector('english'::regconfig, coalesce(public.join_words(aliases), '')), 'B')
  || setweight(to_tsvector('english'::regconfig, coalesce(brand, '')), 'C')
) stored;

create index if not exists foods_search_idx on public.foods using gin (search);

-- Household portions: what "one" of this food weighs.
create table if not exists public.food_portions (
  id uuid primary key default gen_random_uuid (),
  food_id uuid not null references public.foods (id) on delete cascade,
  seq int not null default 0,
  label text not null,
  gram_weight numeric(8, 2) not null check (gram_weight > 0)
);

create index if not exists food_portions_food_idx on public.food_portions (food_id, seq);

alter table public.food_portions enable row level security;

-- Readable wherever the food is: the portion policy defers to the food's own read policy.
create policy food_portions_read on public.food_portions for
select
  using (exists (select 1 from public.foods f where f.id = food_id));

grant
select on public.food_portions to authenticated;

/**
 * Search foods as she types.
 *
 * Words become prefix terms joined with AND, so "chick br" finds chicken breast. Ranking
 * is text relevance times the food's boost — staples first, brand SKUs after. Runs as the
 * caller, so the foods read policy decides what is visible. Input is sanitised here:
 * nothing a person types should be able to break the query.
 */
create or replace function public.search_foods (p_query text, p_limit int default 20) returns setof public.foods language sql stable as $$
  with words as (
    select w from regexp_split_to_table(regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9 ]+', ' ', 'g'), '\s+') w
    where length(w) > 0
    limit 6
  ),
  q as (
    select to_tsquery('english', string_agg(w || ':*', ' & ')) as tsq from words
  )
  select f.*
  from public.foods f, q
  where q.tsq is not null and f.search @@ q.tsq
  order by ts_rank_cd(f.search, q.tsq) * f.rank_boost desc, f.name
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;

revoke all on function public.search_foods (text, int) from public;

grant
execute on function public.search_foods (text, int) to authenticated;
