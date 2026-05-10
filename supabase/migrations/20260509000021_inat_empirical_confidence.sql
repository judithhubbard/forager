-- Adds an 'empirical_inat' tier to the window_confidence enum, for
-- harvest windows derived empirically from iNaturalist phenology
-- annotations (Fruiting / Flowering observations binned by climate
-- zone). Parallel to the existing 'empirical_npn' tier — same idea
-- (real observations, not heuristics or single-blog citations) but
-- using a different source with broader species coverage and noisier
-- annotations.

alter type public.window_confidence add value if not exists 'empirical_inat';
