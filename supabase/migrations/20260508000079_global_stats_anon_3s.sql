-- The anon role has a 3-second statement_timeout in Supabase.
-- Mig 78 still timed out for anon callers because:
--   * `select created_at from pins order by created_at desc limit 1`
--     does a full sort on 2.5M rows (no index on created_at)
--   * the `count(*) from regions where exists (... pins ...)` had a
--     correlated subquery the planner didn't always short-circuit
--
-- Drop the timestamps + simplify region count. The fetched_at
-- timestamp on the client side gives the user the "as of" signal
-- — it's the wall clock at fetch time, which is good enough for
-- a stats display that updates daily.

drop function if exists public.global_stats();

create or replace function public.global_stats()
returns table (
  total_pins         bigint,
  total_species      int,
  total_regions      int,
  total_observations bigint
)
language sql
stable
security invoker
as $$
  select
    coalesce((select reltuples::bigint from pg_class where relname = 'pins'), 0) as total_pins,
    (select count(*)::int from public.species) as total_species,
    (select count(*)::int from public.regions) as total_regions,
    coalesce((select reltuples::bigint from pg_class where relname = 'observations'), 0) as total_observations;
$$;

grant execute on function public.global_stats() to anon, authenticated;
