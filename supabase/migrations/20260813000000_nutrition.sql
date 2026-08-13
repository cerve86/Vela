-- Nutrition: coach-set targets with history, a shared food table, and a diary.

-- ---------------------------------------------------------------------------
-- Targets
-- ---------------------------------------------------------------------------

/**
 * Targets are versioned by effective date, never edited in place.
 *
 * A coach who lowers a target in March must not silently rewrite February's adherence.
 * The row that applies to a given day is the latest one whose effective_from is on or
 * before it, which is what `nutrition_target_on` resolves.
 */
create table public.nutrition_targets (
  id uuid primary key default uuid_generate_v4 (),
  client_id uuid not null references public.clients (id) on delete cascade,
  coach_id uuid not null references public.coaches (id) on delete cascade,
  effective_from date not null,
  kcal int not null check (kcal between 800 and 6000),
  protein_g int not null check (protein_g between 0 and 400),
  carbs_g int not null check (carbs_g between 0 and 800),
  fat_g int not null check (fat_g between 0 and 300),
  note text,
  created_at timestamptz not null default now(),
  unique (client_id, effective_from)
);

create index nutrition_targets_client_idx
  on public.nutrition_targets (client_id, effective_from desc);

alter table public.nutrition_targets enable row level security;

create policy nutrition_targets_coach on public.nutrition_targets for all using (
  public.is_coach_of (client_id)
)
with
  check (public.is_coach_of (client_id));

-- The client reads her target so the app can draw it, but never sets it herself.
create policy nutrition_targets_client_read on public.nutrition_targets for
select
  using (public.is_the_client (client_id));

grant
select,
insert,
update,
delete on public.nutrition_targets to authenticated;

-- ---------------------------------------------------------------------------
-- Foods
-- ---------------------------------------------------------------------------

create type public.food_source as enum ('off', 'custom');

/**
 * A food, stored per 100 g so any portion can be derived.
 *
 * Two kinds of row live here. `off` rows are cached facts about a barcoded product from
 * Open Food Facts, owned by nobody and readable by everyone — caching them means a
 * second scan of the same tin needs no network. `custom` rows belong to the coach who
 * created them, which is how she adds the things her clients actually eat that no
 * database has ever heard of.
 */
create table public.foods (
  id uuid primary key default uuid_generate_v4 (),
  coach_id uuid references public.coaches (id) on delete cascade,
  source public.food_source not null,
  barcode text,
  name text not null check (length(trim(name)) > 0),
  brand text,
  /** What one "serving" means for this food, e.g. "1 pot (150 g)". */
  serving_name text,
  serving_g numeric(8, 2) check (serving_g is null or serving_g > 0),
  kcal_100g numeric(8, 2) not null check (kcal_100g >= 0),
  protein_100g numeric(8, 2) not null default 0 check (protein_100g >= 0),
  carbs_100g numeric(8, 2) not null default 0 check (carbs_100g >= 0),
  fat_100g numeric(8, 2) not null default 0 check (fat_100g >= 0),
  created_at timestamptz not null default now(),
  -- An Open Food Facts row is a public product fact and has no owner; a custom food
  -- without an owner would be unreachable for editing.
  constraint foods_ownership check (
    (source = 'off' and coach_id is null and barcode is not null)
    or (source = 'custom' and coach_id is not null)
  )
);

-- One cached row per product. Partial, because custom foods have no barcode and several
-- coaches may each invent their own "porridge".
create unique index foods_barcode_unique on public.foods (barcode) where source = 'off';

create index foods_name_idx on public.foods using gin (to_tsvector('simple', name || ' ' || coalesce(brand, '')));

alter table public.foods enable row level security;

/**
 * Reads: cached product facts, plus the custom foods belonging to your side of the
 * relationship.
 *
 * The client clause is not optional. Her coach adds "porridge the way Marta makes it"
 * precisely so she can log it, and a policy that only matched `coach_id = auth.uid()`
 * left every one of those foods invisible to the only person meant to eat them — the
 * search box returned nothing and looked merely empty.
 */
create policy foods_read on public.foods for
select
  using (
    source = 'off'
    or coach_id = auth.uid()
    or coach_id = (select c.coach_id from public.clients c where c.profile_id = auth.uid())
  );

-- Anyone may cache a scanned product. A client scanning a tin is the common case, and
-- the row carries no personal information — only what is printed on the label.
create policy foods_cache_insert on public.foods for insert
with
  check (source = 'off' and coach_id is null);

