-- Production Planner: a schedule of upcoming distillation/dilution/bottling
-- runs with a target date range and (optionally) a tank assignment, so
-- staff can see what's planned and avoid double-booking a tank. This is a
-- planning layer only - it doesn't touch or replace the real run tables
-- (distillation_run, dilution, bottling_run, sns_run), which still get
-- created the normal way once a planned run is actually carried out.

create table public.production_plan (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in ('distillation', 'sns_distillation', 'dilution', 'bottling')),
  title text not null,
  product_name text,
  tank_id uuid references public.storage_tank (id) on delete set null,
  planned_date date not null,
  -- Nullable - treated as same-day as planned_date wherever it's read
  -- (set explicitly to planned_date in the UI's submit handler for
  -- single-day entries, same "computed in JS, not a DB default" approach
  -- this codebase already uses for co2e_kg/significance/etc elsewhere).
  planned_end_date date,
  status text not null default 'planned' check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  notes text,
  created_by text,
  created_at timestamptz not null default now()
);
create index production_plan_date_idx on public.production_plan (planned_date);
create index production_plan_tank_idx on public.production_plan (tank_id);

alter table public.production_plan enable row level security;
create policy production_plan_authenticated_all on public.production_plan
  for all to authenticated using (true) with check (true);
revoke all on public.production_plan from anon;
grant select, insert, update, delete on public.production_plan to authenticated;

insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('production-planner', 'Production Planner', '/production-planner', '{admin,user}')
on conflict (page_key) do nothing;
