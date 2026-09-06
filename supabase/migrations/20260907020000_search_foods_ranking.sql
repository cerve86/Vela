-- Food search, ranked the way a food name reads.
--
-- Term-frequency ranking (ts_rank_cd) put "Rice cake, cracker (include hain mini rice
-- cakes)" above "Wild rice, raw" and "Bagels, egg" above "Egg, whole, raw": it rewards a
-- word that repeats and a name that is short. A USDA name leads with the head noun and
-- adds qualifiers after commas, so what a typed word means is the food whose head is that
-- word, in its plainest form. USDA sometimes leads with a category instead — "Fish,
-- salmon, …", "Nuts, almonds", "Beverages, coffee, brewed" — so a leading category word
-- is skipped when reading the head. Five tiers, then the plainness boost (which also
-- lifts a short list of staples, see scripts/usda-foods-migration.py) as the tie-breaker:
--   5  the head is exactly the query — "Egg, whole, raw", "Milk, whole", "Fish, salmon,
--      chinook, raw"; or the first two parts are — "Chicken, breast, meat only, raw"; or
--      an alias is — courgette, oatmeal, chicken fillet
--   4  the head's first word is the query's first word and every query word is in the
--      head phrase (the first two parts) — "Milk shakes, thick chocolate"
--   3  every query word is in the head phrase — "Sweet potato leaves, raw"
--   2  every query word is somewhere in the name, aliases or brand — "Bagels, egg", and
--      an alias hit such as courgette → zucchini
--   1  a prefix hit only — "Eggnog" for "egg", so as-you-type still finds things
-- Baby food, fast food, restaurant and brand-led entries ("BURGER KING, Cheeseburger")
-- never rise above tier 2: "oatmeal" is porridge, not a toddler cereal, however the name
-- is phrased.
-- The prefix query keeps using the GIN index to find the candidates; the tiers are
-- worked out on those rows only.
create or replace function public.search_foods (p_query text, p_limit int default 20)
  returns setof public.foods
  language sql
  stable
as $$
  with words as (
    select w, n from regexp_split_to_table(lower(coalesce(p_query, '')), '\s+') with ordinality as t (w, n)
    where w <> '' order by n limit 6
  ),
  q as (
    select
      to_tsquery('english', string_agg(w || ':*', ' & ' order by n)) as pre,
      plainto_tsquery('english', coalesce(p_query, '')) as ex,
      plainto_tsquery('english', (select w from words order by n limit 1)) as first
    from words
  ),
  hits as (
    select f.id,
      case
        when numnode(q.ex) = 0 then 1
        when lower(split_part(f.name, ',', 1)) in ('babyfood', 'fast foods', 'restaurant')
          or split_part(f.name, ',', 1) ~ '^[A-Z][A-Z''&. -]+$'
          then (case when f.search @@ q.ex then 2 else 1 end)
        when (h.head1 @@ q.ex and array_length(tsvector_to_array(h.head1), 1) = (numnode(q.ex) + 1) / 2)
          or (h.head2 @@ q.ex and array_length(tsvector_to_array(h.head2), 1) = (numnode(q.ex) + 1) / 2)
          or exists (
            select 1 from unnest(f.aliases) a
            where to_tsvector('english', a) @@ q.ex
              and array_length(tsvector_to_array(to_tsvector('english', a)), 1) = (numnode(q.ex) + 1) / 2
          ) then 5
        when h.head2 @@ q.ex and numnode(q.first) > 0 and h.lead @@ q.first then 4
        when h.head2 @@ q.ex then 3
        when f.search @@ q.ex then 2
        else 1
      end as tier
    from public.foods f
    cross join q
    cross join lateral (
      select case
        when lower(split_part(f.name, ',', 1)) in ('fish', 'crustaceans', 'mollusks', 'nuts', 'seeds',
          'beverages', 'snacks', 'spices', 'soup', 'sauce', 'candies', 'cereals', 'cereals ready-to-eat',
          'game meat', 'babyfood', 'fast foods', 'restaurant', 'alcoholic beverage')
        then 2 else 1 end as skip
    ) c
    cross join lateral (
      select
        to_tsvector('english', split_part(f.name, ',', c.skip)) as head1,
        to_tsvector('english', split_part(f.name, ',', c.skip) || ' ' || split_part(f.name, ',', c.skip + 1)) as head2,
        to_tsvector('english', substring(split_part(f.name, ',', c.skip) from '[A-Za-z]+')) as lead
    ) h
    where q.pre is not null and f.search @@ q.pre
  )
  select f.*
  from public.foods f
  join hits h on h.id = f.id
  order by h.tier desc, f.rank_boost desc, f.name
  limit greatest(1, least(coalesce(p_limit, 20), 50));
$$;
