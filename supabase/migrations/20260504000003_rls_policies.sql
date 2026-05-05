-- Forager: Row-Level Security policies (per PLAN §7.5).
-- RLS is already enabled on all tables in the initial migration.
-- Policies are added here so they can iterate independently of schema.

-- ============================================================
-- profiles
-- ============================================================

create policy profiles_select_authenticated on public.profiles
  for select
  to authenticated
  using (true);

create policy profiles_update_self on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================
-- regions
--   Members and pending invitees can read; admins can update.
--   Insert/delete reserved to service role for v1 — Phase 2 will
--   add a `create_personal_region()` SECURITY DEFINER function.
-- ============================================================

create policy regions_select_member_or_invitee on public.regions
  for select
  to authenticated
  using (
    public.is_region_member(auth.uid(), id)
    or exists (
      select 1 from public.invitations i
      where i.region_id = regions.id
        and i.accepted_at is null
        and lower(i.email) = lower((select email from auth.users where id = auth.uid()))
    )
  );

create policy regions_update_admin on public.regions
  for update
  to authenticated
  using (public.is_region_admin(auth.uid(), id))
  with check (public.is_region_admin(auth.uid(), id));

-- ============================================================
-- region_memberships
--   Members of a region see fellow members. Admins can remove.
--   Self-removal allowed. Inserts handled by invitation
--   acceptance function (forthcoming) using SECURITY DEFINER.
-- ============================================================

create policy region_memberships_select_co_members on public.region_memberships
  for select
  to authenticated
  using (public.is_region_member(auth.uid(), region_id));

create policy region_memberships_delete_admin_or_self on public.region_memberships
  for delete
  to authenticated
  using (
    public.is_region_admin(auth.uid(), region_id)
    or user_id = auth.uid()
  );

-- ============================================================
-- invitations
--   Admins manage; the invited email can read their own pending row.
-- ============================================================

create policy invitations_select_admin_or_invitee on public.invitations
  for select
  to authenticated
  using (
    public.is_region_admin(auth.uid(), region_id)
    or lower(email) = lower((select email from auth.users where id = auth.uid()))
  );

create policy invitations_insert_admin on public.invitations
  for insert
  to authenticated
  with check (public.is_region_admin(auth.uid(), region_id));

create policy invitations_delete_admin on public.invitations
  for delete
  to authenticated
  using (public.is_region_admin(auth.uid(), region_id));

-- ============================================================
-- species (global)
--   Read by all authenticated. Writes via service role (admin
--   editing UI is v2).
-- ============================================================

create policy species_select_all on public.species
  for select
  to authenticated
  using (true);

-- ============================================================
-- species_fruiting_windows (region-default windows)
--   Read by region members; written by region admins.
-- ============================================================

create policy sfw_select_member on public.species_fruiting_windows
  for select
  to authenticated
  using (public.is_region_member(auth.uid(), region_id));

create policy sfw_write_admin on public.species_fruiting_windows
  for all
  to authenticated
  using    (public.is_region_admin(auth.uid(), region_id))
  with check (public.is_region_admin(auth.uid(), region_id));

-- ============================================================
-- user_fruiting_window_overrides (personal)
--   Strictly own data.
-- ============================================================

create policy ufwo_self_all on public.user_fruiting_window_overrides
  for all
  to authenticated
  using    (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- region_seasonal_shifts
--   Read by members; written by admins.
-- ============================================================

create policy rss_select_member on public.region_seasonal_shifts
  for select
  to authenticated
  using (public.is_region_member(auth.uid(), region_id));

create policy rss_write_admin on public.region_seasonal_shifts
  for all
  to authenticated
  using    (public.is_region_admin(auth.uid(), region_id))
  with check (public.is_region_admin(auth.uid(), region_id));

-- ============================================================
-- pins
-- ============================================================

create policy pins_select_member on public.pins
  for select
  to authenticated
  using (public.is_region_member(auth.uid(), region_id));

create policy pins_insert_member on public.pins
  for insert
  to authenticated
  with check (
    public.is_region_member(auth.uid(), region_id)
    and created_by = auth.uid()
  );

create policy pins_update_owner_or_admin on public.pins
  for update
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_region_admin(auth.uid(), region_id)
  )
  with check (
    public.is_region_member(auth.uid(), region_id)
  );

create policy pins_delete_owner_or_admin on public.pins
  for delete
  to authenticated
  using (
    created_by = auth.uid()
    or public.is_region_admin(auth.uid(), region_id)
  );

