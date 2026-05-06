-- Phase 1E: split hazards into safety + access taxonomies.
--
-- Today: a single hazard_type enum mixes safety (poison_ivy, ticks,
-- sick) with access (fenced, private_property, out_of_reach,
-- inaccessible). They have different cardinality (one access-state
-- per pin; many safety hazards) and different UX treatment.
--
-- Strategy:
-- 1. New access_status enum + pins.access_status column.
-- 2. Backfill access_status from existing hazards rows.
-- 3. Delete those access-flavored rows from hazards (the value lives
--    on pins now).
-- 4. v_pin_effective.is_inaccessible reads pins.access_status first,
--    then falls back to legacy hazard rows during the transition.
-- 5. Postgres enums can't have values dropped, so the old enum keeps
--    its access values; the UI just stops offering them. A future
--    migration can rename the enum to safety_hazard once we're
--    confident no caller still writes access values.

create type access_status as enum (
  'public_land',
  'private_with_permission',
  'private_no_permission',
  'fenced',
  'posted',
  'unmaintained',
  'dangerous_access'
);

alter table public.pins
  add column if not exists access_status access_status;

-- Backfill from the most-recent matching hazards row per pin. The
-- mapping is opinionated: 'private_property' alone says nothing about
-- whether permission was obtained, so we conservatively map it to
-- private_no_permission ("ask first" was its label).
update public.pins p
  set access_status = sub.mapped
 from (
   select distinct on (h.pin_id)
     h.pin_id,
     case h.hazard_type
       when 'fenced'           then 'fenced'::access_status
       when 'private_property' then 'private_no_permission'::access_status
       when 'out_of_reach'     then 'unmaintained'::access_status
       when 'inaccessible'     then 'dangerous_access'::access_status
     end as mapped
   from public.hazards h
   where h.hazard_type in (
     'fenced'::hazard_type,
     'private_property'::hazard_type,
     'out_of_reach'::hazard_type,
     'inaccessible'::hazard_type
   )
   order by h.pin_id, h.created_at desc
 ) sub
 where p.id = sub.pin_id
   and p.access_status is null;

-- Now strip the access-flavored hazard rows. The information lives
-- on pins. Safety rows are untouched.
delete from public.hazards
 where hazard_type in (
   'fenced'::hazard_type,
   'private_property'::hazard_type,
   'out_of_reach'::hazard_type,
   'inaccessible'::hazard_type
 );

-- Rebuild v_pin_effective so is_inaccessible reflects the new
-- model. We still consult hazards as a fallback so any rows that
-- slip through (e.g. created during the migration window before a
-- redeployed UI catches up) keep masking pins as inaccessible.
drop view if exists public.v_pin_effective;
create or replace view public.v_pin_effective
  with (security_invoker = on)
  as
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
    p.visibility,
    p.access_status,
    public.effective_status(p)                                     as effective_status,
    r.timezone                                                     as region_timezone,
    public.pin_in_window(p.id, 'ripe'::stage, null, null, 10)      as is_ripe_now,
    public.pin_in_window(p.id, 'ripe'::stage, null, null, 0)       as is_ripe_strict,
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
