-- The Ithaca-curated species_fruiting_windows are tagged climate
-- zone 5b, but USDA classifies most of Ithaca as 6a (the 5b/6a
-- boundary cuts through the area). Per-pin climate_zone_id picks
-- 5b or 6a depending on exact location. To keep all Ithaca pins
-- using the same curated windows, copy the 117 5b rows into 6a.
--
-- Justification: Ithaca's original "5b" tagging was approximate;
-- the user's empirical knowledge of harvest timing applies across
-- both zones (microclimate variation within Ithaca < zone-boundary
-- precision). Better than degrading half of Ithaca to "no data".

insert into public.species_fruiting_windows (
  species_id, region_id, stage, start_doy, end_doy, peak_doy, notes, climate_zone_id, created_by
)
select
  sfw.species_id,
  sfw.region_id,
  sfw.stage,
  sfw.start_doy,
  sfw.end_doy,
  sfw.peak_doy,
  coalesce(sfw.notes, '') || ' [copied from 5b]',
  (select id from public.climate_zones where code = '6a'),
  sfw.created_by
  from public.species_fruiting_windows sfw
 where sfw.climate_zone_id = (select id from public.climate_zones where code = '5b')
   and not exists (
     select 1 from public.species_fruiting_windows sfw2
      where sfw2.species_id      = sfw.species_id
        and sfw2.stage           = sfw.stage
        and sfw2.climate_zone_id = (select id from public.climate_zones where code = '6a')
   );
