-- Refresher / ongoing training log - repeatable entries per staff member
-- (toolbox topics, refreshers, updates following customer feedback etc.)
-- that don't map to a fixed checklist item, unlike training_signoff. Not
-- scoped to a training_program - a refresher can be logged for any staff
-- member regardless of which program(s) they're on.
create table public.training_refresher_log (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references public.staff_member (id) on delete cascade,
  date date not null,
  topic text not null,
  delivered_by text,
  staff_initials text,
  notes text,
  created_at timestamptz not null default now()
);
create index training_refresher_log_staff_idx on public.training_refresher_log (staff_member_id);

alter table public.training_refresher_log enable row level security;
create policy training_refresher_log_authenticated_all on public.training_refresher_log
  for all to authenticated using (true) with check (true);
revoke all on public.training_refresher_log from anon;
grant select, insert, update, delete on public.training_refresher_log to authenticated;
