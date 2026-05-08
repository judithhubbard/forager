-- species_fruiting_windows.region_id was kept NOT NULL after the
-- Phase 1A cutover for legacy compatibility. With frost-offset rows
-- now keyed strictly by climate_zone_id (not by any specific region),
-- the column is logically meaningless for those rows. Make it
-- nullable so the generator stops needing an Ithaca-region
-- placeholder. The /windows page can then query by zone instead of
-- region.

alter table public.species_fruiting_windows
  alter column region_id drop not null;
