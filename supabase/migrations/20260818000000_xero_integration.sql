-- Xero integration: sales invoices sync in as draft ('pending') dispatch
-- rows for the sales team to review, allocate a real batch against, and
-- approve — mirrors the existing pending/picking/ready/dispatched/delivered
-- pipeline already used elsewhere in dispatch (stock only ever deducts on
-- the transition into 'dispatched'/'delivered', see DispatchHub.jsx's
-- DEDUCTED_STATUSES), so no new dispatch status is introduced here.

-- ── OAuth token storage ──────────────────────────────────────────────────────
-- Holds live Xero access/refresh tokens. Deliberately NOT given the usual
-- "for all to authenticated" policy every other table in this schema gets —
-- RLS is enabled with zero policies, so only the service_role key (used
-- server-side inside Edge Functions, which bypasses RLS entirely) can read
-- or write it. The frontend never queries this table directly; it goes
-- through the xero-connection Edge Function, which returns only
-- non-secret status fields.

create table public.xero_connection (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null unique,
  tenant_name text,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  scopes text,
  connected_by text,
  connected_at timestamptz not null default now(),
  last_refreshed_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.xero_connection enable row level security;

-- One-time CSRF token for the OAuth redirect round-trip. Same lockdown as
-- xero_connection — written and consumed only by the OAuth Edge Functions.
create table public.xero_oauth_state (
  state text primary key,
  created_at timestamptz not null default now()
);
alter table public.xero_oauth_state enable row level security;

-- ── Item mapping ─────────────────────────────────────────────────────────────
-- User-configurable: the same product is sold under multiple Xero line
-- items (case vs single bottle, duty-free vs promo/sample variants), so
-- this is a many-to-one mapping the sales team maintains themselves in
-- Settings, not a hardcoded lookup.

create table public.xero_item_mapping (
  id uuid primary key default gen_random_uuid(),
  xero_item_code text,
  xero_description text,
  product_id uuid not null references public.product (id),
  bottles_per_line_unit integer not null default 1,
  duty_free boolean not null default false,
  sample_dispatch boolean not null default false,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  constraint xero_item_mapping_has_match check (xero_item_code is not null or xero_description is not null)
);
create unique index xero_item_mapping_code_key on public.xero_item_mapping (xero_item_code) where xero_item_code is not null;
create unique index xero_item_mapping_desc_key on public.xero_item_mapping (lower(xero_description)) where xero_item_code is null and xero_description is not null;
create index xero_item_mapping_active_idx on public.xero_item_mapping (active);

alter table public.xero_item_mapping enable row level security;
create policy xero_item_mapping_authenticated_all on public.xero_item_mapping
  for all to authenticated using (true) with check (true);
revoke all on public.xero_item_mapping from anon;
grant select, insert, update, delete on public.xero_item_mapping to authenticated;

-- ── Dispatch: idempotent sync + unmatched-line support ──────────────────────
-- xero_invoice_id already exists (added in the original schema, never
-- written to until now) and stays non-unique — one invoice has many line
-- items, each becoming its own dispatch row. xero_line_item_id is the real
-- idempotency key the sync function upserts on.

alter table public.dispatch
  add column xero_line_item_id text unique,
  add column xero_item_code text;

-- Unmatched Xero lines (no mapping configured yet) land as a dispatch row
-- with product_name taken from the raw Xero description but no known
-- bottle size — same relaxation already applied to batch_number in
-- 20260814000000_dispatch_batch_number_optional.sql, for the same reason:
-- the real value gets filled in when the row is approved.
alter table public.dispatch alter column bottle_size_ml drop not null;

create index dispatch_xero_invoice_id_idx on public.dispatch (xero_invoice_id) where xero_invoice_id is not null;
