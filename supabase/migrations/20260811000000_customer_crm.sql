-- Expands the Customer entity (previously just business_name + delivery
-- address, built for carbon reporting) into a full but simple Customer CRM
-- for the sales team, without touching the columns carbon reporting and
-- dispatch already depend on (business_name, delivery_address,
-- xero_contact_id all keep their exact names and semantics).
--
-- Deliberately NOT stored on customer: last_order_date, last_visit_date,
-- last_contact_date, next_planned_visit/contact, total_orders, total_sales.
-- All of those are derived from customer_activity/customer_request/dispatch
-- at read time (see src/lib/customerHealth.js) rather than duplicated as
-- columns that could drift out of sync - same "calculate, don't store"
-- principle already used for LAL/tank utilisation elsewhere in this schema.

alter table public.customer
  add column trading_name text,
  add column customer_type text,
  add column postal_address text,
  add column city text,
  add column region text,
  add column country text default 'New Zealand',
  add column website text,
  add column phone text,
  add column email text,
  add column primary_contact text,
  add column contact_role text,
  add column notes text,
  add column status text not null default 'active',
  add column account_manager text,
  add column customer_since date,
  add column visit_frequency text;

create index customer_status_idx on public.customer (status);
create index customer_region_idx on public.customer (region);

-- ── Customer activity: visits and contacts ──────────────────────────────────
-- One table for both "Log Visit" and "Log Contact" since they share almost
-- the same shape (date, who, notes, outcome, follow-up) and the Activity
-- Timeline needs to list both together in one chronological feed. `type`
-- distinguishes them; visit-only and contact-only fields are just left null
-- on the row that doesn't use them, consistent with how this schema already
-- leaves type-specific columns nullable elsewhere (see migration header
-- notes in 20260806020000).

create table public.customer_activity (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer (id) on delete cascade,
  type text not null,                 -- 'visit' | 'contact'
  date date not null,
  time text,
  subtype text,                       -- visit_type (sales_visit, stock_check, ...) or contact method (phone, email, ...)
  subject text,                       -- contact-only: short subject line
  notes text,
  discussed_products jsonb not null default '[]',
  outcome text,
  status text,                        -- contact-only: open/resolved, mirrors the "Status: Resolved" example
  follow_up_required boolean not null default false,
  follow_up_date date,
  follow_up_task text,
  recorded_by text,
  created_at timestamptz not null default now()
);
create index customer_activity_customer_id_idx on public.customer_activity (customer_id);
create index customer_activity_date_idx on public.customer_activity (date desc);
create index customer_activity_type_idx on public.customer_activity (type);
create index customer_activity_follow_up_date_idx on public.customer_activity (follow_up_date);

-- ── Customer requests ────────────────────────────────────────────────────────

create table public.customer_request (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer (id) on delete cascade,
  date_received date not null,
  request_type text not null,
  description text,
  priority text not null default 'normal',
  assigned_to text,
  status text not null default 'open',   -- open | in_progress | waiting | resolved
  due_date date,
  date_resolved date,
  resolution_notes text,
  created_at timestamptz not null default now()
);
create index customer_request_customer_id_idx on public.customer_request (customer_id);
create index customer_request_status_idx on public.customer_request (status);
create index customer_request_due_date_idx on public.customer_request (due_date);

alter table public.customer_activity enable row level security;
alter table public.customer_request enable row level security;

create policy customer_activity_authenticated_all on public.customer_activity
  for all to authenticated using (true) with check (true);
create policy customer_request_authenticated_all on public.customer_request
  for all to authenticated using (true) with check (true);

revoke all on public.customer_activity from anon;
revoke all on public.customer_request from anon;
grant select, insert, update, delete on public.customer_activity to authenticated;
grant select, insert, update, delete on public.customer_request to authenticated;

-- ── New pages: Sales overview dashboard + Customer Detail drill-down ────────
-- 'customers' already has a page_permission row from the original seed;
-- these two are new routes introduced alongside this CRM expansion.

insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('sales',            'Sales',            '/sales',             '{admin,user}'),
  ('customer-detail',  'Customer Detail',  '/customers/:customerId', '{admin,user}')
on conflict (page_key) do nothing;
