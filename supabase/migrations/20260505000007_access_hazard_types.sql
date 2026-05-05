-- Extend hazard_type enum with access-related markers.
-- These aren't strictly "hazards" (safety), but they're per-pin conditions
-- that the user wants to flag and view in the same chip area.
--
-- ALTER TYPE ADD VALUE must run outside a transaction (Postgres limitation).

alter type hazard_type add value if not exists 'out_of_reach';
alter type hazard_type add value if not exists 'inaccessible';
alter type hazard_type add value if not exists 'fenced';
