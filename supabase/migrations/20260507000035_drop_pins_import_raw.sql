-- Drop pins.import_raw to recover ~500 MB.
--
-- This jsonb column was added in the original schema to store the
-- full source row of every imported pin (Dryad/NYC/SF/etc CSVs)
-- as an audit trail. In practice nothing in the codebase queries
-- it — no view, RPC, or UI feature touches it. The data is fully
-- recoverable by re-running the import scripts against the public
-- source CSVs, which is strictly better since the source can
-- correct errors over time.
--
-- At 425k imported pins × ~1.5 KB per row, the column held
-- 400-500 MB of mostly-redundant strings ("NA" for the many fields
-- Dryad doesn't populate per-row). On a 500 MB Supabase DB tier
-- that pushed the project over the cap and Supabase put writes
-- into read-only mode.

alter table public.pins drop column if exists import_raw;
