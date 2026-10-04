-- Tracks purchased carbon offset certificates so they can be weighed
-- against the transport emissions already computed in CarbonReport.jsx
-- (receiving/dispatch/warehouse_stock co2e_kg). certificate_url points at
-- a file in the shared public "attachments" Storage bucket (see
-- 20260819020000_attachments_storage_bucket.sql), uploaded via the
-- existing uploadFile() helper — same pattern as Receiving's packing slips.
create table public.carbon_offset (
  id uuid primary key default gen_random_uuid(),
  purchase_date date not null,
  provider text,
  tonnes_co2e numeric not null,
  cost numeric,
  certificate_number text,
  certificate_url text,
  notes text,
  created_at timestamptz not null default now()
);
create index carbon_offset_date_idx on public.carbon_offset (purchase_date desc);

alter table public.carbon_offset enable row level security;
create policy carbon_offset_authenticated_all on public.carbon_offset
  for all to authenticated using (true) with check (true);
revoke all on public.carbon_offset from anon;
grant select, insert, update, delete on public.carbon_offset to authenticated;
