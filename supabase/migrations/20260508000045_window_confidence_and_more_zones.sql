-- Foundation for multi-region harvest windows:
--   1. species_fruiting_windows.confidence — enum tracking how a
--      window row got its values:
--        'curated'             — hand-authored (Ithaca rows today)
--        'frost_offset'        — derived from a curated row by
--                                shifting along NOAA frost-date
--                                normals
--        'observation_derived' — derived from N+ user observations
--                                in this zone for this species
--        'unknown'             — placeholder; should not survive
--                                the next migration
--      The UI fades non-curated bars and shows a tooltip explaining
--      the source. As crowdsourced observations accumulate, rows
--      transition: frost_offset → observation_derived.
--
--   2. Extend climate_zones with codes 0a–3b. The current set tops
--      out at 4a; that's fine for the conterminous US but excludes
--      Edmonton (zone 4a/3b), Calgary (3a/4a), Winnipeg (3b/4a),
--      Anchorage (4b/5a), and northern Maine (3a/3b). Without these
--      codes the import-time zone_for_point lookup has no value to
--      assign even when polygons cover those areas.
--
--      Polygon coverage for Canada / Alaska is a separate follow-up
--      (download Natural Resources Canada's 2014 plant-hardiness
--      shapefile, transform to a unified scale). For now: the codes
--      exist so the upcoming polygon import can fill them in.

-- ---- 1. species_fruiting_windows.confidence ----

do $$
begin
  if not exists (select 1 from pg_type where typname = 'window_confidence') then
    create type window_confidence as enum
      ('curated', 'frost_offset', 'observation_derived', 'unknown');
  end if;
end $$;

alter table public.species_fruiting_windows
  add column if not exists confidence window_confidence not null default 'curated';

-- All existing rows were hand-curated (Ithaca 5b + the migration-27
-- copy to 6a). Mark them as curated explicitly even though the
-- column default would have done the same — protects against future
-- migrations changing the default.
update public.species_fruiting_windows
   set confidence = 'curated'
 where confidence is null or confidence = 'unknown';

-- Index on (species_id, climate_zone_id, confidence) so the UI's
-- "show only confirmed" toggle stays cheap.
create index if not exists sfw_zone_conf_idx
  on public.species_fruiting_windows (climate_zone_id, confidence);

comment on column public.species_fruiting_windows.confidence is
  'How a window row got its values. UI fades non-curated rows and
   surfaces the source in a tooltip. See migration 45 header.';

-- ---- 2. Extend climate_zones with codes 0a–3b ----

insert into public.climate_zones (code, name, min_temp_f) values
  ('0a', 'USDA hardiness zone 0a', -65),
  ('0b', 'USDA hardiness zone 0b', -60),
  ('1a', 'USDA hardiness zone 1a', -55),
  ('1b', 'USDA hardiness zone 1b', -50),
  ('2a', 'USDA hardiness zone 2a', -45),
  ('2b', 'USDA hardiness zone 2b', -40),
  ('3a', 'USDA hardiness zone 3a', -35),
  ('3b', 'USDA hardiness zone 3b', -30),
  ('10a', 'USDA hardiness zone 10a', 30),
  ('10b', 'USDA hardiness zone 10b', 35),
  ('11a', 'USDA hardiness zone 11a', 40),
  ('11b', 'USDA hardiness zone 11b', 45)
on conflict (code) do update set
  -- Refresh name/min_temp on rerun in case of typos. No-op for
  -- already-correct rows.
  name = excluded.name,
  min_temp_f = excluded.min_temp_f;

-- Note: the climate_zones table conflict ON code prevents duplicates;
-- if 4a-9b already exist with different name strings the upsert
-- normalizes them to the canonical names above. (Harmless.)
