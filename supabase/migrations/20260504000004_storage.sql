-- Forager: Storage bucket and policies for photos.
-- Path convention: 'photos/<photo_id>.jpg' (and '<photo_id>-thumb.jpg').
-- Flat paths so future cross-region pin moves don't require object renames (PLAN §10 C21).

-- ============================================================
-- The photos bucket (private; access via signed URLs or RLS-gated SDK calls)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

-- ============================================================
-- Helper: extract a photo's UUID from a storage object name.
--   Object names are '<uuid>.jpg' or '<uuid>-thumb.jpg'.
--   Returns null if the name doesn't begin with a UUID.
-- ============================================================

create or replace function storage.photo_id_from_name(object_name text)
returns uuid
language sql
immutable
as $$
  select case
    when object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
      then substring(object_name from '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})')::uuid
    else null
  end;
$$;

-- ============================================================
-- Storage policies on storage.objects (scoped to bucket = 'photos')
-- ============================================================

-- SELECT: allow if the corresponding photo's pin is in a region the user is a member of.
create policy photos_select_member on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'photos'
    and exists (
      select 1
        from public.photos ph
        join public.pins p on p.id = ph.pin_id
       where ph.id = storage.photo_id_from_name(name)
         and public.is_region_member(auth.uid(), p.region_id)
    )
  );

-- INSERT: any authenticated user can upload a new object owned by them.
-- The corresponding row in public.photos provides the actual access gate;
-- an orphaned upload (no photos row) is unreachable through any UI path.
create policy photos_insert_authenticated on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and owner = auth.uid()
  );

-- DELETE: object owner OR a region admin (via pin → region).
create policy photos_delete_owner_or_admin on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'photos'
    and (
      owner = auth.uid()
      or exists (
        select 1
          from public.photos ph
          join public.pins p on p.id = ph.pin_id
         where ph.id = storage.photo_id_from_name(name)
           and public.is_region_admin(auth.uid(), p.region_id)
      )
    )
  );

-- UPDATE intentionally has no policy: photos are immutable. To replace a
-- photo, delete and re-upload (creates a new photo_id and a new object).
