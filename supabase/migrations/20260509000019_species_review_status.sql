-- Per-species review-status field separate from per-row confidence.
-- Lets the admin walk through species in the calibration viewer
-- and mark each as 'confirmed' (cited evidence + values are
-- defensible) or 'needs_work' (something to revisit). Default
-- 'unreviewed' so the admin can sort by status to find work.
--
-- Plus two RPCs for the viewer:
--   species_source_summary(id) — full breakdown for the head chip.
--   species_source_summary_all() — bulk for the species picker so
--     each entry can show a source-count badge.
--
-- Both RPCs guard against non-array evidence (mig 17 left some
-- rows as JSON-encoded strings; this migration also repairs that).

create type public.species_review_status as enum (
  'unreviewed',
  'confirmed',
  'needs_work'
);

alter table public.species
  add column if not exists review_status public.species_review_status
    not null default 'unreviewed',
  add column if not exists review_notes text,
  add column if not exists reviewed_at timestamptz;

-- Repair: any row whose evidence is a JSON-encoded string (rather than
-- a JSONB array) gets re-parsed.
update public.species_fruiting_windows
   set evidence = (evidence #>> '{}')::jsonb
 where jsonb_typeof(evidence) = 'string';

create or replace function public.species_source_summary(p_species_id uuid)
returns table (
  n_rows int,
  n_distinct_sources int,
  n_evidence_total int,
  min_evidence_per_row int,
  max_evidence_per_row int,
  review_status public.species_review_status,
  review_notes text,
  reviewed_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  with ev as (
    select sfw.id as row_id,
           case when jsonb_typeof(sfw.evidence) = 'array'
                then sfw.evidence else '[]'::jsonb end as evidence,
           coalesce(case when jsonb_typeof(sfw.evidence) = 'array'
                         then jsonb_array_length(sfw.evidence) else 0 end, 0) as ev_count
      from public.species_fruiting_windows sfw
     where sfw.species_id = p_species_id
  ),
  flat as (
    select e->>'source' as source
      from ev, jsonb_array_elements(ev.evidence) as e
  )
  select
    (select count(*)::int from ev),
    (select count(distinct source)::int from flat),
    (select coalesce(sum(ev_count), 0)::int from ev),
    (select coalesce(min(ev_count), 0)::int from ev),
    (select coalesce(max(ev_count), 0)::int from ev),
    sp.review_status,
    sp.review_notes,
    sp.reviewed_at
  from public.species sp
 where sp.id = p_species_id;
$$;

create or replace function public.species_source_summary_all()
returns table (
  species_id uuid,
  n_distinct_sources int,
  n_rows int,
  review_status public.species_review_status
)
language sql stable security definer set search_path = public
as $$
  with row_evidence as (
    select sfw.species_id,
           case when jsonb_typeof(sfw.evidence) = 'array'
                then sfw.evidence else '[]'::jsonb end as ev
      from public.species_fruiting_windows sfw
  ),
  flat as (
    select species_id, e->>'source' as source
      from row_evidence, jsonb_array_elements(ev) as e
  ),
  src_counts as (
    select species_id, count(distinct source)::int as n_distinct_sources
      from flat group by species_id
  ),
  row_counts as (
    select species_id, count(*)::int as n_rows
      from row_evidence group by species_id
  )
  select sp.id,
         coalesce(sc.n_distinct_sources, 0),
         coalesce(rc.n_rows, 0),
         sp.review_status
    from public.species sp
    left join src_counts sc on sc.species_id = sp.id
    left join row_counts rc on rc.species_id = sp.id;
$$;
