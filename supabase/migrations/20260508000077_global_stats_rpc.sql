-- Aggregate "scope of the dataset" counts for display on the About
-- page and welcome flow. Uses pg_class.reltuples for the fast pin
-- count — the table has 2M+ rows and an exact count(*) is a 100-300ms
-- seqscan, which would chew network on every welcome view. reltuples
-- updates after each ANALYZE / autovacuum (typically every few hours
-- in Supabase) so the number shifts only as the dataset grows, not
-- on every UI view.
--
-- Returned as a single row so PostgREST can serve it via .rpc()
-- without a body.

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
    -- Fast approximate row count. After ANALYZE this is within
    -- ~5% of the true count — fine for a "X million pins" headline.
    coalesce((select reltuples::bigint from pg_class where relname = 'pins'), 0) as total_pins,
    (select count(distinct species_id)::int from public.pins where species_id is not null) as total_species,
    (select count(distinct region_id)::int  from public.pins where region_id is not null)  as total_regions,
    coalesce((select reltuples::bigint from pg_class where relname = 'observations'), 0) as total_observations,
    (select max(created_at) from public.pins) as last_pin_at,
    (select max(created_at) from public.observations) as last_observation_at;
$$;

grant execute on function public.global_stats() to anon, authenticated;