-- ============================================================
-- observations, photos, hazards, comments
--   Read by members of the parent pin's region.
--   Insert: members of the pin's region + own user_id.
--   Update/delete: own only (admins may also override).
--
-- Helper: a function that returns the region of a pin so policies
-- can check membership without a subquery in every policy.
-- ============================================================

create or replace function public.pin_region(p_pin_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select region_id from public.pins where id = p_pin_id;
$$;

-- observations
create policy observations_select_member on public.observations
  for select
  to authenticated
  using (public.is_region_member(auth.uid(), public.pin_region(pin_id)));

create policy observations_insert_member on public.observations
  for insert
  to authenticated
  with check (
    public.is_region_member(auth.uid(), public.pin_region(pin_id))
    and user_id = auth.uid()
  );

create policy observations_update_owner_or_admin on public.observations
  for update
  to authenticated
  using    (user_id = auth.uid() or public.is_region_admin(auth.uid(), public.pin_region(pin_id)))
  with check (user_id = auth.uid() or public.is_region_admin(auth.uid(), public.pin_region(pin_id)));

create policy observations_delete_owner_or_admin on public.observations
  for delete
  to authenticated
  using (user_id = auth.uid() or public.is_region_admin(auth.uid(), public.pin_region(pin_id)));

-- photos
create policy photos_select_member on public.photos
  for select
  to authenticated
  using (public.is_region_member(auth.uid(), public.pin_region(pin_id)));

create policy photos_insert_member on public.photos
  for insert
  to authenticated
  with check (
    public.is_region_member(auth.uid(), public.pin_region(pin_id))
    and user_id = auth.uid()
  );

create policy photos_update_owner_or_admin on public.photos
  for update
  to authenticated
  using    (user_id = auth.uid() or public.is_region_admin(auth.uid(), public.pin_region(pin_id)))
  with check (user_id = auth.uid() or public.is_region_admin(auth.uid(), public.pin_region(pin_id)));

create policy photos_delete_owner_or_admin on public.photos
  for delete
  to authenticated
  using (user_id = auth.uid() or public.is_region_admin(auth.uid(), public.pin_region(pin_id)));

-- hazards
create policy hazards_select_member on public.hazards
  for select
  to authenticated
  using (public.is_region_member(auth.uid(), public.pin_region(pin_id)));

create policy hazards_insert_member on public.hazards
  for insert
  to authenticated
  with check (
    public.is_region_member(auth.uid(), public.pin_region(pin_id))
    and user_id = auth.uid()
  );

create policy hazards_update_owner_or_admin on public.hazards
  for update
  to authenticated
  using    (user_id = auth.uid() or public.is_region_admin(auth.uid(), public.pin_region(pin_id)))
  with check (user_id = auth.uid() or public.is_region_admin(auth.uid(), public.pin_region(pin_id)));

create policy hazards_delete_owner_or_admin on public.hazards
  for delete
  to authenticated
  using (user_id = auth.uid() or public.is_region_admin(auth.uid(), public.pin_region(pin_id)));

-- comments
create policy comments_select_member on public.comments
  for select
  to authenticated
  using (public.is_region_member(auth.uid(), public.pin_region(pin_id)));

create policy comments_insert_member on public.comments
  for insert
  to authenticated
  with check (
    public.is_region_member(auth.uid(), public.pin_region(pin_id))
    and user_id = auth.uid()
  );

create policy comments_update_owner_or_admin on public.comments
  for update
  to authenticated
  using    (user_id = auth.uid() or public.is_region_admin(auth.uid(), public.pin_region(pin_id)))
  with check (user_id = auth.uid() or public.is_region_admin(auth.uid(), public.pin_region(pin_id)));

create policy comments_delete_owner_or_admin on public.comments
  for delete
  to authenticated
  using (user_id = auth.uid() or public.is_region_admin(auth.uid(), public.pin_region(pin_id)));

-- ============================================================
-- import_sources / import_runs
--   Read by region members; writes via service role (scripts).
-- ============================================================

create policy import_sources_select_member on public.import_sources
  for select
  to authenticated
  using (public.is_region_member(auth.uid(), region_id));

create policy import_runs_select_member on public.import_runs
  for select
  to authenticated
  using (
    public.is_region_member(
      auth.uid(),
      (select region_id from public.import_sources s where s.id = import_runs.import_source_id)
    )
  );
