-- Expose observed_precision on v_observation_with_pin so the
-- /timeline page can filter to only the day-precision observations
-- (a "harvest in 2024" with year-only precision should not be
-- pinned to Jan 1 on the timeline).
--
-- Postgres rejects create-or-replace-view if the column ORDER
-- changes, so observed_precision is appended at the end of the
-- existing column list — see comment in 20260506000005 for the
-- same lesson learned about visibility.

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
    s.scientific_name      as species_scientific_name,
    pr.username            as user_username,
    pr.display_name        as user_display_name,
    o.visibility,
    o.observed_precision
  from public.observations o
  join public.pins p           on p.id = o.pin_id
  left join public.species s   on s.id = p.species_id
  left join public.profiles pr on pr.id = o.user_id;

grant select on public.v_observation_with_pin to authenticated, anon;
alter view public.v_observation_with_pin set (security_invoker = on);
