-- Fix the invitations SELECT policy: it queried auth.users directly,
-- which `authenticated` does not have privilege to read. Use the JWT
-- email claim instead.
--
-- This was masked because the failure surfaced as a 42501 on the
-- regions->invitations chain inside our region_memberships query.

drop policy if exists invitations_select_admin_or_invitee on public.invitations;

create policy invitations_select_admin_or_invitee on public.invitations
  for select
  to authenticated
  using (
    public.is_region_admin(auth.uid(), region_id)
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
