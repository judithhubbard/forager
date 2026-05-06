-- Track recording for Forager Pro: GPS paths from foraging outings,
-- viewable individually + as an aggregate heatmap of where the user
-- has been.
--
-- Two tables:
--   tracks         — one row per outing. Stores the full LineString
--                    plus metadata (when, how long, source).
--   track_points   — fine-grained samples for re-rendering the path
--                    at any zoom and for the heatmap aggregation.
--                    Optional: a track ingested from a GPX file may
--                    only populate tracks.path and skip the points,
--                    while live recording fills both.
--
-- The path geometry is denormalized for query speed — heatmap and
-- track-list rendering both read it without aggregating thousands
-- of points client-side. A trigger could rebuild it from points on
-- write; for v1 the application layer is responsible.
--
-- Tracks are PRIVATE by default. Location history is more sensitive
-- than individual pins; opt-in sharing only.

create table if not exists public.tracks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Optional region attribution — useful for filtering "tracks in my
  -- group's region" but not required (a hike might cross regions).
  region_id    uuid references public.regions(id) on delete set null,
  started_at   timestamptz not null,
  ended_at     timestamptz,
  -- LineString in WGS84. Stored even when track_points is empty
  -- (e.g. an imported GPX where we only kept the simplified path).
  path         geometry(LineString, 4326),
  distance_m   numeric,
  -- 'live' (browser geolocation), 'gpx', 'kml'.
  source       text not null default 'live',
  visibility   text not null default 'private',
  title        text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (visibility in ('private', 'shared', 'public')),
  check (source in ('live', 'gpx', 'kml'))
);

create index if not exists tracks_user_idx
  on public.tracks (user_id, started_at desc);
create index if not exists tracks_region_idx
  on public.tracks (region_id) where region_id is not null;
create index if not exists tracks_path_gist
  on public.tracks using gist (path);

create table if not exists public.track_points (
  track_id     uuid not null references public.tracks(id) on delete cascade,
  recorded_at  timestamptz not null,
  location     geography(Point, 4326) not null,
  accuracy_m   numeric,
  elevation_m  numeric,
  primary key (track_id, recorded_at)
);

create index if not exists track_points_location_gist
  on public.track_points using gist (location);

alter table public.tracks enable row level security;
alter table public.track_points enable row level security;

-- Tracks RLS — same shape as pins. Owner sees own; region members
-- see shared; everyone sees public. No anon RLS yet (tracks are
-- Pro-tier; anon doesn't need to see them). Add an anon policy
-- alongside the public-toggle UI when that ships.
drop policy if exists tracks_select_own on public.tracks;
create policy tracks_select_own on public.tracks
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      visibility = 'shared'
      and region_id is not null
      and public.is_region_member(auth.uid(), region_id)
    )
    or visibility = 'public'
  );

drop policy if exists tracks_insert_self on public.tracks;
create policy tracks_insert_self on public.tracks
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists tracks_update_self on public.tracks;
create policy tracks_update_self on public.tracks
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists tracks_delete_self on public.tracks;
create policy tracks_delete_self on public.tracks
  for delete to authenticated
  using (user_id = auth.uid());

-- track_points are gated through tracks. Cheaper than re-checking
-- ownership on every row: an EXISTS lookup hits the tracks_user_idx.
drop policy if exists track_points_select on public.track_points;
create policy track_points_select on public.track_points
  for select to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_points.track_id
        and (
          t.user_id = auth.uid()
          or (
            t.visibility = 'shared'
            and t.region_id is not null
            and public.is_region_member(auth.uid(), t.region_id)
          )
          or t.visibility = 'public'
        )
    )
  );

drop policy if exists track_points_write on public.track_points;
create policy track_points_write on public.track_points
  for all to authenticated
  using (
    exists (
      select 1 from public.tracks t
      where t.id = track_points.track_id
        and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tracks t
      where t.id = track_points.track_id
        and t.user_id = auth.uid()
    )
  );

-- updated_at trigger to keep the cached field fresh on any UPDATE.
create or replace function public.tg_tracks_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists tg_tracks_updated_at on public.tracks;
create trigger tg_tracks_updated_at
  before update on public.tracks
  for each row execute function public.tg_tracks_set_updated_at();
