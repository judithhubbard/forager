-- Generalize migration 16's promote-imports-to-public to cover ALL
-- import-sourced pins, not just the original three Ithaca-area
-- inventories. The newer scrapes (NYC, Chicago, SF, Boston, Toronto)
-- defaulted to visibility='shared' because the framework's
-- bulkUpsertImportedPins didn't set visibility, so the column took
-- its 'shared' default. They were imported but invisible to anyone
-- outside their region.
--
-- Going forward the framework will set visibility='public' on
-- insert directly (see scripts/import/lib/upsert.ts), so the only
-- pins this migration promotes are the existing rows.

alter table public.pins disable trigger tg_gate_public_pins;
alter table public.observations disable trigger tg_gate_public_observations;
alter table public.photos disable trigger tg_gate_public_photos;
alter table public.hazards disable trigger tg_gate_public_hazards;

-- Anything with an import_source is curated/external data that's
-- intended for the public layer. User-created pins
-- (import_source IS NULL) stay shared/private.
update public.pins
   set visibility = 'public'
 where import_source is not null
   and visibility <> 'public';

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

alter table public.pins enable trigger tg_gate_public_pins;
alter table public.observations enable trigger tg_gate_public_observations;
alter table public.photos enable trigger tg_gate_public_photos;
alter table public.hazards enable trigger tg_gate_public_hazards;
