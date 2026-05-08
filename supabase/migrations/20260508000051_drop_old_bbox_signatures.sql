-- Drop the 5-argument bbox RPC variants. Migration 50 added 6-arg
-- versions (with p_zoom) using `create or replace function`, which
-- creates a NEW function alongside the old one when signatures
-- differ. PostgREST sees both candidates and refuses to dispatch:
--   PGRST203 "Could not choose the best candidate function".
-- Drop the old ones so the 6-arg versions are the sole match.
-- The 6-arg versions have `p_zoom int default 18`, so callers
-- that omit zoom still work (server fills in 18 = no decimation).

drop function if exists public.public_pins_bbox(
  double precision, double precision, double precision, double precision, integer
);

drop function if exists public.region_pins_bbox(
  uuid, double precision, double precision, double precision, double precision, integer
);
