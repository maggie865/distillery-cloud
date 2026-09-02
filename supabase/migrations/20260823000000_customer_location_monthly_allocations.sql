-- Some multi-store customers order in bulk against one master account and
-- only tell us afterwards, at month end, how many bottles each individual
-- store actually took from that order. dispatch.location_id can't capture
-- this - a master-order dispatch usually isn't tagged to any one location
-- at all - so this is a separate, manually-reported figure per
-- (location, month), not derived from real dispatch rows.
create table public.customer_location_allocation (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.customer_location (id) on delete cascade,
  period_month date not null, -- always the 1st of the reported month
  quantity_bottles integer not null default 0,
  notes text,
  recorded_at timestamptz not null default now()
);
create index customer_location_allocation_location_idx on public.customer_location_allocation (location_id);
create index customer_location_allocation_period_idx on public.customer_location_allocation (period_month desc);

alter table public.customer_location_allocation enable row level security;
create policy customer_location_allocation_authenticated_all on public.customer_location_allocation
  for all to authenticated using (true) with check (true);
revoke all on public.customer_location_allocation from anon;
grant select, insert, update, delete on public.customer_location_allocation to authenticated;
