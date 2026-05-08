-- Seed harvest windows for Tier 1-4 species in Ithaca's climate zones
-- (5b and 6a — both apply per migration 27, since the 5b/6a boundary
-- runs through Ithaca and per-pin USDA lookup picks one or the other).
--
-- The earlier 45-species curation in 20260506000027 only covered the
-- original seed catalog. Tier 1-4 expansions added the species rows
-- and the rich prose, but left species_fruiting_windows untouched —
-- so a user who adds, say, Eastern redbud to /interests sees no
-- entry on /windows. This migration fixes that for the Ithaca-relevant
-- subset of the expansions.
--
-- DOY values are rough averages drawn from the curated harvest-tip
-- prose plus general botanical knowledge for the upstate-NY context.
-- Users can refine via the editor on /windows.
--
-- Idempotent gate: only inserts where no row exists for
-- (species_id, climate_zone_id, stage).

with z as (
  select id, code from public.climate_zones where code in ('5b', '6a')
),
seed (sci, stage, start_doy, end_doy, peak_doy) as (values
  -- Trees: flowering / sap / nuts (Ithaca-relevant)
  ('Cercis canadensis',     'flowering', 110, 135, 122),  -- redbud, late April-early May
  ('Tilia americana',       'flowering', 175, 200, 188),  -- basswood, late June-early July
  ('Robinia pseudoacacia',  'flowering', 140, 165, 152),  -- black locust, late May-early June
  ('Sassafras albidum',     'green',     120, 160, 140),  -- young leaves for filé / tea
  ('Acer saccharum',        'flowering', 32,  90,  60),   -- sap window, Feb-late March
  ('Acer rubrum',           'flowering', 32,  80,  55),   -- sap, slightly earlier
  ('Acer negundo',          'flowering', 32,  85,  58),   -- sap
  ('Crataegus sp.',         'flowering', 130, 150, 140),  -- hawthorn flowers May
  ('Crataegus sp.',         'ripe',      245, 295, 270),  -- haws, Sept-Oct
  ('Quercus alba',          'ripe',      245, 305, 275),  -- acorns drop Sept-Oct
  ('Quercus macrocarpa',    'ripe',      245, 290, 268),  -- acorns
  ('Fagus grandifolia',     'ripe',      275, 315, 295),  -- beechnuts drop October
  ('Juglans nigra',         'ripe',      260, 305, 282),  -- black walnut
  ('Pinus strobus',         'green',     115, 155, 135),  -- spring needle / pollen window
  ('Tsuga canadensis',      'green',     115, 150, 132),  -- spring tips
  ('Sambucus nigra',        'flowering', 160, 185, 172),  -- elderflowers June
  ('Sambucus nigra',        'ripe',      225, 265, 245),  -- elderberries Aug-Sept
  -- Shrubs / aromatics
  ('Lindera benzoin',       'ripe',      220, 265, 240),  -- spicebush berries Aug-Sept
  ('Rhus typhina',          'ripe',      215, 250, 230),  -- staghorn sumac drupes Aug
  -- Wild greens (most relevant to Ithaca)
  ('Urtica dioica',         'green',     100, 145, 120),  -- nettle young shoots
  ('Taraxacum officinale',  'flowering', 105, 185, 130),  -- dandelion flowers
  ('Taraxacum officinale',  'green',      90, 280, 130),  -- leaves ~all season
  ('Taraxacum officinale',  'ripe',      275, 315, 295),  -- roots in fall
  ('Portulaca oleracea',    'green',     150, 265, 200),  -- purslane summer
  ('Chenopodium album',     'green',     130, 210, 165),  -- lamb's quarters May-July
  ('Allium vineale',        'green',      90, 155, 120),  -- field garlic greens spring
  ('Allium vineale',        'ripe',      265, 305, 285),  -- bulbs in fall
  ('Hemerocallis fulva',    'flowering', 175, 215, 195),  -- daylily summer
  ('Stellaria media',        'green',      60, 200,  90),  -- chickweed cool seasons (1)
  ('Galium aparine',        'green',      95, 135, 115),  -- cleavers spring shoots
  -- Mushrooms
  ('Pleurotus ostreatus',   'ripe',      240, 320, 280),  -- oyster fall flush
  ('Hericium erinaceus',    'ripe',      245, 305, 275),  -- lion's mane fall
  ('Laetiporus sulphureus', 'ripe',      180, 285, 230),  -- chicken of the woods summer-fall
  ('Grifola frondosa',      'ripe',      240, 295, 270)   -- hen of the woods fall
)
insert into public.species_fruiting_windows (
  species_id, region_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, notes
)
select s.id,
       (select id from public.regions where name = 'Ithaca, NY'),
       z.id,
       seed.stage::stage,
       seed.start_doy,
       seed.end_doy,
       seed.peak_doy,
       'Seeded Tier 1-4 expansion (Ithaca area)'
  from seed
  join public.species s on s.scientific_name = seed.sci
  cross join z
 where not exists (
   select 1 from public.species_fruiting_windows w
    where w.species_id = s.id
      and w.climate_zone_id = z.id
      and w.stage = seed.stage::stage
 );