create policy foods_coach_write on public.foods for all using (
  coach_id = auth.uid()
)
with
  check (coach_id = auth.uid());

grant
select,
insert,
update,
delete on public.foods to authenticated;

-- ---------------------------------------------------------------------------
-- The diary
-- ---------------------------------------------------------------------------

create type public.meal_slot as enum ('breakfast', 'lunch', 'dinner', 'snack');

create type public.food_log_source as enum ('barcode', 'search', 'custom', 'quick');

/**
 * One entry in a client's food diary.
 *
 * The macros are copied onto the row rather than joined from `foods` every time. If a
 * coach corrects a food's values next month, last month's diary — and every adherence
 * number computed from it — must stay exactly as it was recorded. `food_id` is kept for
 * provenance and set to null if the food is deleted, which is why `description` is not
 * nullable.
 */
create table public.food_logs (
  id uuid primary key default uuid_generate_v4 (),
  client_id uuid not null references public.clients (id) on delete cascade,
  logged_on date not null,
  meal public.meal_slot not null,
  food_id uuid references public.foods (id) on delete set null,
  description text not null check (length(trim(description)) > 0),
  quantity_g numeric(8, 2) check (quantity_g is null or quantity_g > 0),
  kcal numeric(8, 2) not null check (kcal >= 0),
  protein_g numeric(8, 2) not null default 0 check (protein_g >= 0),
  carbs_g numeric(8, 2) not null default 0 check (carbs_g >= 0),
  fat_g numeric(8, 2) not null default 0 check (fat_g >= 0),
  source public.food_log_source not null,
  created_at timestamptz not null default now()
);

create index food_logs_client_day_idx on public.food_logs (client_id, logged_on desc);

alter table public.food_logs enable row level security;

create policy food_logs_client_all on public.food_logs for all using (
  public.is_the_client (client_id)
)
with
  check (public.is_the_client (client_id));

-- The coach reads the diary but never writes it. What a client ate is her account of
-- her own day, and a coach editing it silently would make the record worthless.
create policy food_logs_coach_read on public.food_logs for
select
  using (public.is_coach_of (client_id));

grant
select,
insert,
update,
delete on public.food_logs to authenticated;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

/** The target in force on a given day, or null if the coach has never set one. */
create or replace function public.nutrition_target_on (p_client uuid, p_on date) returns public.nutrition_targets language sql stable
set
  search_path = public as $$
  select t.*
  from public.nutrition_targets t
  where t.client_id = p_client
    and t.effective_from <= p_on
  order by t.effective_from desc
  limit 1;
$$;

grant
execute on function public.nutrition_target_on (uuid, date) to authenticated;

/**
 * Daily totals against the target in force on each day.
 *
 * Computed in the database because the target changes over the window: doing this in
 * the client would mean shipping the whole target history and re-deriving it in two
 * places, and the app and the portal disagreeing about adherence is the one thing this
 * table exists to prevent.
 *
 * Days with no entries are returned with zero totals rather than omitted — "she logged
 * nothing" is a finding, and a gap in the series would read as missing data instead.
 *
 * Refuses outright rather than returning a window of zeros for somebody else's client:
 * RLS would already empty the totals, but "all zeros" and "not yours" must not look the
 * same to a caller.
 */
create or replace function public.nutrition_days (p_client uuid, p_from date, p_to date) returns table (
  day date,
  kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  entries int,
  target_kcal int,
  target_protein_g int
) language plpgsql stable
set
  search_path = public as $$
begin
  if not (public.is_the_client(p_client) or public.is_coach_of(p_client)) then
    raise exception 'not permitted to read this diary' using errcode = '42501';
  end if;

  return query
  select
    d.day::date,
    coalesce(sum(l.kcal), 0) as kcal,
    coalesce(sum(l.protein_g), 0) as protein_g,
    coalesce(sum(l.carbs_g), 0) as carbs_g,
    coalesce(sum(l.fat_g), 0) as fat_g,
    count(l.id)::int as entries,
    (public.nutrition_target_on(p_client, d.day::date)).kcal as target_kcal,
    (public.nutrition_target_on(p_client, d.day::date)).protein_g as target_protein_g
  from generate_series(p_from, p_to, interval '1 day') as d (day)
  left join public.food_logs l
    on l.client_id = p_client and l.logged_on = d.day::date
  group by d.day
  order by d.day;
end;
$$;

grant
execute on function public.nutrition_days (uuid, date, date) to authenticated;
