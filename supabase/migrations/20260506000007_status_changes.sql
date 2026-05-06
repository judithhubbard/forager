-- Pin status redesign:
--   * Add 'inaccessible' — physical access barrier (fenced, posted,
--     dangerous terrain). Excluded from Active.
--   * Add 'not_good'     — pin exists but yields are bad / never
--     produces / not worth the trip. Excluded from Active.
--   * Retire 'dormant'   — the value was rarely used and overlapped
--     with the seasonal harvest-window indicator. Existing dormant
--     pins are migrated back to 'active'. The enum value stays
--     (PostgreSQL can't easily drop enum values without rebuilding
--     the type) but the UI no longer offers it.
--
-- ALTER TYPE ADD VALUE cannot run inside a transaction block in
-- older Postgres versions; Supabase's SQL editor runs each statement
-- separately, so this is fine.

alter type pin_status add value if not exists 'inaccessible';
alter type pin_status add value if not exists 'not_good';

-- Migrate legacy dormant pins. Idempotent.
update public.pins
   set status = 'active'
 where status = 'dormant';
