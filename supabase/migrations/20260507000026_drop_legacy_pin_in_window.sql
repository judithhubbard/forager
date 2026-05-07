-- Drop the orphaned 4-arg pin_in_window overload (no buffer_days
-- parameter). Migration 17 added the 5-arg variant but didn't drop
-- the original; nothing in the codebase calls the 4-arg version
-- now (v_pin_effective and the slim public_pins_bbox both pass an
-- explicit buffer_days), so its only effect was making test calls
-- like `pin_in_window(id, 'ripe')` ambiguous.

drop function if exists public.pin_in_window(uuid, stage, uuid, date);
