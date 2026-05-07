-- Allow global admins to UPDATE species rows. Read-by-all is already
-- in place from the initial RLS migration (species_select_all).
-- Without this policy, the species table is effectively read-only
-- from the client even for site admins, which makes the in-app
-- curation UI on /species/[id] impossible.
--
-- The check is on profiles.is_global_admin, the same flag that
-- gates pin.visibility = 'public' (added in 20260506000015). Anyone
-- without that flag still cannot mutate species rows.

-- Idempotent: drop-if-exists guards against a partial earlier
-- application that left the policy in place.
drop policy if exists species_update_admin on public.species;

create policy species_update_admin on public.species
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and coalesce(p.is_global_admin, false) = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid()
         and coalesce(p.is_global_admin, false) = true
    )
  );
