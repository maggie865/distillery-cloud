-- Customer Stock Management + Quick Order.
--
-- Adds the first real product catalog this schema has ever had (nothing on
-- finished_good/warehouse_stock/dispatch carries a SKU or an active flag
-- today - they're matched to each other purely by product_name +
-- bottle_size_ml string tuples). `product` is matched against those
-- existing tables the same way, by (name, bottle_size_ml) - deliberately
-- NOT adding a product_id FK to finished_good/warehouse_stock/dispatch, so
-- this migration is purely additive and changes nothing about how those
-- tables already work.
--
-- customer_par_level and customer_stock_check use proper customer_id FKs
-- (like customer_activity/customer_request already do), not dispatch's
-- string-matching pattern - this is new customer-scoped data, not a
-- retrofit of dispatch.
--
-- customer_order is a header row only. Its line items are dispatch rows
-- themselves (see dispatch.order_id below) - there is deliberately no
-- separate order-line table, so "reuse the existing dispatch system, don't
-- build a second one" holds literally rather than just in spirit.

create table public.product (
  id uuid primary key default gen_random_uuid(),
  sku text unique,
  name text not null,
  bottle_size_ml integer,
  active boolean not null default true,
  sort_order integer,
  created_at timestamptz not null default now()
);
create unique index product_name_size_key on public.product (name, coalesce(bottle_size_ml, -1));
create index product_active_idx on public.product (active);

-- Seed the catalog from whatever's already being sold, so this table isn't
-- empty on day one. SKUs are left blank (nothing in this schema has ever
-- had one) for staff to fill in later.
insert into public.product (name, bottle_size_ml)
select distinct product_name, bottle_size_ml
from public.finished_good
on conflict do nothing;

-- ── Par levels ───────────────────────────────────────────────────────────────

create table public.customer_par_level (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer (id) on delete cascade,
  product_id uuid not null references public.product (id) on delete cascade,
  par_level integer not null default 0,
  updated_at timestamptz not null default now()
);
create unique index customer_par_level_unique on public.customer_par_level (customer_id, product_id);

-- ── Stock checks: append-only, never overwritten ────────────────────────────
-- session_id groups every line recorded in one "+ Stock Check" submission
-- (client generates one uuid per dialog open) - this is the grouping key
-- Stock History uses to show "12 Aug: Gin 700ml 8, Gin 200ml 14" as a single
-- entry, without needing a separate header table.

create table public.customer_stock_check (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer (id) on delete cascade,
  product_id uuid not null references public.product (id),
  quantity_bottles integer not null,
  check_date date not null,
  check_time text,
  session_id uuid not null,
  recorded_by text,
  created_at timestamptz not null default now()
);
create index customer_stock_check_customer_date_idx on public.customer_stock_check (customer_id, check_date desc);
create index customer_stock_check_session_idx on public.customer_stock_check (session_id);
create index customer_stock_check_product_idx on public.customer_stock_check (product_id);

-- ── Orders ───────────────────────────────────────────────────────────────────

create table public.customer_order (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references public.customer (id) on delete restrict,
  order_date date not null default current_date,
  ordered_by text,
  notes text,
  email_status text not null default 'pending', -- 'pending' | 'sent' | 'failed'
  email_error text,
  email_sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index customer_order_customer_idx on public.customer_order (customer_id);

-- Atomic order-number generator. Deliberately NOT the read-increment-write
-- pattern src/lib/packingSlip.js uses for packing slip numbers (that
-- pattern has a real, unguarded race condition - two concurrent callers can
-- read the same "last number" before either writes back). This uses a
-- single atomic upsert instead, so it's safe under concurrent Quick Orders.
-- Also deliberately not a bare Postgres sequence: the spec's numbering
-- resets per year (BD-2026-00001), which a sequence alone can't do.

create table public.order_number_counter (
  year integer primary key,
  last_number integer not null default 0
);

create or replace function public.generate_order_number()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  yr integer := extract(year from now())::integer;
  n integer;
begin
  insert into public.order_number_counter (year, last_number)
  values (yr, 1)
  on conflict (year) do update set last_number = public.order_number_counter.last_number + 1
  returning last_number into n;
  return 'BD-' || yr || '-' || lpad(n::text, 5, '0');
end;
$$;
revoke execute on function public.generate_order_number() from public, anon;
grant execute on function public.generate_order_number() to authenticated;

-- ── Dispatch integration ─────────────────────────────────────────────────────
-- The one additive touch to the existing dispatch table: links a dispatch
-- row back to the order that created it. Nullable, so every existing
-- dispatch row (and every future dispatch NOT created via Quick Order) is
-- completely unaffected. This is what lets Quick Order's line items be real
-- dispatch rows instead of a second, duplicate order-line table.

alter table public.dispatch add column order_id uuid references public.customer_order (id) on delete set null;
create index dispatch_order_id_idx on public.dispatch (order_id);

-- ── RLS: same blanket authenticated-only policy every table in this schema uses ──

alter table public.product enable row level security;
alter table public.customer_par_level enable row level security;
alter table public.customer_stock_check enable row level security;
alter table public.customer_order enable row level security;
alter table public.order_number_counter enable row level security;

create policy product_authenticated_all on public.product
  for all to authenticated using (true) with check (true);
create policy customer_par_level_authenticated_all on public.customer_par_level
  for all to authenticated using (true) with check (true);
create policy customer_stock_check_authenticated_all on public.customer_stock_check
  for all to authenticated using (true) with check (true);
create policy customer_order_authenticated_all on public.customer_order
  for all to authenticated using (true) with check (true);
-- order_number_counter is only ever touched through generate_order_number()
-- (security definer) - no policy needed, no direct client access at all.

revoke all on public.product from anon;
revoke all on public.customer_par_level from anon;
revoke all on public.customer_stock_check from anon;
revoke all on public.customer_order from anon;
revoke all on public.order_number_counter from anon, authenticated;

grant select, insert, update, delete on public.product to authenticated;
grant select, insert, update, delete on public.customer_par_level to authenticated;
grant select, insert, update, delete on public.customer_stock_check to authenticated;
grant select, insert, update, delete on public.customer_order to authenticated;

-- ── New page: Order Detail drill-down ────────────────────────────────────────

insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('order-detail', 'Order Detail', '/customers/:customerId/orders/:orderId', '{admin,user}')
on conflict (page_key) do nothing;
