-- Add an `is_inaccessible` boolean to v_pin_effective so the map can render
-- inaccessible pins transparently without an extra round-trip per pin.
--
-- "Inaccessible" here means any active hazard tagged inaccessible /
-- out_of_reach / fenced / private_property — i.e. you can see the tree but
-- you can't pick the fruit.

drop view if exists public.v_pin_effective;

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
    p.notes,
    p.import_source,
    p.import_external_id,
    p.import_raw,
    p.last_observed_at,
    p.last_observed_stage,
    public.effective_status(p)                             as effective_status,
    r.timezone                                             as region_timezone,
    public.pin_in_window(p.id, 'ripe'::stage)              as is_ripe_now,
    ST_X(p.location::geometry)                             as lng,
    ST_Y(p.location::geometry)                             as lat,
    exists (
      select 1 from public.hazards h
      where h.pin_id = p.id
        and h.hazard_type in ('inaccessible'::hazard_type,
                              'out_of_reach'::hazard_type,
                              'fenced'::hazard_type,
                              'private_property'::hazard_type)
    )                                                      as is_inaccessible
  from public.pins p
  join public.regions r on r.id = p.region_id;

grant select on public.v_pin_effective to authenticated, anon;
