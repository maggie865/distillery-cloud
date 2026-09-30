-- Pallet tracking: a printable, QR-scannable label over a physical stack of
-- existing Finished Goods stock. A pallet is a manifest, not a stock ledger —
-- it doesn't move or deduct FinishedGood quantities itself (that's already
-- handled by Dispatch/TransferTo3PL/StockTakes); it just answers "what's on
-- this pallet" when someone scans its code on the distillery floor.

create table public.pallet (
  id uuid primary key default gen_random_uuid(),
  pallet_code text not null unique,
  location text not null default 'Distillery',
  status text not null default 'active' check (status in ('active', 'archived')),
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pallet_status_idx on public.pallet (status);

create table public.pallet_item (
  id uuid primary key default gen_random_uuid(),
  pallet_id uuid not null references public.pallet(id) on delete cascade,
  product_name text not null,
  batch_number text,
  bottle_size_ml integer,
  quantity_bottles integer not null default 0,
  total_lals numeric,
  source text not null default 'manual' check (source in ('manual', 'bottling_run')),
  bottling_run_id uuid references public.bottling_run(id) on delete set null,
  added_by_user_id uuid references auth.users(id) on delete set null,
  added_by_name text,
  created_at timestamptz not null default now()
);
create index pallet_item_pallet_id_idx on public.pallet_item (pallet_id);
create index pallet_item_bottling_run_id_idx on public.pallet_item (bottling_run_id);

alter table public.pallet enable row level security;
alter table public.pallet_item enable row level security;

-- Shared operational data, same permissive shape used throughout this app
-- (e.g. warehouse_stock, promo_event) — anyone signed in who can reach the
-- page can read/add/edit; page-level access is gated separately below.
create policy pallet_all on public.pallet
  for all to authenticated using (true) with check (true);
create policy pallet_item_all on public.pallet_item
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.pallet to authenticated;
grant select, insert, update, delete on public.pallet_item to authenticated;

insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('pallets', 'Pallets', '/pallets', '{admin,user}')
on conflict (page_key) do nothing;
