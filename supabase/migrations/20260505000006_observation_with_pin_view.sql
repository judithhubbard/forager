-- View for activity feed: observation rows enriched with the parent
-- pin's region, display name, species. RLS inherits from the underlying
-- tables.

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
    p.region_id            as pin_region_id,
    p.display_name         as pin_display_name,
    p.status               as pin_status,
    s.id                   as species_id,
    s.common_name          as species_common_name,
    s.scientific_name      as species_scientific_name
  from public.observations o
  join public.pins p     on p.id = o.pin_id
  left join public.species s on s.id = p.species_id;

grant select on public.v_observation_with_pin to authenticated, anon;
