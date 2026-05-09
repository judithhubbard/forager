-- Empirical phenology aggregator: per (region, species, stage) → row
-- count + DOY median/p10/p90 derived from public.observations.
--
-- Architecture for the calibration-first approach to harvest windows.
-- Today there are only ~10 user observations, so this returns almost
-- nothing. As the user base grows (and as external sources like iNat
-- or USA-NPN are layered in via a sibling table later) the aggregator
-- becomes the basis for replacing zone-baseline harvest windows with
-- per-region empirical ones.
--
-- security_invoker so callers see aggregates only over rows they can
-- already SELECT through normal RLS — no new policy needed. Anon sees
-- public-pin observations; authed users see their own + their region's.

create or replace view public.region_species_phenology
with (security_invoker = true)
as
select
  p.region_id,
  p.species_id,
  o.stage,
  count(*)::int as n_obs,
  (percentile_cont(0.5) within group (order by extract(doy from o.observed_at)))::int as median_doy,
  (percentile_cont(0.1) within group (order by extract(doy from o.observed_at)))::int as p10_doy,
  (percentile_cont(0.9) within group (order by extract(doy from o.observed_at)))::int as p90_doy,
  min(o.observed_at) as first_obs_at,
  max(o.observed_at) as last_obs_at
from public.observations o
join public.pins p on p.id = o.pin_id
where p.region_id is not null
  and p.species_id is not null
group by p.region_id, p.species_id, o.stage;

grant select on public.region_species_phenology to anon, authenticated;
