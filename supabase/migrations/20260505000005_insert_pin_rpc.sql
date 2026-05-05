-- RPC to insert a pin from the client. supabase-js cannot write to
-- a PostGIS geography column directly, so we accept lng/lat as floats
-- and construct the point in SQL.
--
-- SECURITY INVOKER: RLS applies (the caller must be a region member,
-- which the pins INSERT policy enforces).

create or replace function public.insert_pin(
  p_id              uuid,
  p_region_id       uuid,
  p_species_id      uuid,
  p_lng             double precision,
  p_lat             double precision,
  p_location_accuracy_m int   default null,
  p_display_name    text       default null,
  p_notes           text       default null,
  p_status          pin_status default 'active'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.pins (
    id, region_id, created_by, species_id,
    location, location_accuracy_m,
    display_name, notes, status
  ) values (
    p_id, p_region_id, auth.uid(), p_species_id,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_location_accuracy_m,
    p_display_name, p_notes, p_status
  );
  return p_id;
end;
$$;

grant execute on function public.insert_pin(uuid, uuid, uuid, double precision, double precision, int, text, text, pin_status)
  to authenticated;
