-- Authed users couldn't read public pins from regions they aren't a
-- member of. v_pin_effective inner-joins regions for the timezone
-- column, regions has regions_select_anon_name letting anon see all
-- regions (so popup labels render), but the authed-side policy
-- (regions_select_member_or_invitee) only exposed regions the user
-- joined or was invited to. So an Ithaca-region-only authed user
-- clicking a Dryad/NYC/Boston pin got "Pin not found" — pins RLS
-- allowed the read but the regions join silently dropped the row.
--
-- Mirror the anon allowance for authed users: regions are an
-- organizational bucket, not sensitive data; if anon can see them
-- so can authed.

drop policy if exists regions_select_public_authed on public.regions;
create policy regions_select_public_authed on public.regions
  for select
  to authenticated
  using (true);
