-- Delete inedible-invasive pins from public city-tree imports entirely.
-- Forager is a foraging app, not a city tree service — Norway maples,
-- callery pears, tree-of-heaven etc. from municipal inventories are
-- pure noise. User-pinned invasives (visibility != 'public' OR
-- import_source IS NULL) are preserved so community flagging still
-- works for managment-mode users.
--
-- Affected species (is_forageable = false): ~104k pins.
-- Top deletes: Norway maple ~78k, callery pear ~22k.
--
-- The bbox-filter (mig 10) stays in place as a defensive layer in
-- case a future import re-introduces these species.

-- Cascade: pin deletion drops associated observations, photos, hazards,
-- correction_suggestions via the existing FK ON DELETE CASCADE rules.
delete from public.pins p
using public.species sp
where p.species_id = sp.id
  and sp.is_forageable = false
  and p.visibility = 'public'
  and p.import_source is not null;
