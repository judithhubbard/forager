-- Track favorites: per-track 'starred' flag so users can pick out
-- repeat-favorite hikes from a long history. Default false; user
-- toggles via the star button on /tracks. RLS already scopes
-- tracks to the owner so no policy change needed for this column.

alter table public.tracks
  add column if not exists is_favorite boolean not null default false;

create index if not exists tracks_is_favorite_idx
  on public.tracks (user_id, is_favorite)
  where is_favorite = true;
