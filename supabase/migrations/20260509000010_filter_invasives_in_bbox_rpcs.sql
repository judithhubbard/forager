-- Filter inedible-invasive species (is_forageable = false) out of the
-- public bbox + summary RPCs by default. Only fetch them when the
-- caller explicitly asks via p_include_invasives = true (the client
-- passes settings.showInvasives, defaulting to false).
--
-- Why: ~104k of our ~2.7M public pins are inedible-invasives (78k
-- Norway maple alone, 22k callery pear). They're already hidden
-- client-side unless showInvasives is on, but the server still
-- returned them — meaning every dense-Ontario-city bbox was paying
-- the dedup + transit cost. After this change those rows are dropped
-- before dedup, cutting Hamilton/Toronto bbox latency proportionally.
--
-- Adding the parameter at the END of the signature so existing client
-- callsites (without the flag) continue to work and default to
-- include=false (filtered).

create or replace function public.public_pins_bbox(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_max_rows int default 500,
  p_zoom int default 18,
  p_include_invasives boolean default false
)
returns setof public.v_pin_effective
language sql
stable
security definer
set search_path = public
as $$
  with cell_size as (
    select case
      when p_zoom <= 12 then 0.00075      -- ≈83m, 3px@z12 (unchanged)
      when p_zoom = 13  then 0.00060      -- ≈67m equator, 50m at lat 43
      when p_zoom = 14  then 0.00025      -- ≈28m equator, 21m at lat 43
      else 0.0                            -- z15+: no dedup
    end as deg
  ),
  candidates as (
    select p.*,
           cz.code as climate_zone_code,
           case when cs.deg = 0
                then ST_AsText(p.location::geometry)
                else ST_AsText(ST_SnapToGrid(p.location::geometry, cs.deg, cs.deg))
           end as grid_cell
      from public.pins p
      cross join cell_size cs
      left join public.climate_zones cz on cz.id = p.climate_zone_id
      join public.species sp on sp.id = p.species_id
     where p.visibility = 'public'
       and (p_include_invasives or sp.is_forageable = true)
       and p.location && ST_MakeEnvelope(
             p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
           )
  ),
  picked as (
    select distinct on (grid_cell) *
      from candidates
     order by grid_cell, hashtextextended(id::text, 0)
  )
  select
    id, region_id, created_by, created_at, updated_at,
    species_id, display_name, location_accuracy_m,
    location_modified_by_user_at, status, notes,
    import_source, import_external_id,
    last_observed_at, last_observed_stage,
    visibility, access_status,
    status                              as effective_status,
    'America/New_York'::text            as region_timezone,
    null::boolean                       as is_edible_now,
    null::boolean                       as is_edible_strict,
    ST_X(location::geometry)            as lng,
    ST_Y(location::geometry)            as lat,
    false                               as is_inaccessible,
    false                               as has_ripe_observation_this_year,
    has_ripe_observation_ever           as has_ripe_observation_ever,
    null::int                           as best_harvest_quality,
    climate_zone_code
  from picked
  order by hashtextextended(id::text, 0)
  limit greatest(1, least(p_max_rows, 15000));
$$;

-- Same filter for the per-species summary RPC. The species filter
-- panel counts will reflect the same hide-by-default behavior.
create or replace function public.public_pins_bbox_summary(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_include_invasives boolean default false
)
returns table (
  species_id uuid,
  active_count int,
  total_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select p.species_id,
         count(*) filter (where p.status = 'active')::int as active_count,
         count(*)::int as total_count
    from public.pins p
    join public.species sp on sp.id = p.species_id
   where p.visibility = 'public'
     and (p_include_invasives or sp.is_forageable = true)
     and p.location && ST_MakeEnvelope(
           p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
         )
   group by p.species_id;
$$;
