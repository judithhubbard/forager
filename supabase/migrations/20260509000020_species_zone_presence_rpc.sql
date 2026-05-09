-- Per-(species, zone) presence: which species have public pins or
-- calibration data in each USDA zone. Used by the /species catalog
-- page's zone filter ("show only species relevant to zone 5b").
--
-- Aggregating 2.7M pins on every page load was 20s. Backed by a
-- materialized view refreshed on demand (currently from the import
-- framework). Anon-readable.

drop function if exists public.species_zone_presence_all();

drop materialized view if exists public.mv_species_zone_presence;

create materialized view public.mv_species_zone_presence as
with pin_counts as (
  select p.species_id, cz.code as zone_code, count(*)::int as n
    from public.pins p
    join public.climate_zones cz on cz.id = p.climate_zone_id
   where p.visibility = 'public'
   group by p.species_id, cz.code
),
windows as (
  select sfw.species_id, cz.code as zone_code
    from public.species_fruiting_windows sfw
    join public.climate_zones cz on cz.id = sfw.climate_zone_id
   group by sfw.species_id, cz.code
),
combined as (
  select species_id, zone_code, n, false as has_w from pin_counts
  union all
  select species_id, zone_code, 0, true from windows
)
select species_id,
       zone_code,
       max(n)::int as n_pins,
       bool_or(has_w) as has_window
  from combined
 group by species_id, zone_code;

create unique index mv_species_zone_presence_pk
  on public.mv_species_zone_presence (species_id, zone_code);
create index mv_species_zone_presence_by_zone
  on public.mv_species_zone_presence (zone_code);

-- Anon-readable. The view contains only aggregate counts — no PII.
grant select on public.mv_species_zone_presence to anon, authenticated;

-- Helper RPC so the client doesn't need to know the view name.
create or replace function public.species_zone_presence_all()
returns table (
  species_id uuid,
  zone_code text,
  n_pins int,
  has_window boolean
)
language sql stable security definer set search_path = public
as $$
  select species_id, zone_code, n_pins, has_window
    from public.mv_species_zone_presence;
$$;

-- Convenience for refreshing after imports / edits.
create or replace function public.refresh_species_zone_presence()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  refresh materialized view concurrently public.mv_species_zone_presence;
end;
$$;
