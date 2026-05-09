-- Replace observations + regions with a more meaningful "cities"
-- count: distinct import_source values from pins. That's roughly
-- "how many open municipal / academic datasets are contributing
-- pins to the public layer." Reads as a tangible number for a
-- visitor; the regions table is a mixed admin bag and the
-- observations count is tiny + embarrassing.

drop function if exists public.global_stats();

create or replace function public.global_stats()
returns table (
  total_pins    bigint,
  total_species int,
  total_cities  int
)
language sql
stable
security invoker
as $$
  select
    coalesce((select reltuples::bigint from pg_class where relname = 'pins'), 0) as total_pins,
    (select count(*)::int from public.species) as total_species,
    -- count(distinct import_source) over 2.5M pins is too slow for
    -- the anon 3s timeout; use the import_sources registry instead
    -- (one row per ingested dataset, ~83 rows today).
    (select count(*)::int from public.import_sources) as total_cities;
$$;

grant execute on function public.global_stats() to anon, authenticated;
