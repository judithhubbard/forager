-- Delete Dryad-imported pins whose coordinates are >200 km from the
-- median location of pins in the same city. Origin: bad lat/lng rows
-- in the Dryad source CSVs (e.g. a Houston, TX tree row with coords
-- in Houston, MO ~2,000 km away). 615 outliers identified at audit
-- time, clustered in Houston (12 rows ~2,083 km off) and Stockton
-- (18 rows ~1,489 km off), among others.
--
-- 200 km is comfortable: the largest legitimate metro extent (LA's
-- Dryad coverage) is ~80 km radius, so this won't false-positive.
-- Honolulu's neighboring-island legit pins (40-200 km) might brush
-- the threshold but the audit didn't show any there.
--
-- Disable the public-visibility gate trigger for the bulk delete (the
-- pins are visibility='public' but were inserted by the import script
-- via SUPABASE_DB_URL, which has no auth.uid() so the gate would
-- block. Same trigger-disable pattern the import scripts use.)

alter table public.pins disable trigger tg_gate_public_pins;

with centroids as (
  select import_source,
         ST_SetSRID(ST_MakePoint(
           percentile_cont(0.5) within group (order by ST_X(location::geometry)),
           percentile_cont(0.5) within group (order by ST_Y(location::geometry))
         ), 4326) as center
    from public.pins
   where import_source like 'dryad-trees-%'
   group by import_source
)
delete from public.pins p
 using centroids c
 where p.import_source like 'dryad-trees-%'
   and c.import_source = p.import_source
   and ST_DistanceSphere(p.location::geometry, c.center) > 200000;

alter table public.pins enable trigger tg_gate_public_pins;
