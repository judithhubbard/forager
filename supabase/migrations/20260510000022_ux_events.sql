-- UX event log: lightweight, self-hosted, privacy-friendly analytics
-- for evaluating the Forager user experience without sending data to
-- a third party.
--
-- Design notes:
--   - One row per discrete UX event (button click, GPS error, panel
--     toggle, etc). Aggregation happens at query time.
--   - session_id is a random uuid generated client-side per page
--     load — gives us per-session stitching without identifying the
--     user across sessions. Anon users still produce events.
--   - props is jsonb so each event type can carry its own payload
--     (e.g. locate-me records time-since-fix, recording_started
--     records permission state, etc).
--   - Events are write-only for clients. Only admins can SELECT.
--   - 90-day retention: anything older is pruned by a daily job.
--     UX patterns repeat over weeks; long-term storage isn't useful
--     and makes the table grow without bound.

create table if not exists public.ux_events (
  id           bigint generated always as identity primary key,
  user_id      uuid    references auth.users(id) on delete set null,
  session_id   uuid    not null,
  event_name   text    not null,
  props        jsonb   not null default '{}'::jsonb,
  page         text,        -- pathname at event time (e.g. '/', '/admin/calibration')
  viewport_w   smallint,    -- window.innerWidth at event time
  viewport_h   smallint,
  user_agent   text,        -- raw UA, useful for OS/browser breakdowns
  created_at   timestamptz not null default now()
);

create index if not exists ux_events_event_name_idx on public.ux_events (event_name);
create index if not exists ux_events_session_idx    on public.ux_events (session_id);
create index if not exists ux_events_user_idx       on public.ux_events (user_id);
create index if not exists ux_events_created_at_idx on public.ux_events (created_at desc);

-- RLS: anyone (including anon) can INSERT. Only global admins can SELECT.
alter table public.ux_events enable row level security;

drop policy if exists ux_events_insert on public.ux_events;
create policy ux_events_insert on public.ux_events
  for insert
  with check (true);

drop policy if exists ux_events_select_admin on public.ux_events;
create policy ux_events_select_admin on public.ux_events
  for select
  using (
    exists (
      select 1 from public.profiles
       where profiles.id = auth.uid()
         and profiles.is_global_admin = true
    )
  );

-- 90-day retention pruner. Re-run via pg_cron in supabase Pro:
--   select cron.schedule('prune_ux_events', '0 4 * * *', $$select public.prune_ux_events()$$);
create or replace function public.prune_ux_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.ux_events
   where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.prune_ux_events() from public;
