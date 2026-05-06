-- Phase 1D: edibility + culinary content layer (PLAN.md).
--
-- Existing species columns cover identification (common_name,
-- scientific_name, aliases) and a one-line safety_notes. To
-- differentiate from incumbents and turn this into a real foraging
-- guide, add the structured + prose fields below. Filling them out
-- is its own ongoing task (Wikidata import + manual curation); the
-- migration is just the schema.

alter table public.species
  add column if not exists preparation_methods text[]
    default '{}'::text[],
  add column if not exists usage_notes text,
  add column if not exists harvest_tips text,
  add column if not exists toxicity_notes text,
  add column if not exists attribution text;

-- Anon read access (Phase 2): species and its new content fields are
-- safe to expose to anonymous viewers — that's what makes the
-- /species/[id] page a real selling point. Existing RLS on the
-- species table already permits public select; this index just makes
-- a future "what can I cook with [method]" filter cheap.
create index if not exists species_preparation_methods_gin
  on public.species using gin (preparation_methods);
