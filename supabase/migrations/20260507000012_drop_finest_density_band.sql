-- Consolidate the density grid from 5 bands to 4. Band 4 (eps
-- 0.001° ≈ 110 m cells) was finer than the typical pin-spacing
-- pattern: with ~35k public pins clustered along streets,
-- the band-4 grid had ~18k buckets averaging only ~2 pins each,
-- so the heatmap at zoom 12 showed mostly singletons (pale
-- yellow) with real geographic gaps between streets reading as
-- 'large blocks of empty map.' At band 3 (~550 m cells) the
-- average density jumps to ~12 pins/cell, so coverage looks
-- continuous.
--
-- Changes:
--   - band_for_zoom returns 3 (was 4) for zoom >= 10
--   - eps_for_band(4) becomes a no-op (returns 0.5 fallback)
--   - drop existing band-4 rows from pin_density_grid
--   - the trigger function still iterates 0..4 but band 4 inserts
--     are harmless (band_for_zoom never reads them)
--
-- Net effect on rendering: zoom 11→12 stays in the same band, so
-- the abrupt resolution change the user reported between those
-- zooms goes away. Zoom 13+ still drops to individual-pin mode.

create or replace function public.band_for_zoom(p_zoom int)
returns int
language sql
immutable
as $$
  select case
    when p_zoom < 6 then 0
    when p_zoom < 8 then 1
    when p_zoom < 10 then 2
    else 3
  end;
$$;

-- Drop the now-unused band-4 rows. Keeping them would waste storage
-- and confuse future contributors reading the grid.
delete from public.pin_density_grid where zoom_band = 4;

-- The trigger function still loops 0..4 — clamp to 0..3 so band-4
-- buckets aren't recreated on every insert.
create or replace function public.tg_pin_density_track()
returns trigger
language plpgsql
as $$
declare
  b int;
  eps double precision;
  old_bx int; old_by int;
  new_bx int; new_by int;
  was_public boolean := false;
  is_public_now boolean := false;
begin
  if TG_OP = 'INSERT' then
    is_public_now := (NEW.visibility = 'public');
  elsif TG_OP = 'DELETE' then
    was_public := (OLD.visibility = 'public');
  else
    was_public := (OLD.visibility = 'public');
    is_public_now := (NEW.visibility = 'public');
  end if;

  if not was_public and not is_public_now then
    return null;
  end if;

  for b in 0..3 loop
    eps := public.eps_for_band(b);

    if was_public
       and TG_OP <> 'INSERT'
       and OLD.location is not null then
      old_bx := floor(ST_X(OLD.location::geometry) / eps)::int;
      old_by := floor(ST_Y(OLD.location::geometry) / eps)::int;
      update public.pin_density_grid
         set count_pins = count_pins - 1
       where zoom_band = b and bx = old_bx and by = old_by;
      delete from public.pin_density_grid
       where zoom_band = b and bx = old_bx and by = old_by
         and count_pins <= 0;
    end if;

    if is_public_now
       and TG_OP <> 'DELETE'
       and NEW.location is not null then
      new_bx := floor(ST_X(NEW.location::geometry) / eps)::int;
      new_by := floor(ST_Y(NEW.location::geometry) / eps)::int;
      insert into public.pin_density_grid (zoom_band, bx, by, count_pins)
        values (b, new_bx, new_by, 1)
        on conflict (zoom_band, bx, by) do update
          set count_pins = pin_density_grid.count_pins + 1;
    end if;
  end loop;

  return null;
end;
$$;

-- refresh_pin_density also loops 0..4 — same clamp.
create or replace function public.refresh_pin_density()
returns void
language plpgsql
as $$
begin
  truncate public.pin_density_grid;
  insert into public.pin_density_grid (zoom_band, bx, by, count_pins)
  select
    b,
    floor(ST_X(p.location::geometry) / public.eps_for_band(b))::int as bx,
    floor(ST_Y(p.location::geometry) / public.eps_for_band(b))::int as by,
    count(*)::int
  from generate_series(0, 3) b
  cross join public.pins p
  where p.visibility = 'public'
  group by
    b,
    floor(ST_X(p.location::geometry) / public.eps_for_band(b))::int,
    floor(ST_Y(p.location::geometry) / public.eps_for_band(b))::int;
end;
$$;

-- Re-run refresh to make sure bands 0-3 are in lockstep with the
-- current public-pin set.
select public.refresh_pin_density();
