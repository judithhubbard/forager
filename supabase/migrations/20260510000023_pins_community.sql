-- Add a `community` text column to pins so state-level aggregator
-- imports (Wisconsin DNR pooling 200+ municipalities, Utah FFSL 248,
-- Montréal's 19 boroughs, etc.) can preserve the per-pin municipality
-- name for heatmap tooltips and future filtering.
--
-- Nullable: pre-existing pins from single-city imports don't have a
-- distinct community and that's fine (the metros.ts lookup still
-- gives a city name for those).
--
-- No GiST/GIN index — the read path is "modal community in bbox",
-- which uses the existing GIST(location) for the bbox filter and
-- then a small GROUP BY community on the bbox-matched subset.

alter table public.pins
  add column if not exists community text;

comment on column public.pins.community is
  'Sub-region name from the import source (e.g. Wisconsin DNR''s `Community` field, Montréal''s borough). Used for heatmap-cell tooltips on state-level aggregator imports. Nullable.';
