-- The pins_update_owner_or_admin policy lets region admins mutate any
-- pin in their region. That's correct for shared/private (group) pins,
-- but on visibility='public' pins it leaks: a region admin's status
-- change updates the public layer everyone (including anon viewers)
-- sees. Tighten the policy so public pins only accept updates from
-- their original creator (typically the import script's user) or a
-- global admin. Region admins keep curation rights on their region's
-- shared/private pins.
--
-- See diag: a region admin marked two ithaca-ti pins 'not_good' and
-- the change surfaced in the anon view. After this migration, the
-- same edit fails with an RLS error and the UI surfaces 'Log
-- observation' / 'Suggest correction' instead.

drop policy if exists pins_update_owner_or_admin on public.pins;

create policy pins_update_owner_or_admin on public.pins
  for update
  to authenticated
  using (
    case
      when visibility = 'public' then
        created_by = auth.uid()
        or coalesce((
          select is_global_admin from public.profiles where id = auth.uid()
        ), false)
      else
        created_by = auth.uid()
        or public.is_region_admin(auth.uid(), region_id)
    end
  )
  with check (
    public.is_region_member(auth.uid(), region_id)
  );

-- Revert the two leaked status changes from the diagnostic above. Both
-- are ithaca-ti imports whose created_by is the import user, not the
-- region admin who changed them.
update public.pins
   set status = 'active'
 where visibility = 'public'
   and import_source = 'ithaca-ti'
   and status = 'not_good';
