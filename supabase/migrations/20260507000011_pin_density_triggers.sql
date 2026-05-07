-- Incremental maintenance for pin_density_grid via row-level
-- triggers on public.pins. Eliminates the need to call
-- refresh_pin_density() for individual pin changes — the grid
-- stays in sync automatically.
--
-- Logic:
--   INSERT (visibility='public') → +1 in each band's bucket
--   UPDATE location/visibility    → -1 in old buckets if was public,
--                                   +1 in new buckets if is public now
--   DELETE (was visibility='public') → -1 in each band's bucket
--   Buckets that drop to zero are deleted so the grid stays compact.
--
-- Bulk imports still use refresh_pin_density() at the end (the
-- framework disables these triggers during the bulk insert to
-- avoid 35k×5-band overhead per import).

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
  -- Determine which side of the +1/-1 applies.
  if TG_OP = 'INSERT' then
    is_public_now := (NEW.visibility = 'public');
  elsif TG_OP = 'DELETE' then
    was_public := (OLD.visibility = 'public');
  else  -- UPDATE
    was_public := (OLD.visibility = 'public');
    is_public_now := (NEW.visibility = 'public');
  end if;

  -- Nothing public on either side → nothing to do.
  if not was_public and not is_public_now then
    return null;
  end if;

  -- Walk every band; apply the delta in each.
  for b in 0..4 loop
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

  return null;  -- AFTER triggers ignore the return value anyway.
end;
$$;

drop trigger if exists tg_pin_density_track_ins on public.pins;
create trigger tg_pin_density_track_ins
  after insert on public.pins
  for each row execute function public.tg_pin_density_track();

drop trigger if exists tg_pin_density_track_upd on public.pins;
create trigger tg_pin_density_track_upd
  after update of location, visibility on public.pins
  for each row execute function public.tg_pin_density_track();

drop trigger if exists tg_pin_density_track_del on public.pins;
create trigger tg_pin_density_track_del
  after delete on public.pins
  for each row execute function public.tg_pin_density_track();
