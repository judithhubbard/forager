-- Phase 2F: watchlist + notifications.
--
-- Two new tables:
--   watchlist     — what the user wants to be told about.
--   notifications — what we have already told them (in-app inbox).
--
-- The notify-on-ripe job is a separate piece (pg_cron + a SQL or
-- edge-function tick); this migration provides the schema it
-- writes against. Even before the job exists, the UI can show the
-- watch button + the /watchlist page.

create table if not exists public.watchlist (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- Watch a SPECIES (any pin) or a SPECIFIC PIN. Exactly one of
  -- the two must be set.
  species_id    uuid references public.species(id) on delete cascade,
  pin_id        uuid references public.pins(id)    on delete cascade,
  notify_email  boolean not null default true,
  notify_in_app boolean not null default true,
  created_at    timestamptz not null default now(),
  check (
    (species_id is not null and pin_id is null)
    or (species_id is null and pin_id is not null)
  )
);

-- The user can only watch a given species OR a given pin once. Using
-- a partial unique index since the two-of-two check above means each
-- row has exactly one of the columns set.
create unique index if not exists watchlist_user_species_uq
  on public.watchlist (user_id, species_id) where species_id is not null;
create unique index if not exists watchlist_user_pin_uq
  on public.watchlist (user_id, pin_id) where pin_id is not null;
create index if not exists watchlist_species_idx on public.watchlist (species_id);
create index if not exists watchlist_pin_idx on public.watchlist (pin_id);

alter table public.watchlist enable row level security;

drop policy if exists watchlist_self_select on public.watchlist;
create policy watchlist_self_select on public.watchlist
  for select to authenticated using (user_id = auth.uid());

drop policy if exists watchlist_self_insert on public.watchlist;
create policy watchlist_self_insert on public.watchlist
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists watchlist_self_update on public.watchlist;
create policy watchlist_self_update on public.watchlist
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists watchlist_self_delete on public.watchlist;
create policy watchlist_self_delete on public.watchlist
  for delete to authenticated using (user_id = auth.uid());

-- Notifications inbox. Each row is one delivered notification — a
-- watchlist entry transitioned (e.g. "Cornelian cherry near you is
-- ripe today") or a system message (welcome, comment reply).
create type notification_kind as enum (
  'ripe_now',          -- watched species or pin entered ripe window today
  'comment_reply',     -- someone replied to my comment (future)
  'correction',        -- someone suggested an edit on my pin (Phase 2G)
  'system'             -- catch-all
);

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          notification_kind not null,
  -- Free-form payload: target pin id, species id, message, etc. The
  -- rendering layer reads kind + payload to display the right thing.
  payload       jsonb not null default '{}'::jsonb,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_self_select on public.notifications;
create policy notifications_self_select on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists notifications_self_delete on public.notifications;
create policy notifications_self_delete on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- INSERT is intentionally NOT exposed to authenticated users; only
-- the daily ripe-job (run by service_role) writes into this table.
-- A future migration adds a TRIGGER-based "self-deliver" path for
-- in-app system messages.
