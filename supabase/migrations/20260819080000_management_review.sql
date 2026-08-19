-- EMS step 5: Management Review — ISO 14001 clause 9.3 requires top
-- management to review the EMS at planned intervals against a specific
-- set of inputs (status of prior actions, context changes, performance,
-- legal compliance, objective achievement, resource adequacy, interested
-- party feedback, improvement opportunities) and produce outputs
-- (conclusions, decisions, actions). Each review is a dated, historical
-- record — objectives_snapshot/legal_snapshot are frozen at creation time
-- (not recomputed live like Objectives.jsx's progress bars), since a past
-- review should keep showing what was true when it was written, not
-- today's numbers.

create table public.management_review (
  id uuid primary key default gen_random_uuid(),
  review_date date not null,
  attendees text,
  previous_actions_status text,
  context_changes text,
  performance_summary text,
  legal_compliance_summary text,
  objectives_summary text,
  interested_party_feedback text,
  resource_adequacy text,
  improvement_opportunities text,
  conclusion text,
  action_items jsonb not null default '[]',
  objectives_snapshot jsonb,
  legal_snapshot jsonb,
  significant_aspects_count integer,
  next_review_date date,
  created_at timestamptz not null default now()
);

alter table public.management_review enable row level security;
create policy management_review_authenticated_all on public.management_review
  for all to authenticated using (true) with check (true);
-- RLS policies alone don't grant table-level access on this project —
-- confirmed repeatedly this session.
grant select, insert, update, delete on public.management_review to authenticated;

insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('management-review', 'Management Review', '/management-review', '{admin,user}')
on conflict (page_key) do nothing;
