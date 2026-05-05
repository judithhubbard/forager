-- Allow observation dates at year, month/year, or day/month/year
-- precision. observed_at is still always a timestamp (we set it to the
-- appropriate first-of-month / first-of-year date), but observed_precision
-- tells the UI how much of the date to display.

alter table public.observations
  add column observed_precision text not null default 'day'
  check (observed_precision in ('year', 'month', 'day'));
