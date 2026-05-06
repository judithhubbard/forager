-- Phase 2: welcome flow needs a SECURITY DEFINER RPC that creates a
-- region AND inserts the caller as the admin in one transaction. The
-- regions table itself doesn't grant INSERT to authenticated users
-- (region creation has always been an admin/seed-script affair until
-- now), and we want to keep it that way — going through a function
-- means any future region-creation rules (rate limits, name format,
-- etc.) live in one place.

create or replace function public.create_region(
  p_name text,
  p_default_pin_visibility text default 'shared'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_region_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create a region'
      using errcode = 'insufficient_privilege';
  end if;
  if p_name is null or length(trim(p_name)) < 1 then
    raise exception 'Region name is required'
      using errcode = 'check_violation';
  end if;
  if length(trim(p_name)) > 80 then
    raise exception 'Region name must be 80 characters or fewer'
      using errcode = 'check_violation';
  end if;
  if p_default_pin_visibility not in ('shared', 'private') then
    raise exception 'default_pin_visibility must be shared or private'
      using errcode = 'check_violation';
  end if;

  insert into public.regions (name, default_pin_visibility, created_by)
  values (trim(p_name), p_default_pin_visibility, auth.uid())
  returning id into new_region_id;

  insert into public.region_memberships (user_id, region_id, role)
  values (auth.uid(), new_region_id, 'admin');

  return new_region_id;
end;
$$;

grant execute on function public.create_region(text, text) to authenticated;
