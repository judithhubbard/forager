-- Raise the per-fetch row caps on the bbox RPCs. Dense urban areas
-- (Ithaca: Cornell campus + Cornell Botanic Garden + downtown city
-- trees, ≈13k pins inside a single zoom-13 bbox) hit the prior
-- 1000/2000 hard caps and the user saw different tree subsets at
-- different zoom levels because each fetch returned a different
-- "newest 1000" slice.
--
-- New hard caps:
--   public_pins_bbox: 2500 (was 1000)
--   region_pins_bbox: 2500 (was 2000)
-- Client-side caps already scale with zoom (1000/1500/2000-2500
-- at zoom 13/14/16+).
--
-- Performance: 2500 rows from a slim view + GIST bbox is fast
-- (~50-150ms). The order-by-created_at stays so the response is
-- stable across pans within a session.

-- public_pins_bbox: bump hard cap from 1000 to 2500.
-- Keep all the slim-row defaults from migration 18 (this is the
-- post-fast-public-bbox version).
create or replace function public.public_pins_bbox(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_max_rows int default 500
)
returns setof public.v_pin_effective
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.region_id, p.created_by, p.created_at, p.updated_at,
    p.species_id, p.display_name, p.location_accuracy_m,
    p.location_modified_by_user_at, p.status, p.notes,
    p.import_source, p.import_external_id,
    p.last_observed_at, p.last_observed_stage,
    p.visibility, p.access_status,
    p.status                       as effective_status,
    'America/New_York'::text       as region_timezone,
    false                          as is_edible_now,
    false                          as is_edible_strict,
    ST_X(p.location::geometry)     as lng,
    ST_Y(p.location::geometry)     as lat,
    false                          as is_inaccessible,
    false                          as has_ripe_observation_this_year,
    p.has_ripe_observation_ever    as has_ripe_observation_ever,
    null::int                      as best_harvest_quality,
    cz.code                        as climate_zone_code
  from public.pins p
  left join public.climate_zones cz on cz.id = p.climate_zone_id
  where p.visibility = 'public'
    and p.location && ST_MakeEnvelope(
          p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
        )
  order by p.created_at desc
  limit greatest(1, least(p_max_rows, 2500));
$$;

-- region_pins_bbox: bump hard cap from 2000 to 2500.
create or replace function public.region_pins_bbox(
  p_region_id uuid,
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_max_rows int default 1000
)
returns setof public.v_pin_effective
language sql
stable
security invoker
as $$
  select v.*
    from public.v_pin_effective v
   where v.region_id = p_region_id
     and v.lng between p_min_lng and p_max_lng
     and v.lat between p_min_lat and p_max_lat
   order by v.created_at desc
   limit greatest(1, least(p_max_rows, 2500));
$$;

grant execute on function public.region_pins_bbox(
  uuid, double precision, double precision, double precision, double precision, int
) to authenticated;
