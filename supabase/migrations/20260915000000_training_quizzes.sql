-- Knowledge quizzes tied to a specific training_item — passing one can
-- satisfy that item's sign-off automatically instead of a trainer manually
-- ticking it. Questions/options are stored as one jsonb blob on the quiz
-- row (like raw_material.lots, recipe.ingredients elsewhere) since they're
-- always read/edited together as a single unit, never queried individually.
-- Shape: [{ id, text, options: [{ id, text, correct }] }]
create table public.training_quiz (
  id uuid primary key default gen_random_uuid(),
  training_item_id uuid not null references public.training_item(id) on delete cascade,
  title text not null,
  description text,
  pass_threshold_pct smallint not null default 80 check (pass_threshold_pct between 1 and 100),
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (training_item_id)
);

-- One row per attempt — queried/filtered independently (pass rates, retake
-- history over time), so a real table rather than embedded jsonb.
-- answers shape: [{ question_id, selected_option_id }]
create table public.training_quiz_attempt (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.training_quiz(id) on delete cascade,
  staff_member_id uuid not null references public.staff_member(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  score_pct numeric not null,
  passed boolean not null,
  attempted_at timestamptz not null default now()
);

alter table public.training_quiz enable row level security;
alter table public.training_quiz_attempt enable row level security;

create policy training_quiz_authenticated_all on public.training_quiz for all to authenticated using (true) with check (true);
create policy training_quiz_attempt_authenticated_all on public.training_quiz_attempt for all to authenticated using (true) with check (true);

revoke all on public.training_quiz from anon;
revoke all on public.training_quiz_attempt from anon;

grant select, insert, update, delete on public.training_quiz to authenticated;
grant select, insert, update, delete on public.training_quiz_attempt to authenticated;

-- Team Hub — a single landing space for SOPs, Staff Training, Quizzes, and
-- a Bright HR quick link, so staff aren't hopping between separate pages.
insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('team-hub', 'Team Hub', '/team-hub', '{admin,user}')
on conflict (page_key) do nothing;
