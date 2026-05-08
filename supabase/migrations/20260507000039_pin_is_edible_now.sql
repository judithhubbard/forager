-- "Ripe today" → "Edible today". Different species are foraged at
-- different stages: redbud at flowering, apple at ripe, sassafras at
-- green (young leaves), maple at flowering (sap window). The previous
-- is_ripe_now field on v_pin_effective only checked stage='ripe', so
-- a flowering redbud showed false even when its harvest window was
-- active. Fix: a new pin_is_edible_now function maps the species'
-- forage_parts to the relevant stages, then OR's the per-stage window
-- checks.
--
-- Mapping:
--   forage_parts                       stages checked
--   fruit / nut / mushroom            'ripe'
--   flower                            'flowering'
--   leaf / shoot / bark / bulb        'green'
--   sap                               'flowering' (the sap window
--                                     was seeded as 'flowering' for
--                                     simplicity)
--   root                              'past' (after foliage dies back)
--
-- v_pin_effective gains is_edible_now / is_edible_strict, replacing
-- is_ripe_now / is_ripe_strict. Bbox RPCs updated to match.

create or replace function public.pin_is_edible_now(
  p_pin_id uuid,
  p_target_date date default null,
  p_buffer_days int default 10
) returns boolean
language plpgsql
stable
as $$
declare
  parts text[];
  st stage;
  stages_to_check stage[] := array[]::stage[];
begin
  select s.forage_parts into parts
    from public.pins p
    join public.species s on s.id = p.species_id
   where p.id = p_pin_id;
  if parts is null then return false; end if;

  if 'fruit' = ANY(parts) or 'nut' = ANY(parts) or 'mushroom' = ANY(parts) then
    stages_to_check := stages_to_check || array['ripe'::stage];
  end if;
  if 'flower' = ANY(parts) or 'sap' = ANY(parts) then
    stages_to_check := stages_to_check || array['flowering'::stage];
  end if;
  if 'leaf' = ANY(parts) or 'shoot' = ANY(parts) or 'bark' = ANY(parts) or 'bulb' = ANY(parts) then
    stages_to_check := stages_to_check || array['green'::stage];
  end if;
  if 'root' = ANY(parts) then
    stages_to_check := stages_to_check || array['past'::stage];
  end if;

  -- Empty stages array (e.g. species with empty forage_parts) → false.
  if array_length(stages_to_check, 1) is null then return false; end if;

  foreach st in array stages_to_check loop
    if public.pin_in_window(p_pin_id, st, null, p_target_date, p_buffer_days) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

grant execute on function public.pin_is_edible_now(uuid, date, int)
  to anon, authenticated;

-- Recreate v_pin_effective with is_edible_now / is_edible_strict.
-- Same dependency cascade as migration 35: drop view (cascades to
-- bbox RPCs), recreate view, recreate bbox RPCs against new shape.
drop view if exists public.v_pin_effective cascade;

create view public.v_pin_effective
  with (security_invoker = on)
  as
  select
    p.id, p.region_id, p.created_by, p.created_at, p.updated_at,
    p.species_id, p.display_name, p.location_accuracy_m,
    p.location_modified_by_user_at, p.status, p.notes,
    p.import_source, p.import_external_id,
    p.last_observed_at, p.last_observed_stage,
    p.visibility, p.access_status,
    public.effective_status(p)                                     as effective_status,
    r.timezone                                                     as region_timezone,
    public.pin_is_edible_now(p.id, null, 10)                       as is_edible_now,
    public.pin_is_edible_now(p.id, null, 0)                        as is_edible_strict,
    ST_X(p.location::geometry)                                     as lng,
    ST_Y(p.location::geometry)                                     as lat,
    (
      p.access_status in (
        'private_no_permission'::access_status,
        'fenced'::access_status,
        'dangerous_access'::access_status
      )
      or exists (
        select 1 from public.hazards h
        where h.pin_id = p.id
          and h.hazard_type in (
            'inaccessible'::hazard_type,
            'out_of_reach'::hazard_type,
            'fenced'::hazard_type,
            'private_property'::hazard_type
          )
      )
    ) as is_inaccessible,
    exists (
      select 1 from public.observations o
      where o.pin_id = p.id
        and o.stage = 'ripe'::stage
        and (o.quality_rating is null or o.quality_rating > 0)
        and extract(year from (o.observed_at at time zone r.timezone))
          = extract(year from (now() at time zone r.timezone))
    ) as has_ripe_observation_this_year,
    p.has_ripe_observation_ever,
    (
      select max(o.quality_rating) from public.observations o
       where o.pin_id = p.id
         and o.stage = 'ripe'::stage
         and o.quality_rating is not null
         and o.quality_rating > 0
    ) as best_harvest_quality,
    cz.code as climate_zone_code
  from public.pins p
  join public.regions r on r.id = p.region_id
  left join public.climate_zones cz on cz.id = p.climate_zone_id;

grant select on public.v_pin_effective to authenticated, anon;

-- Recreate public_pins_bbox (same slim shape; just renames the
-- placeholder column).
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
   limit greatest(1, least(p_max_rows, 1000));
$$;

grant execute on function public.public_pins_bbox(
  double precision, double precision, double precision, double precision, int
) to anon, authenticated;

-- Recreate region_pins_bbox.
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
  with hits as (
    select p.id, p.created_at
      from public.pins p
     where p.region_id = p_region_id
       and p.location && ST_MakeEnvelope(
             p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
           )
     order by p.created_at desc
     limit greatest(1, least(p_max_rows, 2000))
  )
  select v.*
    from public.v_pin_effective v
    join hits h on h.id = v.id
   order by h.created_at desc;
$$;

grant execute on function public.region_pins_bbox(
  uuid, double precision, double precision, double precision, double precision, int
) to authenticated;
