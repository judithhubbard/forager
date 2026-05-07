-- Slim public_pins_bbox so it doesn't pay v_pin_effective's per-row
-- subquery cost. With ~220k public pins now (Dryad import), the old
-- shape was running pin_in_window twice + 4 EXISTS + a max() per
-- returned pin (~3000 subqueries per fetch) and individual NYC bboxes
-- were taking 5–6s. The viewport-sequence guard in the client
-- discards responses that arrive after a newer pan, so any pan
-- motion meant pins never rendered at all.
--
-- The trick: same return shape (setof v_pin_effective) so the client
-- doesn't have to change, but populate the expensive boolean/status
-- fields with cheap placeholders. effective_status falls back to
-- pins.status — for the public dataset this is identical 99.99% of
-- the time (no per-pin observation overrides on imports). Ripeness
-- and observation-history fields default false; the "Ripe today" /
-- "Productive" filters degrade gracefully (no matches) rather than
-- holding up the whole map fetch. The detail panel still calls
-- get_pin_effective(id) which goes through v_pin_effective, so
-- per-pin opens get the rich fields when they actually matter.
--
-- region_pins_bbox keeps the full v_pin_effective shape — the user's
-- own region is a few thousand pins at most, so the heavy subqueries
-- are tractable there and "Ripe today" stays useful inside the
-- region the user actually forages in.

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
