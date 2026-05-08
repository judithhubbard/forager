-- Mig 69 added `species.foragable` not realizing the table already
-- has `is_forageable` from a much earlier migration. Drop the
-- duplicate; rebuild the partial index on the canonical column. The
-- seed script + UI all reference is_forageable. New columns from
-- mig 69 (identification_notes, management_notes) stay.

drop index if exists public.species_inedible_invasive_idx;

alter table public.species drop column if exists foragable;

create index if not exists species_inedible_invasive_idx
  on public.species (id)
  where is_forageable = false;
