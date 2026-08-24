-- Some customers operate multiple stores/branches under one account (e.g.
-- a retail chain). customer_location lets each of those be recorded and
-- tracked individually, while the parent customer record stays the one
-- "account" (billing contact, overall stats, etc.).
--
-- dispatch.location_id is nullable and ON DELETE SET NULL - most dispatches
-- won't have a location at all (single-location customers, direct sales,
-- tasting dispatches), and deleting a location must never break the
-- historical dispatch rows that reference it.
create table public.customer_location (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer (id) on delete cascade,
  location_name text not null,
  address text,
  city text,
  region text,
  contact_name text,
  contact_phone text,
  contact_email text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index customer_location_customer_idx on public.customer_location (customer_id);

alter table public.dispatch add column location_id uuid references public.customer_location (id) on delete set null;

alter table public.customer_location enable row level security;
create policy customer_location_authenticated_all on public.customer_location
  for all to authenticated using (true) with check (true);
revoke all on public.customer_location from anon;
grant select, insert, update, delete on public.customer_location to authenticated;
