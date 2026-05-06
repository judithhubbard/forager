-- Surface pins.visibility on v_pin_effective so the client can render
-- a 🔒 badge / privacy toggle without a separate fetch. Same for
-- observations.visibility on v_observation_with_pin.

create or replace view public.v_pin_effective as
  select
    p.id,
    p.region_id,
    p.created_by,
    p.created_at,
    p.updated_at,
    p.species_id,
    p.display_name,
    p.location_accuracy_m,
    p.location_modified_by_user_at,
    p.status,
    p.visibility,
    p.notes,
    p.import_source,
    p.import_external_id,
    p.import_raw,
    p.last_observed_at,
    p.last_observed_stage,
    public.effective_status(p)                                     as effective_status,
    r.timezone                                                     as region_timezone,
    public.pin_in_window(p.id, 'ripe'::stage, null, null, 10)      as is_ripe_now,
    public.pin_in_window(p.id, 'ripe'::stage, null, null, 0)       as is_ripe_strict,
    ST_X(p.location::geometry)                                     as lng,
    ST_Y(p.location::geometry)                                     as lat,
    exists (
      select 1 from public.hazards h
      where h.pin_id = p.id
        and h.hazard_type in ('inaccessible'::hazard_type,
                              'out_of_reach'::hazard_type,
                              'fenced'::hazard_type,
                              'private_property'::hazard_type)
    ) as is_inaccessible,
    exists (
      select 1 from public.observations o
      where o.pin_id = p.id
        and o.stage = 'ripe'::stage
        and (o.quality_rating is null or o.quality_rating > 0)
        and extract(year from (o.observed_at at time zone r.timezone))
          = extract(year from (now() at time zone r.timezone))
    ) as has_ripe_observation_this_year,
    exists (
      select 1 from public.observations o
      where o.pin_id = p.id
        and o.stage = 'ripe'::stage
        and (o.quality_rating is null or o.quality_rating > 0)
    ) as has_ripe_observation_ever,
    (
      select max(o.quality_rating) from public.observations o
       where o.pin_id = p.id
         and o.stage = 'ripe'::stage
         and o.quality_rating is not null
         and o.quality_rating > 0
    ) as best_harvest_quality
  from public.pins p
  join public.regions r on r.id = p.region_id;

grant select on public.v_pin_effective to authenticated, anon;
alter view public.v_pin_effective set (security_invoker = on);

create or replace view public.v_observation_with_pin as
  select
    o.id,
    o.pin_id,
    o.user_id,
    o.observed_at,
    o.stage,
    o.quality_rating,
    o.quality_notes,
    o.created_at,
    o.visibility,
    p.region_id            as pin_region_id,
    p.display_name         as pin_display_name,
    p.status               as pin_status,
    s.id                   as species_id,
    s.common_name          as species_common_name,
    s.scientific_name      as species_scientific_name,
    pr.username            as user_username,
    pr.display_name        as user_display_name
  from public.observations o
  join public.pins p           on p.id = o.pin_id
  left join public.species s   on s.id = p.species_id
  left join public.profiles pr on pr.id = o.user_id;

grant select on public.v_observation_with_pin to authenticated, anon;
alter view public.v_observation_with_pin set (security_invoker = on);
