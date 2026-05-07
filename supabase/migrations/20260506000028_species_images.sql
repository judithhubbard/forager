-- Species hero images, sourced from Wikidata P18 + Wikimedia Commons.
-- Populated by scripts/import/wikidata-images.ts; rendered on
-- /species/[id]. The credit string is required by the Commons
-- license — Wikimedia images are mostly CC BY-SA 4.0 or CC BY 4.0,
-- both of which mandate visible author + license + source link.

alter table public.species
  add column if not exists image_url text,
  add column if not exists image_attribution text;

comment on column public.species.image_url is
  'Direct image URL (typically a Wikimedia Commons Special:FilePath thumbnail). Null if no image is available.';
comment on column public.species.image_attribution is
  'Free-form credit string with author + license + source link. Required to display image_url legally.';
