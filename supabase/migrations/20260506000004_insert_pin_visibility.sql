-- Phase 3: insert_pin RPC accepts an optional visibility argument.
-- When the caller doesn't pass one, fall back to the region's
-- default_pin_visibility — so a personal-use region (default
-- 'private') will produce private pins by default while a shared
-- region produces shared ones, matching what the user picked at
-- welcome time.

create or replace function public.insert_pin(
  p_id              uuid,
  p_region_id       uuid,
  p_species_id      uuid,
  p_lng             double precision,
  p_lat             double precision,
  p_location_accuracy_m int   default null,
  p_display_name    text       default null,
  p_notes           text       default null,
  p_status          pin_status default 'active',
  p_visibility      text       default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  resolved_visibility text;
begin
  if p_visibility is null then
    select default_pin_visibility into resolved_visibility
      from public.regions where id = p_region_id;
    if resolved_visibility is null then resolved_visibility := 'shared'; end if;
  else
    if p_visibility not in ('shared', 'private') then
      raise exception 'visibility must be shared or private'
        using errcode = 'check_violation';
    end if;
    resolved_visibility := p_visibility;
  end if;

  insert into public.pins (
    id, region_id, created_by, species_id,
    location, location_accuracy_m,
    display_name, notes, status, visibility
  ) values (
    p_id, p_region_id, auth.uid(), p_species_id,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    p_location_accuracy_m,
    p_display_name, p_notes, p_status, resolved_visibility
  );
  return p_id;
end;
$$;

grant execute on function public.insert_pin(uuid, uuid, uuid, double precision, double precision, int, text, text, pin_status, text)
  to authenticated;
