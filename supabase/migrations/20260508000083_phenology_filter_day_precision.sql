-- The earlier observation form let users record year-only or
-- month-only precision, which got stored as Jan-1 or 1st-of-month
-- timestamps. Those land at DOY=1 or DOY=mid-month and would skew the
-- empirical phenology aggregator badly (a Jan-1-stored ripeness
-- observation suggests fruit is ripe in deep winter — false).
--
-- Day-precision-only observations is now enforced in the form. Filter
-- the aggregator to match so legacy non-day rows don't pollute.

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
  and o.observed_precision = 'day'
group by p.region_id, p.species_id, o.stage;

grant select on public.region_species_phenology to anon, authenticated;
