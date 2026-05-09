-- Calibration tooling: enable per-cell evidence tracking and unblock
-- writes to species_fruiting_windows.
--
-- 1. Add `evidence jsonb` column for the per-cell research log. Each
--    entry records source name + url + retrieval timestamp + summary
--    of what that source said + the DOY range that source supports.
--    Default '[]' so existing rows have a valid empty log.
--
-- 2. Replace the broken sfw_write_admin policy. It referenced
--    region_id which mig #36 dropped (windows are now zone-keyed,
--    not region-keyed). Until now, no functional write policy
--    existed — calibration edits would have failed.
--
--    New policy: writes require profiles.is_global_admin. Calibration
--    is global, not regional, so global-admin gating is correct.

alter table public.species_fruiting_windows
  add column if not exists evidence jsonb not null default '[]'::jsonb;

-- Drop the broken policy (region_id no longer exists).
drop policy if exists sfw_write_admin on public.species_fruiting_windows;

-- New global-admin write policy. INSERT/UPDATE/DELETE all gated.
create policy sfw_write_global_admin
  on public.species_fruiting_windows
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.is_global_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.is_global_admin = true
    )
  );
