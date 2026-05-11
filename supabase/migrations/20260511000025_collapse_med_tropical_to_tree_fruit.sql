-- Collapse the `mediterranean_tropical_fruit` interest tag into
-- `tree_fruit`. The split was climate-based when the rest of the
-- interest-group taxonomy is craft / skill / plant-part-based
-- (nuts-easy vs nuts-intensive, mushrooms-beginner vs advanced),
-- and USDA-zone filtering already handles geography. A NY apple
-- forager who wants to opt out of tropical can do so via zone;
-- the asymmetric "opt INTO tropical but OUT of tree fruit" case
-- is vanishingly rare.
--
-- For every species tagged 'mediterranean_tropical_fruit':
--   1. Add 'tree_fruit' to interest_tags if not already there.
--   2. Remove 'mediterranean_tropical_fruit'.
--
-- User preferences live in user_species_preferences (per-species),
-- NOT as stored interest-group ids — so anyone who previously
-- toggled the Mediterranean & tropical group still has the
-- underlying species enabled via their per-species rows.
--
-- Idempotent: re-running this migration on already-merged data
-- is a no-op (the WHERE clause filters to rows that still have
-- the old tag).

update public.species
   set interest_tags = (
     select array_agg(distinct t)
       from unnest(
         array_append(
           array_remove(interest_tags, 'mediterranean_tropical_fruit'),
           'tree_fruit'
         )
       ) as t
   )
 where 'mediterranean_tropical_fruit' = any(interest_tags);
