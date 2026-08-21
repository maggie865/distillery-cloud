-- Staff Training Register: a roster of staff (deliberately NOT linked to
-- auth.users - the team shares one generic login, so there's no per-person
-- account to hang this off) plus a set of training programs (Bottling
-- Staff Training, Tour Guide & Cellar Door Training, more can be added the
-- same way later) each broken into sections of individual sign-off items.
-- Gives a live "who's signed off on what" view that Bright HR doesn't
-- provide, without duplicating what Bright HR already owns (employment
-- records/documents).

create table public.staff_member (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  role text,
  employment_type text check (employment_type in ('permanent', 'part_time', 'casual')),
  start_date date,
  primary_trainer text,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table public.training_program (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.training_item (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.training_program (id) on delete cascade,
  section text not null,
  label text not null,
  -- Certification-type items (First Aid, Food Safety cert, etc.) track an
  -- expiry date; regular training items don't - same signoff row shape
  -- either way, this just controls whether the expiry field shows in the UI.
  is_certification boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- One row per (staff, item) once it's been touched - not pre-created for
-- every combination, so "no row" simply means not yet signed off.
create table public.training_signoff (
  id uuid primary key default gen_random_uuid(),
  staff_member_id uuid not null references public.staff_member (id) on delete cascade,
  training_item_id uuid not null references public.training_item (id) on delete cascade,
  completed boolean not null default false,
  date_completed date,
  trainer text,
  staff_initials text,
  expiry_date date,
  notes text,
  updated_at timestamptz not null default now(),
  unique (staff_member_id, training_item_id)
);

alter table public.staff_member enable row level security;
alter table public.training_program enable row level security;
alter table public.training_item enable row level security;
alter table public.training_signoff enable row level security;

create policy staff_member_authenticated_all on public.staff_member for all to authenticated using (true) with check (true);
create policy training_program_authenticated_all on public.training_program for all to authenticated using (true) with check (true);
create policy training_item_authenticated_all on public.training_item for all to authenticated using (true) with check (true);
create policy training_signoff_authenticated_all on public.training_signoff for all to authenticated using (true) with check (true);

revoke all on public.staff_member from anon;
revoke all on public.training_program from anon;
revoke all on public.training_item from anon;
revoke all on public.training_signoff from anon;

grant select, insert, update, delete on public.staff_member to authenticated;
grant select, insert, update, delete on public.training_program to authenticated;
grant select, insert, update, delete on public.training_item to authenticated;
grant select, insert, update, delete on public.training_signoff to authenticated;

insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('staff-training', 'Staff Training', '/staff-training', '{admin,user}'),
  ('staff-training-detail', 'Staff Training Detail', '/staff-training/:staffId', '{admin,user}')
on conflict (page_key) do nothing;

-- ── Seed: Bottling Staff Training Checklist ─────────────────────────────────
with prog as (
  insert into public.training_program (name, description, sort_order)
  values ('Bottling Staff Training', 'Core induction through to emergency response for bottling floor staff.', 1)
  returning id
)
insert into public.training_item (program_id, section, label, sort_order)
select prog.id, v.section, v.label, v.ord
from prog, (values
  ('Core Induction', 'Health & Safety Policy', 1),
  ('Core Induction', 'Emergency Evacuation', 2),
  ('Core Induction', 'First Aid Awareness', 3),
  ('Core Induction', 'Hazard Awareness', 4),
  ('Core Induction', 'PPE Requirements', 5),
  ('Food Safety (NP3 / FCP)', 'Personal hygiene (hand washing, illness reporting)', 6),
  ('Food Safety (NP3 / FCP)', 'Preventing cross contamination', 7),
  ('Food Safety (NP3 / FCP)', 'Cleaning & sanitising procedures', 8),
  ('Food Safety (NP3 / FCP)', 'Allergen awareness & control', 9),
  ('Food Safety (NP3 / FCP)', 'Waste management & pest control awareness', 10),
  ('Bottling Operations', 'Bottling line setup', 11),
  ('Bottling Operations', 'Filling operations', 12),
  ('Bottling Operations', 'Labelling & packaging', 13),
  ('Bottling Operations', 'Cleaning & shutdown', 14),
  ('Equipment / SOP Training', 'Manual handling', 15),
  ('Equipment / SOP Training', 'Pallet jack', 16),
  ('Equipment / SOP Training', 'Heat shrink gun', 17),
  ('Equipment / SOP Training', 'Box cutters', 18),
  ('Equipment / SOP Training', 'Air compressor', 19),
  ('Equipment / SOP Training', 'Ladders', 20),
  ('Safety Practices', 'Housekeeping', 21),
  ('Safety Practices', 'Hazard reporting', 22),
  ('Safety Practices', 'PPE compliance', 23),
  ('Safety Practices', 'Working around others', 24),
  ('Emergency Response', 'Fire response', 25),
  ('Emergency Response', 'Fire extinguisher use', 26),
  ('Emergency Response', 'Evacuation procedures', 27)
) as v(section, label, ord);

-- ── Seed: Tour Guide & Cellar Door Training ──────────────────────────────────
with prog as (
  insert into public.training_program (name, description, sort_order)
  values ('Tour Guide & Cellar Door Training', 'Training progress and required certifications for tour guide and cellar door staff.', 2)
  returning id
)
insert into public.training_item (program_id, section, label, is_certification, sort_order)
select prog.id, v.section, v.label, v.is_cert, v.ord
from prog, (values
  ('Training Progress', 'Induction (company overview, H&S, Handbook)', false, 1),
  ('Training Progress', 'Standard of Service walkthrough', false, 2),
  ('Training Progress', 'Reservations Procedure walkthrough', false, 3),
  ('Training Progress', 'Tour Guide training: route, site history, safety', false, 4),
  ('Training Progress', 'Tour Guide training: production process & product knowledge', false, 5),
  ('Training Progress', 'Cellar Door training: tasting service', false, 6),
  ('Training Progress', 'Cellar Door training: POS, pricing, shipping', false, 7),
  ('Training Progress', 'Cellar Door training: cash handling', false, 8),
  ('Training Progress', 'Responsible Service of Alcohol', false, 9),
  ('Training Progress', 'Accessibility & inclusion practices', false, 10),
  ('Training Progress', 'Shadowing — session 1', false, 11),
  ('Training Progress', 'Shadowing — session 2', false, 12),
  ('Training Progress', 'Shadowing — session 3', false, 13),
  ('Training Progress', 'Supervised practice — session 1', false, 14),
  ('Training Progress', 'Supervised practice — session 2', false, 15),
  ('Training Progress', 'Supervised practice — session 3', false, 16),
  ('Certifications', 'First Aid (Comprehensive)', true, 17),
  ('Certifications', 'Food Safety Certification', true, 18),
  ('Certifications', 'Duty Management Certificate', true, 19)
) as v(section, label, is_cert, ord);
