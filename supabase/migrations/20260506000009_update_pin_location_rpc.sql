-- Move-pin support: a SECURITY INVOKER RPC to update a pin's
-- location from lng/lat. Mirrors insert_pin's PostGIS handling
-- (supabase-js can't write to a geography column directly, so we
-- accept doubles and construct the point in SQL).
--
-- RLS on pins UPDATE is unchanged: only the owner or a region admin
-- can move a pin. The function is invoker, so the caller's policies
-- apply.

create or replace function public.update_pin_location(
  p_pin_id uuid,
  p_lng    double precision,
  p_lat    double precision,
  p_location_accuracy_m int default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.pins
     set location = ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
         location_accuracy_m = p_location_accuracy_m,
         location_modified_by_user_at = now()
   where id = p_pin_id;
end;
$$;

grant execute on function public.update_pin_location(uuid, double precision, double precision, int)
  to authenticated;
