-- Faster global_stats(). Earlier version did count(distinct species_id)
-- and count(distinct region_id) over 2.5M+ pins, which seqscan-summed
-- past the 2-min statement timeout. Fixes:
-- * total_species → count(*) from public.species (small table, ~170)
-- * total_regions → count(*) from public.regions where any pin exists
-- * total_pins / total_observations stay on pg_class.reltuples
-- * Keep the last_pin_at / last_observation_at probes as fast index
--   max() lookups (pins has pkey on id but not created_at; use a
--   limit-1 reverse-order scan instead).

create or replace function public.global_stats()
returns table (
  total_pins             bigint,
  total_species          int,
  total_regions          int,
  total_observations     bigint,
  last_pin_at            timestamptz,
  last_observation_at    timestamptz
)
language sql
stable
security invoker
as $$
  select
    coalesce((select reltuples::bigint from pg_class where relname = 'pins'), 0) as total_pins,
    (select count(*)::int from public.species) as total_species,
    (select count(*)::int from public.regions
       where exists (select 1 from public.pins p where p.region_id = regions.id limit 1)
    ) as total_regions,
    coalesce((select reltuples::bigint from pg_class where relname = 'observations'), 0) as total_observations,
    (select created_at from public.pins order by created_at desc limit 1) as last_pin_at,
    (select created_at from public.observations order by created_at desc limit 1) as last_observation_at;
$$;

grant execute on function public.global_stats() to anon, authenticated;
