-- "Wild blueberry" in foraging usage almost always means
-- Vaccinium angustifolium (lowbush) in the Northeast — the species
-- harvested commercially in Maine and Quebec wild blueberry barrens.
-- Make that mapping discoverable:
--
--   1. Add "wild blueberry" / "wild lowbush blueberry" aliases to
--      V. angustifolium so the species-picker search finds it.
--   2. Copy the lowbush calibration rows to Vaccinium sp.
--      ("Blueberry unspecified") so users who pin a blueberry
--      without species precision get the most-likely-correct window.
--      Marked confidence='cited_thin' (inherits from lowbush) and
--      notes-prefixed with "Defaults to lowbush" so the provenance
--      is honest.

-- (1) Aliases.
update public.species
   set aliases = array(select distinct unnest(aliases || array['wild blueberry','wild lowbush blueberry']))
 where scientific_name = 'Vaccinium angustifolium';

-- (2) Default Vaccinium sp. to lowbush windows.
insert into public.species_fruiting_windows
  (species_id, climate_zone_id, stage, start_doy, end_doy, peak_doy, confidence, notes, evidence)
select sp_uns.id, w.climate_zone_id, w.stage, w.start_doy, w.end_doy, w.peak_doy,
       'cited_thin'::public.window_confidence,
       'Defaults to lowbush (V. angustifolium) — most foragers using "wild blueberry" mean lowbush. ' || coalesce(w.notes, ''),
       w.evidence
  from public.species_fruiting_windows w
  join public.species sp_lb on sp_lb.id = w.species_id
  cross join public.species sp_uns
 where sp_lb.scientific_name = 'Vaccinium angustifolium'
   and sp_uns.scientific_name = 'Vaccinium sp.'
   and not exists (
     select 1 from public.species_fruiting_windows e
      where e.species_id = sp_uns.id
        and e.climate_zone_id = w.climate_zone_id
        and e.stage = w.stage
   );
