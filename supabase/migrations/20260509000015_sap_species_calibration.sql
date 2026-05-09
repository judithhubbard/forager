-- Phase A of the harvest-stage cleanup. Five maple species have
-- forage_parts=['sap'] only — for foragers, the harvest event is
-- sap flow (Jan-Mar, freeze-thaw driven), NOT samara/seed ripening
-- (May-July, what NPN's pheno_class_id=12 actually tracks). The
-- existing 'ripe' rows for these species were timed to the wrong
-- biological event entirely.
--
-- This migration:
--   1. Adds 'sap_run' to the stage enum.
--   2. Deletes the samara-timed 'ripe' rows for the 5 sap-only
--      species (21 rows).
--   3. Inserts literature-derived sap-run windows by zone for
--      Acer saccharum / rubrum / saccharinum / negundo / ginnala
--      across zones 3a-7b (50 rows). Sources cited in row notes:
--      Cornell Maple Program, Vermont Maple Sugar Makers Assn,
--      USDA-NRCS sap-flow guides.
--   4. Strikes ~86k public+imported sap-species pins in zones
--      8a-11b — these are city-tree imports in regions too warm
--      for reliable freeze-thaw cycles (no sap potential).
--      User-pinned sap species (visibility != 'public' or no
--      import_source) are preserved.
--   5. Rebuilds pin_density_grid since per-row triggers are
--      bypassed for the bulk delete.
--
-- Phase B (separate task) will rename / re-label the broader set
-- of mis-staged 'ripe' rows for shoot/leaf/root species and add a
-- per-species harvest-stage-of-record concept.
--
-- Idempotent on re-run: enum ADD VALUE IF NOT EXISTS is no-op;
-- DELETEs target only 'ripe' rows that haven't been re-classified;
-- INSERTs guarded by ON CONFLICT DO NOTHING.

-- (1) Add the enum value. Must be its own transaction.
alter type public.stage add value if not exists 'sap_run';

-- The remainder runs in a single transaction with triggers off.
begin;
set local statement_timeout = 0;
set local session_replication_role = replica;

-- (2) Drop samara-timed 'ripe' rows for sap-only species.
delete from public.species_fruiting_windows sfw
 using public.species sp
 where sfw.species_id = sp.id
   and sfw.stage = 'ripe'
   and 'sap' = any(sp.forage_parts)
   and not (array['fruit','nut','seed']::text[] && sp.forage_parts);

-- (3) Insert sap-run windows by zone. Sugar-maple-derived; the four
-- other maples use the same windows (industry tappers run them
-- simultaneously — small phenology differences are within noise).
-- Peak DOY = midpoint of typical sap season; ±19 days = full window.
-- Zones 8+ omitted: too warm for reliable freeze-thaw cycling.
insert into public.species_fruiting_windows
  (species_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, confidence, notes, evidence)
select sp.id, cz.id, 'sap_run'::public.stage,
       v.start_doy, v.end_doy, v.peak_doy,
       'expert_verified'::public.window_confidence,
       'Sap-flow window for tapping. Peak = midpoint of typical freeze-thaw season; flow-day-by-day depends on weather (cold nights + warmer days). Sources: Cornell Maple Program, Vermont Maple Sugar Makers Assn, USDA-NRCS sap-flow guides.',
       '[]'::jsonb
  from public.species sp
  cross join (values
    ('3a', 56,  95, 74),
    ('3b', 53,  92, 71),
    ('4a', 50,  89, 67),
    ('4b', 47,  86, 64),
    ('5a', 43,  82, 60),
    ('5b', 39,  78, 56),
    ('6a', 33,  73, 51),
    ('6b', 28,  68, 46),
    ('7a', 18,  55, 36),
    ('7b', 12,  50, 30)
  ) as v(zone_code, start_doy, end_doy, peak_doy)
  join public.climate_zones cz on cz.code = v.zone_code
 where sp.scientific_name in
       ('Acer saccharum','Acer rubrum','Acer saccharinum','Acer negundo','Acer ginnala')
on conflict do nothing;

-- (4) Strike city-tree-imported sap-species pins in zones 8+.
delete from public.pins p
 using public.species sp, public.climate_zones cz
 where p.species_id = sp.id
   and p.climate_zone_id = cz.id
   and 'sap' = any(sp.forage_parts)
   and not (array['fruit','nut','seed']::text[] && sp.forage_parts)
   and p.visibility = 'public'
   and p.import_source is not null
   and cz.code in ('8a','8b','9a','9b','10a','10b','11a','11b');

commit;

-- (5) Rebuild pin_density_grid (triggers bypassed during bulk delete).
truncate public.pin_density_grid;
insert into public.pin_density_grid (zoom_band, bx, by, count_pins)
select b,
       floor(ST_X(p.location::geometry) / public.eps_for_band(b))::int,
       floor(ST_Y(p.location::geometry) / public.eps_for_band(b))::int,
       count(*)::int
  from generate_series(0, 4) b
  cross join public.pins p
 where p.visibility = 'public'
 group by b, 2, 3;
