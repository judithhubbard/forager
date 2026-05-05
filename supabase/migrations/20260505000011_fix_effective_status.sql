-- effective_status was over-eager: it treated last_observed_at IS NULL as
-- "stale" and downgraded freshly-imported pins to needs_verification.
-- Newly imported pins have NULL because they have not been observed yet,
-- not because they are stale. Only downgrade when there IS a last
-- observation AND it's older than 4 years.

create or replace function public.effective_status(p public.pins)
returns pin_status
language sql
stable
as $$
  select case
    when p.status = 'active'
      and p.last_observed_at is not null
      and p.last_observed_at < now() - interval '4 years'
    then 'needs_verification'::pin_status
    else p.status
  end;
$$;
