-- Per-pin climate zone, computed from lng/lat via zone_for_point.
-- The original data model assumed each pin's zone came from its
-- region — fine for spatial regions like "Ithaca" but broken for
-- the Dryad virtual region that spans 60 US cities. With a
-- per-pin column, phenology lookups can resolve each pin to its
-- actual zone independent of region membership.
--
-- Add the missing zone codes first (4a–9b were the original seed,
-- but the USDA dataset spans 3a–11a in the conterminous US).

insert into public.climate_zones (code, name)
values
  ('3a',  'USDA Zone 3a'),
  ('3b',  'USDA Zone 3b'),
  ('10a', 'USDA Zone 10a'),
  ('10b', 'USDA Zone 10b'),
  ('11a', 'USDA Zone 11a')
on conflict (code) do nothing;

-- Per-pin climate zone column. Nullable for pins outside the USDA
-- dataset (Alaska, Hawaii, Canada, Mexico — fall back to region's
-- assigned zone or a latitude-band heuristic). Backfilled below.
alter table public.pins
  add column if not exists climate_zone_id uuid references public.climate_zones(id);

create index if not exists pins_climate_zone_idx
  on public.pins (climate_zone_id)
  where climate_zone_id is not null;

-- Backfill happens out-of-band via scripts/import/backfill-pin-zones.ts
-- (220k-row UPDATE in one transaction would blow the 2-minute statement
-- timeout; the script paginates).

-- Trigger to keep climate_zone_id in sync with location. Fires on
-- INSERT (every new pin) and UPDATE-of-location. Doesn't reset for
-- pins outside the USDA dataset — those keep null and the caller
-- falls back at read time.
create or replace function public.tg_maintain_pin_climate_zone()
returns trigger
language plpgsql
as $$
declare
  zc text;
  zid uuid;
begin
  if (new.location is null) then
    new.climate_zone_id := null;
    return new;
  end if;
  -- Only recompute when location actually changed (or it's a new row).
  if tg_op = 'UPDATE' and old.location = new.location then
    return new;
  end if;
  zc := public.zone_for_point(
    ST_X(new.location::geometry),
    ST_Y(new.location::geometry)
  );
  if zc is null then
    new.climate_zone_id := null;
    return new;
  end if;
  select id into zid from public.climate_zones where code = zc limit 1;
  new.climate_zone_id := zid;
  return new;
end;
$$;

drop trigger if exists pins_maintain_climate_zone on public.pins;
create trigger pins_maintain_climate_zone
before insert or update of location on public.pins
for each row execute function public.tg_maintain_pin_climate_zone();
