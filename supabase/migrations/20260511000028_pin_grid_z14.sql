-- Migration 28: pin_grid_z14 — same v2 design as pin_grid_z13 but
-- with finer cells for z14 viewports.
--
-- z13 precalc uses 0.00076° cells (~84m at the equator, ~64m at lat
-- 40, which is ~6px at z13). z14 has half the meters-per-pixel of
-- z13, so the same visual density needs cells half the size. Going
-- with 0.00050° (~56m at equator, ~43m at lat 40, ~5-6 px at z14).
--
-- Storage: with ~1.7x more cells than z13 (linear in 1/cell_size²
-- but cells are dense only where pins are), expect ~1.7M rows for
-- the current 5.5M public pin set. Refresh takes ~10-15min on the
-- Supabase pooler.
--
-- Same v2 design: keyed on (bx, by) — one representative pin per
-- visible cell. Primary-key range scan replaces the runtime
-- decimation work at z14.

create table if not exists public.pin_grid_z14 (
  bx                       int      not null,
  by                       int      not null,
  representative_pin_id    uuid     not null references public.pins(id) on delete cascade,
  representative_lng       double precision not null,
  representative_lat       double precision not null,
  species_id               uuid     not null,
  climate_zone_code        text,
  primary key (bx, by)
);

create or replace function public.refresh_pin_grid_z14()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate public.pin_grid_z14;
  insert into public.pin_grid_z14 (
    bx, by, representative_pin_id,
    representative_lng, representative_lat,
    species_id, climate_zone_code
  )
  select distinct on (bx, by)
    bx, by, id,
    lng, lat,
    species_id, climate_zone_code
  from (
    select
      floor(ST_X(p.location::geometry) / 0.00050)::int as bx,
      floor(ST_Y(p.location::geometry) / 0.00050)::int as by,
      p.id,
      ST_X(p.location::geometry) as lng,
      ST_Y(p.location::geometry) as lat,
      p.species_id,
      cz.code as climate_zone_code
    from public.pins p
    left join public.climate_zones cz on cz.id = p.climate_zone_id
    join public.species sp on sp.id = p.species_id
    where p.visibility = 'public'
      and sp.is_forageable = true
  ) candidates
  order by bx, by, hashtextextended(id::text, 0);
end;
$$;

grant execute on function public.refresh_pin_grid_z14() to authenticated;

create or replace function public.public_pins_bbox_z14(
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
  with picked as (
    select g.*
      from public.pin_grid_z14 g
     where g.bx between floor(p_min_lng / 0.00050)::int
                    and floor(p_max_lng / 0.00050)::int
       and g.by between floor(p_min_lat / 0.00050)::int
                    and floor(p_max_lat / 0.00050)::int
       and g.representative_lng between p_min_lng and p_max_lng
       and g.representative_lat between p_min_lat and p_max_lat
     order by hashtextextended(g.representative_pin_id::text, 0)
     limit greatest(1, least(p_max_rows, 15000))
  )
  select
    p.id, p.region_id, p.created_by, p.created_at, p.updated_at,
    p.species_id, p.display_name, p.location_accuracy_m,
    p.location_modified_by_user_at, p.status, p.notes,
    p.import_source, p.import_external_id,
    p.last_observed_at, p.last_observed_stage,
    p.visibility, p.access_status,
    p.status                            as effective_status,
    'America/New_York'::text            as region_timezone,
    null::boolean                       as is_edible_now,
    null::boolean                       as is_edible_strict,
    picked.representative_lng           as lng,
    picked.representative_lat           as lat,
    false                               as is_inaccessible,
    false                               as has_ripe_observation_this_year,
    p.has_ripe_observation_ever         as has_ripe_observation_ever,
    null::int                           as best_harvest_quality,
    picked.climate_zone_code
  from picked
  join public.pins p on p.id = picked.representative_pin_id;
$$;

grant execute on function public.public_pins_bbox_z14(
  double precision, double precision, double precision, double precision, int
) to anon, authenticated;

select public.refresh_pin_grid_z14();

comment on table public.pin_grid_z14 is
  'v2: one representative public pin per 56m grid cell (visible at z14). Primary key (bx, by) — index range scan replaces the runtime O(N-in-bbox) snap-to-grid + distinct work in public_pins_bbox at z14.';
