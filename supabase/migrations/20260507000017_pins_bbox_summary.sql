-- Per-species and per-status pin counts inside a bbox, computed
-- server-side. This bypasses the 500-pin fetch cap for *counts*: we
-- don't need the full per-pin records to count them. The user-facing
-- payoff is that the species filter panel and Show dropdown can
-- report accurate totals even when the visible pins are capped, and
-- the All count = sum of the per-species counts (no more "(498+)"
-- when the user can clearly see the species list adding to far more).
--
-- Two functions, mirroring the read-path RPCs from migration 17/01:
--   public_pins_bbox_summary  — visibility='public' set
--   region_pins_bbox_summary  — single-region set (still RLS-gated)
-- Both return one row per (species_id, status) bucket; a 'status' of
-- 'active' is what the Active filter selects. Aggregating is cheap
-- because it skips v_pin_effective entirely and uses the GIST index.

create or replace function public.public_pins_bbox_summary(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision
)
returns table (
  species_id uuid,
  active_count int,
  total_count int
)
language sql
stable
security invoker
as $$
  select
    species_id,
    count(*) filter (where status = 'active')::int as active_count,
    count(*)::int                                  as total_count
    from public.pins
   where visibility = 'public'
     and location && ST_MakeEnvelope(
           p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
         )
   group by species_id;
$$;

grant execute on function public.public_pins_bbox_summary(
  double precision, double precision, double precision, double precision
) to anon, authenticated;

create or replace function public.region_pins_bbox_summary(
  p_region_id uuid,
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision
)
returns table (
  species_id uuid,
  active_count int,
  total_count int
)
language sql
stable
security invoker
as $$
  select
    species_id,
    count(*) filter (where status = 'active')::int as active_count,
    count(*)::int                                  as total_count
    from public.pins
   where region_id = p_region_id
     and location && ST_MakeEnvelope(
           p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
         )
   group by species_id;
$$;

grant execute on function public.region_pins_bbox_summary(
  uuid, double precision, double precision, double precision, double precision
) to authenticated;
