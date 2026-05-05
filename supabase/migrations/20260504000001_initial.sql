-- Forager: initial schema
-- See PLAN.md §3 for the conceptual model and §10 for architectural commitments.

-- ============================================================
-- Extensions
-- ============================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "postgis";    -- geography types

-- ============================================================
-- Enums
-- ============================================================

create type pin_status   as enum ('active', 'gone', 'dormant', 'needs_verification');
create type stage        as enum ('flowering', 'green', 'ripening', 'ripe', 'past', 'bare', 'unknown');
create type hazard_type  as enum ('poison_ivy', 'ticks', 'private_property', 'unstable_terrain', 'water_crossing', 'traffic', 'other');
create type region_role  as enum ('admin', 'member');

-- ============================================================
-- Profiles (display name, etc. — extends auth.users)
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create a profile row when an auth user is inserted.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ============================================================
-- Regions, memberships, invitations
-- ============================================================

create table public.regions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  climate_zone text,                      -- e.g. '5b'; free text in v1, may become structured later (see PLAN §10 deferred)
  timezone text not null default 'America/New_York', -- IANA; drives DOY math
  default_map_center geography(Point, 4326),
  default_zoom int not null default 13,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.region_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete cascade,
  role region_role not null default 'member',
  joined_at timestamptz not null default now(),
  unique (user_id, region_id)
);
create index region_memberships_user_idx   on public.region_memberships(user_id);
create index region_memberships_region_idx on public.region_memberships(region_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users(id),
  role region_role not null default 'member',
  token text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index invitations_region_idx on public.invitations(region_id);
create index invitations_email_idx  on public.invitations(lower(email));

-- ============================================================
-- Species (global) and fruiting windows
-- ============================================================

create table public.species (
  id uuid primary key default gen_random_uuid(),
  scientific_name text not null unique,
  common_name text not null,
  aliases text[] not null default '{}',
  is_forageable boolean not null default true,
  forage_parts text[] not null default '{}',  -- 'fruit' | 'nut' | 'flower' | 'leaf' | 'mushroom' | 'root' | 'bark' | 'seed' | 'sap'
  safety_notes text not null default ''
);
create index species_aliases_idx on public.species using gin(aliases);

create table public.species_fruiting_windows (
  id uuid primary key default gen_random_uuid(),
  species_id uuid not null references public.species(id) on delete cascade,
  region_id  uuid not null references public.regions(id) on delete cascade,
  stage stage not null,
  start_doy int not null check (start_doy between 1 and 366),
  end_doy   int not null check (end_doy   between 1 and 366),
  peak_doy  int      check (peak_doy  is null or peak_doy between 1 and 366),
  notes text,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create index sfw_species_region_idx on public.species_fruiting_windows(species_id, region_id);

create table public.user_fruiting_window_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  species_id uuid not null references public.species(id) on delete cascade,
  region_id  uuid not null references public.regions(id) on delete cascade,
  stage stage not null,
  start_doy int not null check (start_doy between 1 and 366),
  end_doy   int not null check (end_doy   between 1 and 366),
  notes text,
  updated_at timestamptz not null default now(),
  unique (user_id, species_id, region_id, stage)
);

create table public.region_seasonal_shifts (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete cascade,
  year int not null,
  offset_days int not null default 0,
  notes text,
  set_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (region_id, year)
);

-- ============================================================
-- Pins (the central entity)
-- ============================================================

create table public.pins (
  id uuid primary key default gen_random_uuid(),
  region_id uuid not null references public.regions(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  species_id uuid references public.species(id),
  display_name text,
  location geography(Point, 4326) not null,
  location_accuracy_m int,
  location_modified_by_user_at timestamptz,        -- gates re-import location update (PLAN §6.5)
  status pin_status not null default 'active',
  notes text,
  import_source text,
  import_external_id text,
  import_raw jsonb,
  last_observed_at timestamptz,
  last_observed_stage stage,
  unique (region_id, import_source, import_external_id)
);
create index pins_location_idx       on public.pins using gist(location);
create index pins_region_status_idx  on public.pins(region_id, status);
create index pins_region_species_idx on public.pins(region_id, species_id);

-- ============================================================
-- Observations, photos, hazards, comments
-- ============================================================

create table public.observations (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  observed_at timestamptz not null default now(),
  stage stage not null,
  quality_rating int check (quality_rating between 1 and 5),
  quality_notes text,
  created_at timestamptz not null default now()
);
create index observations_pin_idx on public.observations(pin_id, observed_at desc);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins(id) on delete cascade,
  observation_id uuid references public.observations(id) on delete set null,
  user_id uuid not null references auth.users(id),
  taken_at timestamptz,
  captured_lat numeric,
  captured_lng numeric,
  captured_accuracy_m int,
  storage_path text not null,    -- 'photos/<photo-id>.jpg' (flat, see §10 C21)
  thumbnail_path text not null,  -- 'photos/<photo-id>-thumb.jpg'
  caption text,
  created_at timestamptz not null default now()
);
create index photos_pin_idx         on public.photos(pin_id);
create index photos_observation_idx on public.photos(observation_id);

create table public.hazards (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  hazard_type hazard_type not null,
  notes text,
  created_at timestamptz not null default now()
);
create index hazards_pin_idx on public.hazards(pin_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  body text not null,
  created_at timestamptz not null default now()
);
create index comments_pin_idx on public.comments(pin_id, created_at desc);

-- ============================================================
-- Import bookkeeping
-- ============================================================

create table public.import_sources (
  id text primary key,                       -- 'cornell-cti', 'ithaca-ti', ...
  name text not null,
  url text,
  description text,
  region_id uuid not null references public.regions(id) on delete cascade,
  license text,
  created_at timestamptz not null default now()
);

create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  import_source_id text not null references public.import_sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  pins_created int not null default 0,
  pins_updated int not null default 0,
  pins_skipped_unmatched int not null default 0,
  errors jsonb,
  triggered_by uuid references auth.users(id)
);
create index import_runs_source_idx on public.import_runs(import_source_id, started_at desc);

