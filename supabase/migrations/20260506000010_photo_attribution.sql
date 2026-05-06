-- Phase 1H: photo attribution + license. Stored per-photo because the
-- foraging commons benefits from explicit credit + license terms on
-- every image — even the user's own. Defaults to CC BY-SA 4.0 to match
-- the share-alike spirit of contributing to a public dataset; users
-- can change per-photo.
--
-- photographer_credit overrides the default "Photo by @<username>"
-- attribution. Useful for photos the uploader didn't take themselves
-- (e.g. a friend, a public-domain reference image) — the user is still
-- the row's owner for permissions, but the visible credit is different.

alter table public.photos
  add column if not exists photographer_credit text,
  add column if not exists license text not null default 'CC-BY-SA-4.0';

-- Constrain license to a known set so the UI doesn't have to handle
-- arbitrary strings. Add new options here as needed.
alter table public.photos
  drop constraint if exists photos_license_check;
alter table public.photos
  add constraint photos_license_check
    check (license in (
      'CC-BY-SA-4.0',
      'CC-BY-4.0',
      'CC-BY-NC-SA-4.0',
      'CC0',
      'all-rights-reserved'
    ));

-- Index for future "find all CC0 photos" or "all rights reserved" filters.
create index if not exists photos_license_idx on public.photos (license);
