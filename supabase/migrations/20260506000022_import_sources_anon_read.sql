-- Make import_sources readable to anon so the public /sources page
-- can list every dataset that contributed to the public layer
-- (Cornell CTI, City of Ithaca, NYC Street Trees, Chicago, etc) with
-- attribution. The rows are inherently meant to be visible — they
-- exist to credit the source.
--
-- The existing import_sources_select_member policy stays in place
-- for authed users; this adds a parallel anon-readable policy.

drop policy if exists import_sources_select_anon on public.import_sources;
create policy import_sources_select_anon on public.import_sources
  for select
  to anon, authenticated
  using (true);
