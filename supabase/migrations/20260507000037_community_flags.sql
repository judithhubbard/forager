-- Community flag layer (Phase 1 of community curation per the design discussion).
--
-- Lets any authed user mark an existing public pin as "gone",
-- "wrong species", "inaccessible", "low quality". When enough
-- *distinct* users (weighted by trust) have flagged a pin, it
-- gets greyed (3+ weight) or hidden from default view (5+ weight).
--
-- Free users start at flag_weight 1.0; paid users get 2.0 (set by
-- the subscription gate when payment lands); region admins 3.0;
-- global admins unlimited (their direct edits to pins.status are
-- the existing path). Trust-score adjustments based on flag-validation
-- history are deferred to a later iteration.
--
-- Vandalism mitigations stack:
--   - email verification: Supabase Auth handles this; we add a
--     check that auth.email_confirmed_at is not null in the insert
--     RLS so an unverified signup can't flag.
--   - one flag per (user, pin, type): unique constraint blocks
--     a single account spam-flagging the same pin.
--   - rate limit: 30 flags/day/user enforced by trigger.
--   - audit: all rows keep created_by + created_at for revert.
--   - admin revert: global admin can DELETE any flag.

-- 1. flag_weight on profiles, default 1.0 for free users.
alter table public.profiles
  add column if not exists flag_weight real not null default 1.0
  check (flag_weight >= 0);

-- 2. denormalized score on pins. Trigger-maintained from
--    pin_community_flags. Only the 'gone' / 'inaccessible' flag
--    types contribute to the visibility-affecting score; the
--    other types ('wrong_species', 'low_quality') show as
--    informational signals in the pin detail but don't hide
--    pins from the map.
alter table public.pins
  add column if not exists community_flag_score real not null default 0
  check (community_flag_score >= 0);

-- 3. flag types. Add to a new enum.
do $$ begin
  create type community_flag_type as enum (
    'gone',
    'wrong_species',
    'inaccessible',
    'low_quality'
  );
exception when duplicate_object then null;
end $$;

-- 4. flags table.
create table if not exists public.pin_community_flags (
  id uuid primary key default gen_random_uuid(),
  pin_id uuid not null references public.pins(id) on delete cascade,
  flagged_by uuid not null references auth.users(id) on delete cascade,
  flag_type community_flag_type not null,
  note text,
  created_at timestamptz not null default now(),
  unique (pin_id, flagged_by, flag_type)
);

create index if not exists pin_community_flags_pin_idx
  on public.pin_community_flags (pin_id);
create index if not exists pin_community_flags_user_idx
  on public.pin_community_flags (flagged_by);

-- 5. Score-maintenance trigger. Recomputes pins.community_flag_score
--    on insert/delete; sums profiles.flag_weight for distinct flaggers
--    of 'gone' or 'inaccessible' types.
create or replace function public.tg_maintain_pin_flag_score()
returns trigger
language plpgsql
as $$
declare
  affected_pin uuid;
begin
  affected_pin := coalesce(new.pin_id, old.pin_id);
  update public.pins p
     set community_flag_score = coalesce((
       select sum(coalesce(pr.flag_weight, 1.0))::real
         from public.pin_community_flags f
         left join public.profiles pr on pr.id = f.flagged_by
        where f.pin_id = affected_pin
          and f.flag_type in ('gone'::community_flag_type, 'inaccessible'::community_flag_type)
     ), 0)
   where p.id = affected_pin;
  return coalesce(new, old);
end;
$$;

drop trigger if exists pin_community_flags_score on public.pin_community_flags;
create trigger pin_community_flags_score
after insert or update or delete on public.pin_community_flags
for each row execute function public.tg_maintain_pin_flag_score();

-- 6. Daily rate-limit trigger. 30 flags/day/user. Cheap because the
--    user's flag history is tiny and indexed.
create or replace function public.tg_enforce_flag_rate_limit()
returns trigger
language plpgsql
as $$
declare
  recent_count int;
begin
  select count(*) into recent_count
    from public.pin_community_flags
   where flagged_by = new.flagged_by
     and created_at > now() - interval '1 day';
  if recent_count >= 30 then
    raise exception 'Rate limit reached: 30 flags per day. Try again tomorrow.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists pin_community_flags_rate_limit on public.pin_community_flags;
create trigger pin_community_flags_rate_limit
before insert on public.pin_community_flags
for each row execute function public.tg_enforce_flag_rate_limit();

-- 7. RLS.
alter table public.pin_community_flags enable row level security;

-- Read: anyone can see flag counts (so the pin detail page can
-- display "5 users say this is gone"). Anonymous users included so
-- the public layer's data quality is visible to the world.
drop policy if exists pin_community_flags_select on public.pin_community_flags;
create policy pin_community_flags_select on public.pin_community_flags
  for select to anon, authenticated using (true);

-- Insert: any authenticated user whose email is verified, the pin
-- exists, and they haven't already flagged the same (pin, type).
-- The unique constraint already enforces dedup, but the policy is
-- the security layer. Email-confirmation check via auth.users —
-- only confirmed users can flag.
drop policy if exists pin_community_flags_insert on public.pin_community_flags;
create policy pin_community_flags_insert on public.pin_community_flags
  for insert to authenticated
  with check (
    flagged_by = auth.uid()
    and exists (
      select 1 from auth.users u
       where u.id = auth.uid()
         and u.email_confirmed_at is not null
    )
  );

-- Delete: the flagger can revoke their own flag, or a global admin
-- can revert any flag (vandalism rollback).
drop policy if exists pin_community_flags_delete on public.pin_community_flags;
create policy pin_community_flags_delete on public.pin_community_flags
  for delete to authenticated
  using (
    flagged_by = auth.uid()
    or coalesce((
      select is_global_admin from public.profiles where id = auth.uid()
    ), false)
  );

grant select on public.pin_community_flags to anon, authenticated;
grant insert, delete on public.pin_community_flags to authenticated;
