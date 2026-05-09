-- User-submitted feedback / suggestions / error reports / misuse
-- reports. Single table covers all five categories from the user
-- request — the per-row category column lets the admin triage
-- without separate tables. RLS keeps the contents admin-only;
-- contributors can read their own rows to track status.
--
-- Email-out on insert is intentionally deferred. For v1, the admin
-- polls /admin/feedback to see new reports. Hooking up Resend or
-- another transactional email provider is a follow-up.

create table public.feedback_reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references auth.users(id) on delete set null,
  category        text not null check (category in (
                    'suggestion', 'error', 'misuse', 'data_source',
                    'feature_request', 'other'
                  )),
  subject         text not null check (length(subject) between 1 and 200),
  body            text not null check (length(body) between 1 and 8000),
  context_pin_id  uuid references public.pins(id) on delete set null,
  context_region_id uuid references public.regions(id) on delete set null,
  /** URL the user was on when they submitted. Free-text rather than
   *  a route-name to capture query params + deep-link state. */
  context_url     text,
  status          text not null default 'new' check (status in (
                    'new', 'acknowledged', 'in_progress', 'resolved', 'wontfix'
                  )),
  admin_notes     text,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

create index feedback_reports_created_idx
  on public.feedback_reports (created_at desc);
create index feedback_reports_status_idx
  on public.feedback_reports (status)
  where status in ('new', 'acknowledged', 'in_progress');
create index feedback_reports_reporter_idx
  on public.feedback_reports (reporter_id)
  where reporter_id is not null;
create index feedback_reports_category_idx
  on public.feedback_reports (category);

alter table public.feedback_reports enable row level security;

-- INSERT: authenticated users can submit their own. Anon users can
-- submit too (reporter_id stays null). Either way the reporter_id
-- must match auth.uid() if signed in (no impersonation).
create policy feedback_insert_self on public.feedback_reports
  for insert to anon, authenticated
  with check (
    reporter_id is null
    or reporter_id = auth.uid()
  );

-- SELECT: global admins see everything; others see only their own.
create policy feedback_select_admin_or_self on public.feedback_reports
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_global_admin = true
    )
    or reporter_id = auth.uid()
  );

-- UPDATE: admins only (set status, admin_notes, resolved_at).
create policy feedback_update_admin on public.feedback_reports
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.is_global_admin = true
    )
  );

-- Auto-stamp resolved_at when status flips to a terminal state.
create or replace function public.tg_feedback_resolved_at()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('resolved', 'wontfix') and old.status not in ('resolved', 'wontfix') then
    new.resolved_at := now();
  elsif new.status not in ('resolved', 'wontfix') then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

create trigger feedback_reports_resolved_at
before update on public.feedback_reports
for each row execute function public.tg_feedback_resolved_at();
