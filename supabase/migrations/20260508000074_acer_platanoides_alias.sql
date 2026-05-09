-- Catch the last unmatched-common-name alias from the OpenTrees
-- audit (data/exploration/AUDIT-REPORT.md). Several city tree
-- inventories publish "Maple Norway" instead of "Norway maple";
-- without this alias those rows ended up unmatched.

update public.species
   set aliases = array(select distinct unnest(coalesce(aliases, array[]::text[]) || array['Maple Norway']))
 where scientific_name = 'Acer platanoides';