-- ============================================================
-- updated_at triggers (one shared function)
-- ============================================================

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger pins_updated_at                       before update on public.pins                          for each row execute function public.tg_set_updated_at();
create trigger regions_updated_at                    before update on public.regions                       for each row execute function public.tg_set_updated_at();
create trigger profiles_updated_at                   before update on public.profiles                      for each row execute function public.tg_set_updated_at();
create trigger species_fruiting_windows_updated_at   before update on public.species_fruiting_windows      for each row execute function public.tg_set_updated_at();
create trigger user_fruiting_overrides_updated_at    before update on public.user_fruiting_window_overrides for each row execute function public.tg_set_updated_at();
create trigger region_seasonal_shifts_updated_at     before update on public.region_seasonal_shifts        for each row execute function public.tg_set_updated_at();

-- ============================================================
-- last_observed_* denormalization on pins, kept fresh by observation triggers
-- ============================================================

create or replace function public.tg_pin_refresh_last_observed()
returns trigger language plpgsql as $$
declare
  target_pin uuid;
begin
  target_pin := coalesce(new.pin_id, old.pin_id);
  update public.pins p
     set last_observed_at = sub.observed_at,
         last_observed_stage = sub.stage
    from (
      select observed_at, stage
        from public.observations
       where pin_id = target_pin
       order by observed_at desc
       limit 1
    ) sub
   where p.id = target_pin;

  -- If no observations remain, clear the cache.
  if not exists (select 1 from public.observations where pin_id = target_pin) then
    update public.pins set last_observed_at = null, last_observed_stage = null where id = target_pin;
  end if;

  return null;
end;
$$;

create trigger observations_refresh_pin_after_iud
  after insert or update or delete on public.observations
  for each row execute function public.tg_pin_refresh_last_observed();

-- ============================================================
-- Enable RLS on all user-facing tables (policies in next migration)
-- ============================================================

alter table public.profiles                         enable row level security;
alter table public.regions                          enable row level security;
alter table public.region_memberships               enable row level security;
alter table public.invitations                      enable row level security;
alter table public.species                          enable row level security;
alter table public.species_fruiting_windows         enable row level security;
alter table public.user_fruiting_window_overrides   enable row level security;
alter table public.region_seasonal_shifts           enable row level security;
alter table public.pins                             enable row level security;
alter table public.observations                     enable row level security;
alter table public.photos                           enable row level security;
alter table public.hazards                          enable row level security;
alter table public.comments                         enable row level security;
alter table public.import_sources                   enable row level security;
alter table public.import_runs                      enable row level security;
