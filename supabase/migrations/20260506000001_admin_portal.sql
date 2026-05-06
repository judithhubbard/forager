-- Admin portal: role changes, last-admin guard, invitation accept flow,
-- profile FKs that let PostgREST embed cleanly. Audit of the original
-- plan (see PR description) drove the following design choices:
--
--   * Last-admin protection is a CONSTRAINT TRIGGER ... DEFERRABLE
--     INITIALLY DEFERRED, so it counts admins after all changes in the
--     transaction are visible. Handles bulk demotions and cascade
--     deletes correctly without per-row branching.
--
--   * accept_invitation() is SECURITY DEFINER, idempotent (already-a-
--     member is treated as success), and locks the invitation row
--     with FOR UPDATE to make double-clicks safe.
--
--   * No new view: PostgREST can embed profiles via the new FK from
--     region_memberships.user_id → profiles.id, so the admin members
--     query is just `select *, profile:profiles(...)`.
--
--   * No `generate_invitation_token()` function: a column default with
--     pgcrypto's gen_random_bytes is enough.
--
--   * security_invoker is forced on the existing views so they
--     inherit RLS instead of running with the owner's privileges.

-- ============================================================
-- 1. Foreign keys to profiles (in addition to existing → auth.users).
--    profiles.id is FK to auth.users with CASCADE, so this can't drift.
--    Lets PostgREST embed profile fields directly.
-- ============================================================

alter table public.region_memberships
  drop constraint if exists region_memberships_user_id_profile_fkey;
alter table public.region_memberships
  add constraint region_memberships_user_id_profile_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.observations
  drop constraint if exists observations_user_id_profile_fkey;
alter table public.observations
  add constraint observations_user_id_profile_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.photos
  drop constraint if exists photos_user_id_profile_fkey;
alter table public.photos
  add constraint photos_user_id_profile_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

-- ============================================================
-- 2. UPDATE policy on region_memberships so admins can change roles.
--    The existing policy set covers SELECT/INSERT/DELETE only.
-- ============================================================

drop policy if exists region_memberships_update_admin on public.region_memberships;
create policy region_memberships_update_admin on public.region_memberships
  for update
  to authenticated
  using (public.is_region_admin(auth.uid(), region_id))
  with check (public.is_region_admin(auth.uid(), region_id));

grant update on public.region_memberships to authenticated;

-- ============================================================
-- 3. Last-admin guard (deferred constraint trigger).
--    Fires AT COMMIT, so it sees the final state of all rows. Skips
--    when the parent region was dropped in the same transaction (no
--    point insisting on an admin for a region that no longer exists).
-- ============================================================

create or replace function public.enforce_last_admin()
returns trigger
language plpgsql
as $$
declare
  affected_region uuid;
  admin_count int;
begin
  -- Identify the affected region from whichever row is available.
  affected_region := coalesce(new.region_id, old.region_id);
  -- If the region is gone (cascading delete), nothing to enforce.
  if not exists (select 1 from public.regions where id = affected_region) then
    return null;
  end if;
  select count(*) into admin_count
    from public.region_memberships
    where region_id = affected_region and role = 'admin';
  if admin_count = 0 then
    raise exception 'A region must have at least one admin'
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

drop trigger if exists region_memberships_last_admin on public.region_memberships;
create constraint trigger region_memberships_last_admin
  after update or delete on public.region_memberships
  deferrable initially deferred
  for each row
  execute function public.enforce_last_admin();

-- ============================================================
-- 4. Invitations cleanup: column default for token, partial unique
--    index for "one pending invite per (region, email)", lower-case
--    email enforcement.
-- ============================================================

-- Generate URL-safe-ish tokens server-side via pgcrypto.
alter table public.invitations
  alter column token set default encode(gen_random_bytes(24), 'base64');

-- Force lowercase emails. Application code lowercases too, but this
-- is the durable enforcement.
alter table public.invitations
  drop constraint if exists invitations_email_lowercase;
alter table public.invitations
  add constraint invitations_email_lowercase
  check (email = lower(email));

-- One pending invite per (region, email). Accepted invitations are
-- excluded so the row can stay around as audit history.
drop index if exists invitations_pending_unique;
create unique index invitations_pending_unique
  on public.invitations (region_id, email)
  where accepted_at is null;

-- ============================================================
-- 5. accept_invitation() RPC.
--    Locks the invitation row, validates token + email, treats
--    already-a-member as success.
-- ============================================================

create or replace function public.accept_invitation(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  user_email text;
  user_email_verified boolean;
begin
  -- Pull the JWT email + verification flag. Anonymous users can't
  -- accept invitations.
  user_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  user_email_verified := coalesce((auth.jwt() ->> 'email_verified')::boolean, false);
  if auth.uid() is null or user_email = '' then
    raise exception 'Sign in to accept an invitation'
      using errcode = 'insufficient_privilege';
  end if;
  if not user_email_verified then
    raise exception 'Verify your email address before accepting an invitation'
      using errcode = 'insufficient_privilege';
  end if;

  -- Lock the invitation row so concurrent accepts (double-clicks)
  -- serialize cleanly.
  select * into inv
    from public.invitations
    where token = invite_token
    for update;
  if not found then
    raise exception 'Invitation not found'
      using errcode = 'no_data_found';
  end if;
  if inv.expires_at < now() then
    raise exception 'Invitation has expired'
      using errcode = 'invalid_authorization_specification';
  end if;
  if lower(inv.email) <> user_email then
    raise exception 'This invitation was sent to a different email address'
      using errcode = 'insufficient_privilege';
  end if;

  -- Idempotent: if the user is already a member, mark the invitation
  -- accepted (if not already) and return.
  if exists (
    select 1 from public.region_memberships
    where user_id = auth.uid() and region_id = inv.region_id
  ) then
    if inv.accepted_at is null then
      update public.invitations
        set accepted_at = now(), accepted_by = auth.uid()
        where id = inv.id;
    end if;
    return inv.region_id;
  end if;

  -- Otherwise insert membership and mark the invite accepted.
  insert into public.region_memberships (user_id, region_id, role)
    values (auth.uid(), inv.region_id, inv.role);
  update public.invitations
    set accepted_at = now(), accepted_by = auth.uid()
    where id = inv.id;
  return inv.region_id;
end;
$$;

grant execute on function public.accept_invitation(text) to authenticated;

-- ============================================================
-- 6. security_invoker = on for the existing views, so they inherit
--    RLS from the underlying tables instead of running with the
--    owner's privileges.
-- ============================================================

alter view public.v_pin_effective set (security_invoker = on);
alter view public.v_observation_with_pin set (security_invoker = on);
