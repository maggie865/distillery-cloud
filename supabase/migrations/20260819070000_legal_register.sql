-- EMS step 4: Legal & Compliance Register — ISO 14001 clause 6.1.3 requires
-- identifying legal/regulatory requirements relevant to the business and
-- periodically evaluating compliance against them (resource consents,
-- excise licence, trade waste discharge, etc.). Follows the same pattern
-- as environmental_aspect/environmental_objective.

create table public.legal_requirement (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('environmental', 'health_safety', 'excise_customs', 'building', 'food_safety', 'employment', 'other')),
  issuing_authority text,
  reference_number text,
  requirement_summary text,
  aspect_id uuid references public.environmental_aspect (id) on delete set null,
  compliance_status text not null default 'not_yet_assessed' check (compliance_status in ('compliant', 'non_compliant', 'under_review', 'not_yet_assessed')),
  expiry_date date,
  last_reviewed_date date,
  next_review_date date,
  document_url text,
  notes text,
  owner text,
  created_at timestamptz not null default now()
);
create index legal_requirement_aspect_idx on public.legal_requirement (aspect_id);

alter table public.legal_requirement enable row level security;
create policy legal_requirement_authenticated_all on public.legal_requirement
  for all to authenticated using (true) with check (true);
-- RLS policies alone don't grant table-level access on this project —
-- confirmed repeatedly this session.
grant select, insert, update, delete on public.legal_requirement to authenticated;

insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('legal-register', 'Legal & Compliance Register', '/legal-register', '{admin,user}')
on conflict (page_key) do nothing;
