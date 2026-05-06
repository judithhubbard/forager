-- Phase 2A boot: promote imported pins to the public dataset.
--
-- Imports come from authoritative sources (Cornell Campus Tree
-- Inventory, City of Ithaca, Cornell Botanic Gardens) — exactly the
-- material that should be visible to anonymous browsers. User-
-- created pins (import_source IS NULL) stay shared/private.
--
-- The visibility trigger from 20260506000015_public_visibility
-- restricts visibility='public' writes to global admins. To run
-- this migration you must apply it as the database owner (which
-- happens automatically when running through the Supabase SQL
-- editor or `supabase db push` — both bypass RLS but still execute
-- the trigger). The trigger checks profiles.is_global_admin against
-- auth.uid(); when no auth.uid() (i.e. service_role or db owner),
-- the check fails. To handle this cleanly, the script disables the
-- trigger for the duration of the bulk update.

alter table public.pins disable trigger tg_gate_public_pins;
alter table public.observations disable trigger tg_gate_public_observations;
alter table public.photos disable trigger tg_gate_public_photos;
alter table public.hazards disable trigger tg_gate_public_hazards;

update public.pins
   set visibility = 'public'
 where import_source in ('cornell-cti', 'ithaca-ti', 'cornell-bg')
   and visibility <> 'public';

-- Observations on now-public pins go public too. (Reasoning: a
-- ripe/quality observation logged on a public pin is exactly what
-- makes the public layer useful to anon — "Cornelian cherry at this
-- corner was ripe Aug 15, 4 stars".)
update public.observations o
   set visibility = 'public'
  from public.pins p
 where o.pin_id = p.id
   and p.visibility = 'public'
   and o.visibility <> 'public';

update public.photos pt
   set visibility = 'public'
  from public.pins p
 where pt.pin_id = p.id
   and p.visibility = 'public'
   and pt.visibility <> 'public';

-- Hazards intentionally NOT mass-promoted — a safety hazard like
-- ticks or unstable_terrain on a private pin shouldn't leak. The
-- access_status (Phase 1E) lives directly on pins and does flow to
-- anon via the public-pins SELECT.

alter table public.pins enable trigger tg_gate_public_pins;
alter table public.observations enable trigger tg_gate_public_observations;
alter table public.photos enable trigger tg_gate_public_photos;
alter table public.hazards enable trigger tg_gate_public_hazards;
