-- Defensive grants for the public schema.
--
-- Symptoms this fixes: PostgREST returns 403 even though RLS policies
-- should allow access. RLS gates rows, but the role needs base table
-- privileges first; Supabase's auto-grant doesn't always fire for tables
-- created via CLI migrations.
--
-- We grant broadly to `authenticated` and `anon`; RLS does the row-level
-- gating per PLAN §7.5.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select                          on all tables in schema public to anon;

grant usage, select on all sequences in schema public to anon, authenticated;

grant execute on all functions in schema public to anon, authenticated;

-- Ensure the same applies to any future tables/sequences/functions created
-- in this schema.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant select                          on tables to anon;
alter default privileges in schema public
  grant usage, select on sequences to anon, authenticated;
alter default privileges in schema public
  grant execute on functions to anon, authenticated;
