-- Make the region bbox RPC return ONLY the user's non-public pins.
-- The companion public_pins_bbox already covers every public-
-- visibility pin in the bbox (imports + admin-promoted), so the
-- old region RPC duplicating those rows wasted DB work + network
-- bandwidth. Each call returned up to 2000 mostly-overlapping
-- pins which the client merge-deduped — a 2x tax on every
-- viewport change.
--
-- After this migration:
--   public_pins_bbox  → all public pins in bbox (anon-readable)
--   region_pins_bbox  → user's non-public pins (shared/private)
--                       within the region (RLS-gated by membership)
-- The two are now disjoint by visibility, so the client merge is
-- a simple concat with no dedup needed (the dedup stays as a
-- safety net but is effectively a no-op).

create or replace function public.region_pins_bbox(
  p_region_id uuid,
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_max_rows int default 1000
)
returns setof public.v_pin_effective
language sql
stable
security invoker
as $$
  select v.*
    from public.v_pin_effective v
   where v.region_id = p_region_id
     and v.visibility <> 'public'    -- public pins come via public_pins_bbox
     and v.lng between p_min_lng and p_max_lng
     and v.lat between p_min_lat and p_max_lat
   order by hashtextextended(v.id::text, 0)
   limit greatest(1, least(p_max_rows, 2500));
$$;

grant execute on function public.region_pins_bbox(
  uuid, double precision, double precision, double precision, double precision, int
) to authenticated;

-- Same disjoint-set treatment for the summary RPC. The client merges
-- region + public summaries with `Math.max` precisely because of the
-- old overlap; with this filter the merge can drop to a simple
-- additive merge later.
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
     and visibility <> 'public'
     and location && ST_MakeEnvelope(
           p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
         )
   group by species_id;
$$;

grant execute on function public.region_pins_bbox_summary(
  uuid, double precision, double precision, double precision, double precision
) to authenticated;
