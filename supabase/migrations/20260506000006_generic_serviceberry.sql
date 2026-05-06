-- Add a generic "Serviceberry (unspecified)" species so users who
-- can't tell A. laevis from A. arborea from A. canadensis still have
-- a sensible option in the species picker.
--
-- Pattern is also useful for any other genus where confident
-- species-level ID is hard. For now we ship just Amelanchier; add
-- more `Genus sp.` rows over time as needs arise.

insert into public.species (
  scientific_name,
  common_name,
  aliases,
  forage_parts,
  safety_notes
)
values (
  'Amelanchier sp.',
  'Serviceberry (unspecified)',
  array['Amelanchier', 'Saskatoon', 'Juneberry', 'Shadbush', 'Serviceberry'],
  array['fruit'],
  'Use when you can identify the genus but not the exact species. Treat ripeness windows as approximate — different Amelanchier species ripen at slightly different times.'
)
on conflict (scientific_name) do nothing;

-- Seed fruiting windows for every existing region. Ranges span the
-- typical envelope of A. laevis, A. arborea, A. canadensis (the
-- three species this picker entry stands in for). Idempotent via
-- NOT EXISTS; safe to re-run.

with sp as (
  select id from public.species
   where scientific_name = 'Amelanchier sp.'
)
insert into public.species_fruiting_windows
  (species_id, region_id, stage, start_doy, end_doy)
select sp.id, r.id, t.stage, t.start_doy, t.end_doy
  from sp,
       public.regions r,
       (values
         ('flowering'::stage, 105, 130),
         ('green'::stage,     125, 165),
         ('ripening'::stage,  160, 175),
         ('ripe'::stage,      165, 200)
       ) as t(stage, start_doy, end_doy)
 where not exists (
   select 1 from public.species_fruiting_windows w
    where w.species_id = sp.id
      and w.region_id  = r.id
      and w.stage      = t.stage
 );
