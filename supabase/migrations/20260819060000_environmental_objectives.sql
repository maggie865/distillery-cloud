-- EMS step 3: Objectives & Targets, auto-tracked against existing Waste
-- Tracker / Utility Tracker data where possible (progress is computed
-- client-side from live data at render time — see src/pages/Objectives.jsx
-- — not stored here, so there's nothing to keep in sync).

create table public.environmental_objective (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  aspect_id uuid references public.environmental_aspect (id) on delete set null,
  metric_source text not null check (metric_source in ('waste', 'utility', 'manual')),
  waste_category text,
  waste_unit text check (waste_unit in ('kg', 'litres')),
  utility_metric text check (utility_metric in ('electricity_kwh', 'water_litres', 'electricity_cost', 'water_cost')),
  unit_label text,
  baseline_value numeric,
  target_value numeric not null,
  target_direction text not null check (target_direction in ('at_or_below', 'at_or_above')),
  period_start date not null,
  period_end date not null,
  manual_current_value numeric,
  status text not null default 'in_progress' check (status in ('in_progress', 'achieved', 'missed', 'on_hold')),
  owner text,
  created_at timestamptz not null default now()
);
create index environmental_objective_aspect_idx on public.environmental_objective (aspect_id);

alter table public.environmental_objective enable row level security;
create policy environmental_objective_authenticated_all on public.environmental_objective
  for all to authenticated using (true) with check (true);
-- RLS policies alone don't grant table-level access on this project —
-- confirmed repeatedly this session.
grant select, insert, update, delete on public.environmental_objective to authenticated;

insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('objectives', 'Objectives & Targets', '/objectives', '{admin,user}')
on conflict (page_key) do nothing;
