-- species_fruiting_windows: support multiple complex entries per
-- (species, zone, stage). Year-wrap species (cherimoya Nov-May,
-- lemon year-round, cattail rhizome Sep-Mar, etc.) cannot be expressed
-- as a single window with start_doy < end_doy. The unify pipeline
-- wanted to write two rows per zone (late-year + early-year) but
-- silently overwrote because the SELECT-existing clause matched
-- by (species, zone, stage) only — so the second complex entry
-- updated the row the first one just wrote.
--
-- Fix: add a nullable `complex_name` column. The unify pipeline now
-- includes complex_name in its existing-row lookup, so different
-- complex entries write to different rows. Existing rows are
-- backfilled from the notes field (which already encodes the complex
-- name like "Cherimoya unified harvest curve. ...").
--
-- No unique constraint added — the framework relies on the unify
-- pipeline to manage duplicates, same as before. The downstream
-- views (effective_windows, species_source_summary) already SELECT
-- all matching rows per (species, zone), so they'll naturally surface
-- the new multi-row entries without code changes.

alter table public.species_fruiting_windows
  add column if not exists complex_name text;

-- Backfill complex_name from notes for rows the unify pipeline
-- previously wrote. Pattern: "Cherimoya (late-year) unified harvest curve. ..."
-- Anything not matching this pattern (iNat-empirical-only rows,
-- frost-offset rows, etc.) stays complex_name = null.
update public.species_fruiting_windows
   set complex_name = regexp_replace(notes, ' unified harvest curve\..*$', '')
 where complex_name is null
   and notes is not null
   and notes like '%unified harvest curve%';

-- Index for the unify pipeline's per-complex SELECT lookup.
create index if not exists sfw_species_zone_stage_complex_idx
  on public.species_fruiting_windows (species_id, climate_zone_id, stage, complex_name);

comment on column public.species_fruiting_windows.complex_name is
  'Name of the species-complex entry in scripts/species-complex-unify.cjs that produced this row. Nullable for non-complex rows (iNat-empirical only, frost-offset, manual). Lets multiple complex entries (e.g. Cherimoya late-year + Cherimoya early-year) coexist as separate rows for the same (species, zone, stage), supporting year-wrap windows that cannot be expressed as a single start<end DOY range.';
