-- Cheap per-species zone-distribution lookup for the calibration
-- viewer. Lets the viewer show "empty" timeline rows for zones where
-- pins exist but no fruiting-window data is recorded yet — so gaps
-- in calibration coverage are visible.

create or replace function public.species_zone_pins(p_species_id uuid)
returns table (zone_id uuid, zone_code text, n_pins int)
language sql
stable
security definer
set search_path = public
as $$
  select cz.id, cz.code, count(*)::int
    from public.pins p
    join public.climate_zones cz on cz.id = p.climate_zone_id
   where p.species_id = p_species_id
     and p.visibility = 'public'
   group by cz.id, cz.code;
$$;
