-- Phase 1A — additive groundwork for climate-zone-keyed phenology.
--
-- We don't yet flip pin_in_window / effective_windows to read from
-- the new column. That cutover is a follow-up migration so the data
-- can be verified populated first; this one is purely additive and
-- safe to roll back. Once every species has rows keyed by zone +
-- the existing region_id rows are mirrored into the new shape, a
-- follow-up will retire region_id.

-- 1. climate_zones reference table — USDA hardiness 4a..9b covers
--    most populated North America. Add more rows by hand or via a
--    follow-up migration as we expand.
create table if not exists public.climate_zones (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,             -- '5b', '6a', …
  name        text not null,                    -- 'USDA hardiness zone 5b'
  -- Nominal min winter temperature in °F (USDA convention) — used as
  -- a tiebreaker when two zones have overlapping climates.
  min_temp_f  int,
  notes       text,
  created_at  timestamptz not null default now()
);

insert into public.climate_zones (code, name, min_temp_f) values
  ('4a', 'USDA hardiness zone 4a', -30),
  ('4b', 'USDA hardiness zone 4b', -25),
  ('5a', 'USDA hardiness zone 5a', -20),
  ('5b', 'USDA hardiness zone 5b', -15),
  ('6a', 'USDA hardiness zone 6a', -10),
  ('6b', 'USDA hardiness zone 6b',  -5),
  ('7a', 'USDA hardiness zone 7a',   0),
  ('7b', 'USDA hardiness zone 7b',   5),
  ('8a', 'USDA hardiness zone 8a',  10),
  ('8b', 'USDA hardiness zone 8b',  15),
  ('9a', 'USDA hardiness zone 9a',  20),
  ('9b', 'USDA hardiness zone 9b',  25)
on conflict (code) do nothing;

-- 2. region → primary climate zone. One row per region; once we have
--    multi-zone regions we can drop the unique constraint and use
--    weighted lookups, but day-1 every region has a single zone.
create table if not exists public.region_climate_zones (
  region_id        uuid primary key references public.regions(id) on delete cascade,
  climate_zone_id  uuid not null references public.climate_zones(id) on delete restrict,
  updated_at       timestamptz not null default now()
);

-- 3. Climate-zone-keyed phenology windows. Lives alongside the
--    existing region_id-keyed rows; the ripe-checking RPC will
--    consult zone first, region second once we cut over.
alter table public.species_fruiting_windows
  add column if not exists climate_zone_id uuid references public.climate_zones(id) on delete restrict;

create index if not exists sfw_species_zone_idx
  on public.species_fruiting_windows (species_id, climate_zone_id);

-- 4. Backfill: every existing species_fruiting_windows row is keyed
--    by region_id today. Map each region to its primary zone (we
--    pre-seed Ithaca → 5b below) and copy that zone onto every row
--    for that region. region_id stays in place for now.
do $$
declare
  ithaca_id    uuid;
  ithaca_zone  uuid;
begin
  -- Best-effort lookup; do nothing if the deployment hasn't created
  -- the Ithaca region yet.
  select id into ithaca_id from public.regions
   where name ilike 'ithaca%' or name ilike 'cornell%'
   order by name
   limit 1;
  select id into ithaca_zone from public.climate_zones where code = '5b';
  if ithaca_id is not null and ithaca_zone is not null then
    insert into public.region_climate_zones (region_id, climate_zone_id)
    values (ithaca_id, ithaca_zone)
    on conflict (region_id) do nothing;
  end if;
end $$;

update public.species_fruiting_windows w
   set climate_zone_id = rcz.climate_zone_id
  from public.region_climate_zones rcz
 where w.region_id = rcz.region_id
   and w.climate_zone_id is null;

-- 5. zone_for_point(lng, lat) lat-band heuristic. Replaces "no zone
--    info for this anonymous viewer" with a sensible default so a
--    user browsing without a region still sees believable harvest
--    windows. Approximate; the real implementation in a follow-up
--    migration replaces this with a PostGIS shapefile lookup.
create or replace function public.zone_for_point(p_lng double precision, p_lat double precision)
returns text
language sql
immutable
as $$
  -- Coarse mapping: every ~3.5° of latitude shifts one half-zone.
  -- Calibrated against USDA 2023 zones at ~75°W longitude. Outside
  -- the US this is wildly wrong (the Gulf Stream warms Europe; high
  -- altitude cools Mexico) but it's better than nothing for v1.
  select case
    when p_lat is null then '6a'
    when p_lat >= 47.5 then '4a'
    when p_lat >= 45.0 then '4b'
    when p_lat >= 43.5 then '5a'
    when p_lat >= 41.5 then '5b'
    when p_lat >= 39.5 then '6a'
    when p_lat >= 37.5 then '6b'
    when p_lat >= 35.5 then '7a'
    when p_lat >= 33.5 then '7b'
    when p_lat >= 31.0 then '8a'
    when p_lat >= 29.0 then '8b'
    when p_lat >= 27.0 then '9a'
    else '9b'
  end;
$$;

grant execute on function public.zone_for_point(double precision, double precision) to anon, authenticated;

-- 6. RLS for the new tables. climate_zones + region_climate_zones
--    are reference-y; readable by everyone, writable by no one
--    through PostgREST (admin-only via direct SQL).
alter table public.climate_zones enable row level security;
alter table public.region_climate_zones enable row level security;

drop policy if exists climate_zones_read_all on public.climate_zones;
create policy climate_zones_read_all
  on public.climate_zones for select
  to anon, authenticated
  using (true);

drop policy if exists region_climate_zones_read_member on public.region_climate_zones;
create policy region_climate_zones_read_member
  on public.region_climate_zones for select
  to anon, authenticated
  using (true);
