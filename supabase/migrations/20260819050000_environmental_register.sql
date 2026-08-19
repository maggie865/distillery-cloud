-- EMS step 2: Environmental Policy + Aspects & Impacts Register — the
-- ISO 14001 foundation the rest of the EMS (objectives, legal register,
-- reports) gets built on top of. Significance is Likelihood x Severity,
-- computed app-side before save (matches how co2e_kg etc. are computed
-- app-side elsewhere in this codebase, not via generated columns) with a
-- >=15 threshold flagging an aspect as significant.

create table public.environmental_policy (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  approved_by text,
  approved_date date,
  next_review_date date,
  created_at timestamptz not null default now()
);
-- Single current-policy row, updated in place (same singleton pattern as
-- the AppSettings-backed checklist templates in Checklists.jsx) — no
-- version history table yet.

create table public.environmental_aspect (
  id uuid primary key default gen_random_uuid(),
  activity text not null,
  aspect text not null,
  impact text not null,
  lifecycle_stage text not null check (lifecycle_stage in ('raw_materials', 'production', 'packaging', 'distribution', 'disposal')),
  condition text not null default 'normal' check (condition in ('normal', 'abnormal', 'emergency')),
  likelihood smallint not null check (likelihood between 1 and 5),
  severity smallint not null check (severity between 1 and 5),
  significance smallint not null,
  is_significant boolean not null,
  existing_controls text,
  legal_requirement text,
  owner text,
  review_date date,
  notes text,
  created_at timestamptz not null default now()
);
create index environmental_aspect_lifecycle_stage_idx on public.environmental_aspect (lifecycle_stage);

alter table public.environmental_policy enable row level security;
create policy environmental_policy_authenticated_all on public.environmental_policy
  for all to authenticated using (true) with check (true);
-- RLS policies alone don't grant table-level access on this project —
-- confirmed repeatedly this session (see 20260819010000_product_alias.sql).
grant select, insert, update, delete on public.environmental_policy to authenticated;

alter table public.environmental_aspect enable row level security;
create policy environmental_aspect_authenticated_all on public.environmental_aspect
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.environmental_aspect to authenticated;

-- New page needs its own page_permission row or every non-super-admin
-- user is denied by default (usePagePermissions.js).
insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('aspects-register', 'Aspects & Impacts Register', '/aspects-register', '{admin,user}')
on conflict (page_key) do nothing;
