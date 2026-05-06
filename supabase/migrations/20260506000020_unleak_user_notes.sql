-- Fix the Phase 2A boot: 20260506000016_promote_imports_to_public
-- promoted observations + photos on imported pins to visibility=
-- 'public' along with the pins themselves, and left pins.status
-- alone — so user-logged "not_good" / "confirmed harvest history"
-- annotations on the Cornell-CTI / Ithaca-TI / Cornell-BG pins
-- became visible to anonymous browsers.
--
-- The intent of the public layer is admin-curated *location* data
-- only. User-private journal content (status changes, observations,
-- photos) should stay scoped to the owner / their region until the
-- user explicitly opts into sharing.
--
-- Three corrections:
--   1. Reset pins.status to 'active' on imported pins so anon does
--      not see the previous owner's "not_good" / "gone" calls.
--   2. Demote observation rows on those pins back to visibility=
--      'shared' so RLS on observations hides them from anon (and
--      the EXISTS subqueries in v_pin_effective likewise stop
--      returning true for anon callers — the view runs with
--      security_invoker = on so anon's RLS applies in the subquery).
--   3. Same for photos.

-- Disable the public-visibility gating trigger; this script runs as
-- the database owner / service role with no auth.uid() set, so the
-- trigger's is_global_admin check would block the writes.
alter table public.pins disable trigger tg_gate_public_pins;
alter table public.observations disable trigger tg_gate_public_observations;
alter table public.photos disable trigger tg_gate_public_photos;

-- 1. Reset status on imported pins.
update public.pins
   set status = 'active'
 where import_source in ('cornell-cti', 'ithaca-ti', 'cornell-bg')
   and status <> 'active';

-- 2. Demote observations on imported pins.
update public.observations o
   set visibility = 'shared'
  from public.pins p
 where o.pin_id = p.id
   and p.import_source in ('cornell-cti', 'ithaca-ti', 'cornell-bg')
   and o.visibility = 'public';

-- 3. Demote photos on imported pins.
update public.photos pt
   set visibility = 'shared'
  from public.pins p
 where pt.pin_id = p.id
   and p.import_source in ('cornell-cti', 'ithaca-ti', 'cornell-bg')
   and pt.visibility = 'public';

alter table public.pins enable trigger tg_gate_public_pins;
alter table public.observations enable trigger tg_gate_public_observations;
alter table public.photos enable trigger tg_gate_public_photos;
