-- Both public_pins_bbox and region_pins_bbox filtered the v_pin_effective
-- view via `lng between … and lat between …`. lng/lat are ST_X/ST_Y of
-- pins.location — *computed* columns — so the GIST spatial index on
-- pins.location can't be used. Postgres ended up computing every per-row
-- subquery in v_pin_effective (pin_in_window ×2, several EXISTS, the
-- best-quality max()) across all public pins before filtering by
-- coordinate, which timed out as 500s on the public layer at high zoom
-- in dense areas (Toronto, NYC).
--
-- Fix: pre-filter pin ids using `location && ST_MakeEnvelope(...)`
-- (which DOES hit the GIST index), cap the candidate set at p_max_rows,
-- then join v_pin_effective for the rich fields. The view's heavy
-- subqueries now only run for the ≤500 surviving rows.

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
security invoker
as $$
  with hits as (
    select p.id, p.created_at
      from public.pins p
     where p.visibility = 'public'
       and p.location && ST_MakeEnvelope(
             p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
           )
     order by p.created_at desc
     limit greatest(1, least(p_max_rows, 1000))
  )
  select v.*
    from public.v_pin_effective v
    join hits h on h.id = v.id
   order by h.created_at desc;
$$;

grant execute on function public.public_pins_bbox(
  double precision, double precision, double precision, double precision, int
) to anon, authenticated;

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
  with hits as (
    select p.id, p.created_at
      from public.pins p
     where p.region_id = p_region_id
       and p.location && ST_MakeEnvelope(
             p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326
           )
     order by p.created_at desc
     limit greatest(1, least(p_max_rows, 2000))
  )
  select v.*
    from public.v_pin_effective v
    join hits h on h.id = v.id
   order by h.created_at desc;
$$;

grant execute on function public.region_pins_bbox(
  uuid, double precision, double precision, double precision, double precision, int
) to authenticated;
