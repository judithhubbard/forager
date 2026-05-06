-- Surfaces lat/lng of every track_point for the heatmap layer.
-- PostgREST returns geography columns as hex WKB by default, which
-- the browser would have to parse. A simple view that extracts
-- ST_Y / ST_X gives the client clean numeric columns and inherits
-- the parent table's RLS (security_invoker = on), so a user only
-- sees points belonging to their own tracks.

create or replace view public.v_track_points_latlng
  with (security_invoker = on) as
  select
    p.track_id,
    p.recorded_at,
    ST_X(p.location::geometry) as lng,
    ST_Y(p.location::geometry) as lat,
    p.elevation_m,
    p.accuracy_m
  from public.track_points p;

grant select on public.v_track_points_latlng to authenticated;
