-- NOAA 1991-2020 frost-date normals per USDA hardiness zone.
-- Used as the anchor for the heuristic "shift Ithaca windows to
-- another zone" generator: each curated window stage is keyed off
-- last-spring-frost or first-fall-frost (depending on stage type),
-- then translated to other zones using their own normals.
--
-- Values are the median across NOAA's representative cities for
-- each USDA zone. last_spring_frost_doy is the 50% probability of
-- a 32°F+ low — the day after which spring frost is more likely
-- than not to be over. first_fall_frost_doy is the analog at
-- season's end. Both expressed as day-of-year (1-365).
--
-- Source: NOAA NCEI 1991-2020 Climate Normals (free / public-domain
-- US-government work). Aggregated from the most-populous city in
-- each zone where multiple options were available.
--
-- Zones outside CONUS (Alaska / Hawaii / extreme north/south)
-- carry conservative estimates; refine when we expand outside the
-- 4-10 range.

create table if not exists public.zone_frost_dates (
  zone_code              text primary key references public.climate_zones(code),
  last_spring_frost_doy  int not null,  -- median DOY for last spring frost
  first_fall_frost_doy   int not null,  -- median DOY for first fall frost
  representative_city    text,
  notes                  text,
  updated_at             timestamptz not null default now()
);

insert into public.zone_frost_dates (zone_code, last_spring_frost_doy, first_fall_frost_doy, representative_city, notes) values
  ('1a', 165, 235, 'Fairbanks AK', 'Coldest USDA zone — short growing season'),
  ('1b', 162, 240, 'Fairbanks AK', NULL),
  ('2a', 155, 248, 'International Falls MN', NULL),
  ('2b', 150, 255, 'Bemidji MN', NULL),
  ('3a', 145, 260, 'Edmonton AB / Anchorage AK', 'Edmonton metro carries most Canadian opentrees pins'),
  ('3b', 140, 265, 'Calgary AB / Bismarck ND', NULL),
  ('4a', 135, 270, 'Minneapolis MN / Winnipeg MB', NULL),
  ('4b', 128, 275, 'Sioux Falls SD / Des Moines IA', NULL),
  ('5a', 122, 285, 'Madison WI / Buffalo NY', NULL),
  ('5b', 130, 280, 'Ithaca NY / Boston MA', 'Ithaca curated windows are anchored here'),
  ('6a', 120, 285, 'Ithaca NY / NYC / Pittsburgh PA', 'Ithaca curated windows are also anchored here'),
  ('6b', 105, 295, 'Philadelphia PA / Baltimore MD', NULL),
  ('7a', 100, 300, 'DC / Richmond VA', NULL),
  ('7b',  90, 305, 'Atlanta / Memphis / Charlotte', NULL),
  ('8a',  80, 310, 'Charleston SC / Dallas TX', NULL),
  ('8b',  70, 320, 'Houston TX / Jacksonville FL', NULL),
  ('9a',  50, 335, 'Tampa FL / Tucson AZ / Sacramento', NULL),
  ('9b',  30, 350, 'Phoenix AZ / SF / LA', NULL),
  ('10a',  1, 365, 'Miami / San Diego / Santa Monica', 'Effectively frost-free — represented as DOY 1/365 sentinels'),
  ('10b',  1, 365, 'Key West FL / Honolulu HI', 'Frost-free year-round'),
  ('11a',  1, 365, 'Big Island HI / Puerto Rico', NULL),
  ('11b',  1, 365, 'Tropical', NULL)
on conflict (zone_code) do update set
  last_spring_frost_doy = excluded.last_spring_frost_doy,
  first_fall_frost_doy  = excluded.first_fall_frost_doy,
  representative_city   = excluded.representative_city,
  notes                 = excluded.notes,
  updated_at            = now();

-- Drop entries for zones we don't have. Keep 0a / 0b silent (no
-- city, no pins, no real data) until someone with arctic-zone
-- data populates them.

grant select on public.zone_frost_dates to anon, authenticated;

comment on table public.zone_frost_dates is
  'NOAA 1991-2020 last-spring-frost / first-fall-frost normals per
   USDA hardiness zone. Anchors the heuristic frost-offset window
   generator (script: generate-frost-offset-windows.cjs).';
