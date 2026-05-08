-- Community-contributable invasive species flags. Any signed-in user
-- can flag a species as undesirably invasive (tree of heaven, multiflora
-- rose, Japanese knotweed, bamboo, etc). Anon users can read the
-- aggregated state but can't write — per the project's free/paid model,
-- this is community knowledge metadata that benefits everyone, so it
-- sits in the signed-in-free tier (same as watchlist).
--
-- Region semantics: a flag with region_id = null means "globally invasive"
-- (the species is undesirable everywhere). A flag with a specific
-- region_id means "invasive in this region" — addresses the case where
-- a species is native in one place and invasive in another (e.g. some
-- maples that are well-behaved in Ithaca but aggressive in BC).
--
-- One vote per (species, region, user). Removing a flag = deleting the
-- row. The user can flip their own flag freely.
--
-- A denormalized counter on `species.invasive_flag_count` stays in
-- sync via trigger so the map's symbology layer can decide which pins
-- get a marker badge without joining for every pin.

create table public.species_invasive_flags (
  id          uuid primary key default gen_random_uuid(),
  species_id  uuid not null references public.species(id) on delete cascade,
  region_id   uuid references public.regions(id) on delete cascade,
  flagged_by  uuid not null references auth.users(id) on delete cascade,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (species_id, region_id, flagged_by)
);

create index species_invasive_flags_species_idx
  on public.species_invasive_flags (species_id);
create index species_invasive_flags_region_idx
  on public.species_invasive_flags (region_id)
  where region_id is not null;

alter table public.species_invasive_flags enable row level security;

-- Read: open to everyone (anon + authenticated). Anon contribution
-- isn't allowed, but anon should see the flagged state on the map.
create policy invasive_flags_select on public.species_invasive_flags
  for select to anon, authenticated using (true);

-- Insert: any signed-in user can add their own vote. flagged_by must
-- equal auth.uid() so users can't impersonate.
create policy invasive_flags_insert on public.species_invasive_flags
  for insert to authenticated
  with check (flagged_by = auth.uid());

-- Delete: only the row's author can drop it. (Admins drop via service
-- role connection — outside RLS.)
create policy invasive_flags_delete on public.species_invasive_flags
  for delete to authenticated
  using (flagged_by = auth.uid());

-- Denormalized counter for the map. Counts ALL flags for a species
-- (region or global) — the map cares about "anywhere flagged," and the
-- pin-detail panel breaks the count down by region with a separate
-- query if needed.
alter table public.species
  add column if not exists invasive_flag_count int not null default 0;

create or replace function public.tg_species_invasive_count()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.species set invasive_flag_count = invasive_flag_count + 1
     where id = new.species_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.species set invasive_flag_count = greatest(0, invasive_flag_count - 1)
     where id = old.species_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists species_invasive_flags_count_ins on public.species_invasive_flags;
create trigger species_invasive_flags_count_ins
after insert on public.species_invasive_flags
for each row execute function public.tg_species_invasive_count();

drop trigger if exists species_invasive_flags_count_del on public.species_invasive_flags;
create trigger species_invasive_flags_count_del
after delete on public.species_invasive_flags
for each row execute function public.tg_species_invasive_count();

-- Aggregate view for region-specific lookups. Pin-detail uses this
-- to show "X flags for this species in this region, Y flags globally."
create or replace view public.v_species_invasive_counts as
  select
    species_id,
    count(*) filter (where region_id is null)::int    as global_count,
    count(*) filter (where region_id is not null)::int as regional_count,
    count(*)::int                                      as total_count
    from public.species_invasive_flags
   group by species_id;

grant select on public.v_species_invasive_counts to anon, authenticated;
