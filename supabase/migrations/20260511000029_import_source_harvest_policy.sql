-- Migration 29: harvest_policy on import_sources.
--
-- For Phase 3 outreach: when we ask a city to share their tree
-- inventory, we offer them control over how the import is framed to
-- foragers. The city picks one of a small set of policy values and an
-- optional free-text note; the pin detail panel surfaces this
-- prominently so users see the city-set expectation alongside the
-- species info.
--
-- Five enum values cover the realistic policy space:
--   - not_addressed: silence; the default. No policy banner shown.
--   - personal_use_ok: city permits modest personal harvest.
--   - encouraged: city actively encourages foraging here (e.g.
--     food-forest initiatives, gleaning programs).
--   - discouraged: city asks foragers not to harvest (e.g. heavy
--     pesticide application on street trees, liability concerns).
--   - prohibited: active legal restriction (e.g. protected dune
--     plantings on FL public lands). Rare but real.
--
-- The note column is for context the city wants surfaced verbatim,
-- e.g. "Street trees may be sprayed with insecticide in May-June; do
-- not harvest until at least four weeks after application."
--
-- Defaults to 'not_addressed' for all existing rows — backwards
-- compatible with the existing imports.

create type public.harvest_policy_kind as enum (
  'not_addressed',
  'personal_use_ok',
  'encouraged',
  'discouraged',
  'prohibited'
);

alter table public.import_sources
  add column if not exists harvest_policy
    public.harvest_policy_kind not null default 'not_addressed',
  add column if not exists harvest_policy_note text,
  add column if not exists harvest_policy_set_at timestamptz,
  add column if not exists harvest_policy_set_by_email text;

comment on column public.import_sources.harvest_policy is
  'Per-source harvest guidance set by the source city/owner during Phase 3 license outreach. Defaults to not_addressed; surfaced on the pin detail panel for any pin whose import_source has a non-default value.';
comment on column public.import_sources.harvest_policy_note is
  'Optional free-text caveat from the source. Displayed verbatim under the policy badge on the pin detail panel.';
comment on column public.import_sources.harvest_policy_set_at is
  'When the policy was set (for audit + recency display).';
comment on column public.import_sources.harvest_policy_set_by_email is
  'Email of the city/source contact who set the policy. Internal record-keeping; not surfaced to users.';
