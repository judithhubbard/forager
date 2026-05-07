-- public_pins_bbox is SECURITY INVOKER, which means RLS evaluates on
-- every candidate row. For authed users the pins_select_member policy
-- runs a subquery (is_region_member) per row — at 13k+ NYC bbox
-- candidates that adds seconds before the LIMIT 500 even kicks in.
-- An EXPLAIN as the DB owner showed 25ms because owners bypass RLS;
-- production traffic was hitting 3-6s.
--
-- The function only ever returns visibility='public' rows (the WHERE
-- clause enforces it inside the function body), and the public layer
-- is already broadly readable to anon / authed alike. So switching
-- to SECURITY DEFINER preserves the same observable behavior — anyone
-- can still only see what visibility='public' allows — but skips the
-- per-row RLS evaluation. Same trick is appropriate for region_pins_bbox,
-- but we keep that one INVOKER for now since the per-region pin set is
-- small enough that RLS cost is fine and the membership check is a
-- correctness boundary worth preserving.

create or replace function public.public_pins_bbox(
  p_min_lng double precision,
  p_min_lat double precision,
  p_max_lng double precision,
  p_max_lat double precision,
  p_max_rows int default 500
)
returns setof public.v_pin_effective
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.region_id,
    p.created_by,
    p.created_at,
    p.updated_at,
    p.species_id,
    p.display_name,
    p.location_accuracy_m,
    p.location_modified_by_user_at,
    p.status,
    p.notes,
    p.import_source,
    p.import_external_id,
    p.import_raw,
    p.last_observed_at,
    p.last_observed_stage,
    p.visibility,
    p.access_status,
    p.status                       as effective_status,
    'America/New_York'::text       as region_timezone,
    false                          as is_ripe_now,
    false                          as is_ripe_strict,
    ST_X(p.location::geometry)     as lng,
    ST_Y(p.location::geometry)     as lat,
    false                          as is_inaccessible,
    false                          as has_ripe_observation_this_year,
    false                          as has_ripe_observation_ever,
    null::int                      as best_harvest_quality
    from public.pins p
   where p.visibility = 'public'
     and p.location && ST_MakeEnvelope(
           p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
         )
   order by p.created_at desc
   limit greatest(1, least(p_max_rows, 1000));
$$;

grant execute on function public.public_pins_bbox(
  double precision, double precision, double precision, double precision, int
) to anon, authenticated;

-- Same treatment for the summary RPC: SECURITY INVOKER means RLS
-- runs per row, which dominates the cost on a wide bbox. The function
-- already filters to visibility='public' explicitly.
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
security definer
set search_path = public
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
