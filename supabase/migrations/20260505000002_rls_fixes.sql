-- Fix RLS issues that surfaced in dev:
--   1. Re-grant EXECUTE on the membership helpers to anon/authenticated.
--   2. Rewrite regions SELECT policy to use the JWT email claim instead
--      of querying auth.users directly (the authenticated role does not
--      have direct SELECT on auth.users in managed Supabase projects).

grant execute on function public.is_region_member(uuid, uuid) to anon, authenticated;
grant execute on function public.is_region_admin(uuid, uuid)  to anon, authenticated;
grant execute on function public.effective_status(public.pins) to anon, authenticated;
grant execute on function public.today_doy_in_region(uuid)     to anon, authenticated;
grant execute on function public.effective_windows(uuid, uuid, uuid, int, stage) to anon, authenticated;
grant execute on function public.pin_in_window(uuid, stage, uuid, date)          to anon, authenticated;
grant execute on function public.pin_region(uuid)              to anon, authenticated;
grant execute on function public.photo_id_from_name(text)      to anon, authenticated;

drop policy if exists regions_select_member_or_invitee on public.regions;

create policy regions_select_member_or_invitee on public.regions
  for select
  to authenticated
  using (
    public.is_region_member(auth.uid(), id)
    or exists (
      select 1
        from public.invitations i
       where i.region_id = regions.id
         and i.accepted_at is null
         and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );
