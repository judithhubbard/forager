-- Phase 2G: pin correction suggestions (schema only; UI deferred to
-- Phase 2.5).
--
-- Falling Fruit's "anyone can edit" model is messy but self-healing
-- — stale data dies fast because anyone can fix it. Forager's
-- single-owner model is cleaner but lets stale data accumulate when
-- owners stop engaging. This middle ground: any signed-in user can
-- *suggest* a correction; the pin owner accepts/rejects. Schema
-- ships now so the hook exists; suggestion-form + owner-inbox UI
-- are a follow-up.

create table if not exists public.pin_correction_suggestions (
  id              uuid primary key default gen_random_uuid(),
  pin_id          uuid not null references public.pins(id) on delete cascade,
  suggested_by    uuid not null references auth.users(id),
  -- Which field of the pin the suggestion targets. Open-ended for
  -- forward compatibility; renders are responsible for handling
  -- only known field names. Examples: 'species_id', 'location',
  -- 'access_status', 'display_name', 'notes'.
  field           text not null,
  current_value   jsonb,
  suggested_value jsonb,
  reason          text,
  -- 'pending' | 'accepted' | 'rejected'
  status          text not null default 'pending',
  resolved_by     uuid references auth.users(id),
  resolved_at     timestamptz,
  created_at      timestamptz not null default now(),
  check (status in ('pending', 'accepted', 'rejected'))
);

create index if not exists pin_corrections_pin_idx
  on public.pin_correction_suggestions (pin_id, status);
create index if not exists pin_corrections_pending_owner
  on public.pin_correction_suggestions (status)
  where status = 'pending';

alter table public.pin_correction_suggestions enable row level security;

-- Suggester sees their own; pin owner sees suggestions on their pin;
-- region admin sees all in their region.
drop policy if exists corrections_select on public.pin_correction_suggestions;
create policy corrections_select on public.pin_correction_suggestions
  for select to authenticated
  using (
    suggested_by = auth.uid()
    or exists (
      select 1 from public.pins p
      where p.id = pin_correction_suggestions.pin_id
        and (
          p.created_by = auth.uid()
          or public.is_region_admin(auth.uid(), p.region_id)
        )
    )
  );

-- Any signed-in user can submit a suggestion against a pin they can
-- see (RLS on pins already gates that — if SELECT fails, the pin_id
-- ref will fail at insert).
drop policy if exists corrections_insert on public.pin_correction_suggestions;
create policy corrections_insert on public.pin_correction_suggestions
  for insert to authenticated
  with check (suggested_by = auth.uid());

-- The pin owner / region admin can resolve. Suggester can withdraw
-- (mark rejected by themselves, or delete). Update is allowed for
-- anyone who can SELECT — the application layer enforces "only
-- transitions to accepted/rejected on a pending row" via reason +
-- resolved_by + resolved_at writes.
drop policy if exists corrections_update on public.pin_correction_suggestions;
create policy corrections_update on public.pin_correction_suggestions
  for update to authenticated
  using (
    suggested_by = auth.uid()
    or exists (
      select 1 from public.pins p
      where p.id = pin_correction_suggestions.pin_id
        and (
          p.created_by = auth.uid()
          or public.is_region_admin(auth.uid(), p.region_id)
        )
    )
  );

drop policy if exists corrections_delete on public.pin_correction_suggestions;
create policy corrections_delete on public.pin_correction_suggestions
  for delete to authenticated
  using (suggested_by = auth.uid());
