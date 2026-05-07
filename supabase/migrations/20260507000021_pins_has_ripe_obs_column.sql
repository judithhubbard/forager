-- Restore the "Productive" filter on the public layer at scale.
--
-- The slim public_pins_bbox from migration 18 returns
-- has_ripe_observation_ever as a hard-coded false because the
-- v_pin_effective subquery (EXISTS over observations) was a per-row
-- cost the wide-bbox path couldn't afford. Materialize the value as
-- a real column instead — observations is a write-rare table, so a
-- trigger-maintained cache is essentially free at write time and
-- removes the read-time cost entirely.

alter table public.pins
  add column if not exists has_ripe_observation_ever boolean not null default false;

create index if not exists pins_has_ripe_obs_idx
  on public.pins (has_ripe_observation_ever)
  where has_ripe_observation_ever = true;

-- Backfill from the existing observations set. Observations is
-- small (low-thousands at most), so the EXISTS subquery is fast
-- per pin; the partial index keeps the actual UPDATE cheap.
update public.pins p
   set has_ripe_observation_ever = true
 where exists (
   select 1 from public.observations o
    where o.pin_id = p.id
      and o.stage = 'ripe'
      and (o.quality_rating is null or o.quality_rating > 0)
 );

-- Trigger function: keeps pins.has_ripe_observation_ever in sync
-- with the underlying observations rows. INSERT can short-circuit
-- (only flip false→true). UPDATE and DELETE may need a recompute
-- because they could have been the last qualifying ripe observation
-- for the pin.
create or replace function public.tg_maintain_has_ripe_obs()
returns trigger
language plpgsql
as $$
declare
  pin_to_check uuid;
begin
  if tg_op = 'INSERT' then
    if new.stage = 'ripe' and (new.quality_rating is null or new.quality_rating > 0) then
      update public.pins
         set has_ripe_observation_ever = true
       where id = new.pin_id
         and has_ripe_observation_ever = false;
    end if;
    return new;
  end if;
  -- UPDATE or DELETE: recompute from scratch for the affected pin.
  pin_to_check := coalesce(new.pin_id, old.pin_id);
  update public.pins p
     set has_ripe_observation_ever = exists (
       select 1 from public.observations o
        where o.pin_id = p.id
          and o.stage = 'ripe'
          and (o.quality_rating is null or o.quality_rating > 0)
     )
   where p.id = pin_to_check;
  return coalesce(new, old);
end;
$$;

drop trigger if exists observations_maintain_has_ripe_obs on public.observations;
create trigger observations_maintain_has_ripe_obs
after insert or update or delete on public.observations
for each row execute function public.tg_maintain_has_ripe_obs();

-- Update public_pins_bbox to return the real column. Same SECURITY
-- DEFINER + slim shape from migrations 18/19.
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
    p.status                             as effective_status,
    'America/New_York'::text             as region_timezone,
    false                                as is_ripe_now,
    false                                as is_ripe_strict,
    ST_X(p.location::geometry)           as lng,
    ST_Y(p.location::geometry)           as lat,
    false                                as is_inaccessible,
    false                                as has_ripe_observation_this_year,
    p.has_ripe_observation_ever          as has_ripe_observation_ever,
    null::int                            as best_harvest_quality
    from public.pins p
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
