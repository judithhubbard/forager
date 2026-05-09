-- RPC for personal-data export: returns track points with lat/lng
-- projected from the geography column, ordered by track + time. The
-- `track_points` table stores `location` as a PostGIS geography
-- without separate lat/lng columns; PostgREST can't project that
-- on the fly for a SELECT, so we wrap it in a function.

create or replace function public.export_track_points(p_track_ids uuid[])
returns table (
  track_id     uuid,
  lat          double precision,
  lng          double precision,
  recorded_at  timestamptz,
  elevation_m  double precision
)
language sql
stable
security invoker
as $$
  select
    tp.track_id,
    ST_Y(tp.location::geometry) as lat,
    ST_X(tp.location::geometry) as lng,
    tp.recorded_at,
    tp.elevation_m
    from public.track_points tp
   where tp.track_id = any(p_track_ids)
   order by tp.track_id, tp.recorded_at;
$$;

grant execute on function public.export_track_points(uuid[]) to authenticated;
