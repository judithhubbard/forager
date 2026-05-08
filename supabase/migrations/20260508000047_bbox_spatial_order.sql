-- Bbox RPCs: switch from `order by created_at desc` to a stable
-- pseudo-random order. When the result-set hits the row cap, the
-- old ordering returned only the newest pins — geographically the
-- last few imports clustered (e.g. Edmonton, Calgary, NYC redo)
-- and shoved older imports below the cap, so areas with only
-- older imports rendered empty even though we had pins there.
-- A pseudo-random order distributes the cap evenly across the
-- viewport's pins regardless of import age.
--
-- Order key: hashtextextended(p.id::text, 0). Stable across calls
-- (same pin always sorts to the same position) so the user gets
-- a stable result set within a session — no flicker as the cap-
-- threshold pins shuffle. hashtextextended is a 64-bit hash; the
-- distribution is ~uniform across uuid space, which means picking
-- the first 2500 by hash gives an approximately spatially
-- uniform sample.

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
  order by hashtextextended(p.id::text, 0)
  limit greatest(1, least(p_max_rows, 2500));
$$;

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
   order by hashtextextended(v.id::text, 0)
   limit greatest(1, least(p_max_rows, 2500));
$$;

grant execute on function public.region_pins_bbox(
  uuid, double precision, double precision, double precision, double precision, int
) to authenticated;
