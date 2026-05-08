-- Expand the species catalog beyond foragables to support inedible
-- invasive entries (tree of heaven, Norway maple, English ivy, etc).
-- These get added so users can drop pins on them and the app helps
-- coordinate management / removal — same data model as foragable
-- pins, just a different content surface in the UI.
--
-- Discipline: a row with foragable=false should always have at least
-- one invasive flag. Nothing in the schema enforces this — it's a
-- catalog-curation rule, not a data integrity one — but pre-seed and
-- any future admin import jobs should obey it so the catalog doesn't
-- drift into general botany.

alter table public.species
  add column if not exists foragable boolean not null default true,
  add column if not exists identification_notes text,
  add column if not exists management_notes text;

-- A partial index for the common "inedible invasives" query path
-- (Layers panel "Show invasives" toggle pulls these). Keeps the
-- foragable=true majority out of the index entirely.
create index if not exists species_inedible_invasive_idx
  on public.species (id)
  where foragable = false;
