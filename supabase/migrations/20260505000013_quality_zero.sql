-- Allow quality_rating = 0 to mean "checked the tree, but no harvest
-- happened" (e.g. unripe / picked clean / unreachable that day).
-- 1-5 still mean a successful harvest of varying quality. Null still
-- means "no rating provided" (e.g. observation logged for a non-ripe
-- stage where quality is irrelevant).

alter table public.observations
  drop constraint if exists observations_quality_rating_check;

alter table public.observations
  add constraint observations_quality_rating_check
  check (quality_rating is null or quality_rating between 0 and 5);
