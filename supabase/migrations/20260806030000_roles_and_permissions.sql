-- Role-based access control: super_admin / admin / user, plus a
-- super-admin-configurable page access matrix.
--
-- Role storage: roles live in auth.users.raw_app_meta_data, NOT
-- raw_user_meta_data. app_metadata is not client-editable (only the Admin
-- API / a privileged Postgres function can change it) - user_metadata is
-- user-editable via supabase.auth.updateUser(), which would let anyone grant
-- themselves admin. See AuthContext.jsx, which now reads
-- user.app_metadata.role instead of user.user_metadata.role.
--
-- Bootstrapping: a BEFORE INSERT trigger on auth.users assigns
-- 'super_admin' to maggie@bluffdistillery.com and 'user' to everyone else
-- at signup time. A one-off backfill below handles anyone who signed up
-- before this migration ran.

-- ── Bootstrap the first super_admin + default role for everyone else ──────

create or replace function public.assign_initial_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(new.email) = 'maggie@bluffdistillery.com' then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'super_admin');
  else
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'user');
  end if;
  return new;
end;
$$;

drop trigger if exists assign_initial_role_trigger on auth.users;
create trigger assign_initial_role_trigger
  before insert on auth.users
  for each row
  execute function public.assign_initial_role();

-- Backfill: anyone who already signed up before this migration.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'super_admin')
where lower(email) = 'maggie@bluffdistillery.com';

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'user')
where (raw_app_meta_data ->> 'role') is null
  and lower(email) <> 'maggie@bluffdistillery.com';

-- ── Admin RPCs: list users / change a user's role ──────────────────────────
-- Both check the CALLER's own role via auth.jwt() (reflects the calling
-- request's verified JWT regardless of this function's SECURITY DEFINER
-- privilege) - only super_admin may call these.

create or replace function public.list_users_for_admin()
returns table (
  id uuid,
  email text,
  role text,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.jwt() -> 'app_metadata' ->> 'role') <> 'super_admin' then
    raise exception 'Only super_admin can list users';
  end if;

  return query
    select u.id, u.email::text, coalesce(u.raw_app_meta_data ->> 'role', 'user'), u.created_at, u.last_sign_in_at
    from auth.users u
    order by u.created_at asc;
end;
$$;

create or replace function public.set_user_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_target_role text;
  remaining_super_admins integer;
begin
  if (select auth.jwt() -> 'app_metadata' ->> 'role') <> 'super_admin' then
    raise exception 'Only super_admin can change user roles';
  end if;

  if new_role not in ('super_admin', 'admin', 'user') then
    raise exception 'Invalid role: %', new_role;
  end if;

  select coalesce(raw_app_meta_data ->> 'role', 'user') into current_target_role
  from auth.users where id = target_user_id;

  -- Don't allow demoting the last remaining super_admin - would lock
  -- everyone out of this whole permission system.
  if current_target_role = 'super_admin' and new_role <> 'super_admin' then
    select count(*) into remaining_super_admins
    from auth.users
    where (raw_app_meta_data ->> 'role') = 'super_admin' and id <> target_user_id;

    if remaining_super_admins = 0 then
      raise exception 'Cannot remove the last super_admin';
    end if;
  end if;

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', new_role)
  where id = target_user_id;
end;
$$;

revoke execute on function public.list_users_for_admin() from public, anon;
grant execute on function public.list_users_for_admin() to authenticated;
revoke execute on function public.set_user_role(uuid, text) from public, anon;
grant execute on function public.set_user_role(uuid, text) to authenticated;

-- ── Page access matrix ──────────────────────────────────────────────────────
-- super_admin always has access to every page (checked in the frontend, not
-- stored here) - this table only controls what 'admin' and 'user' can see.
-- Uses the same generic id/CRUD shape as every other app table so the
-- existing makeEntity() wrapper in supabaseClient.js works unmodified.

create table public.page_permission (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  label text not null,
  path text not null,
  allowed_roles text[] not null default '{admin,user}',
  created_at timestamptz not null default now()
);
create unique index page_permission_page_key_key on public.page_permission (page_key);

-- 'bottling' and 'raw-materials' aren't linked from any nav menu (legacy
-- pages superseded by bottling-floor and receiving/inventory respectively)
-- but their routes still exist and are reachable by direct URL, so they're
-- included here too rather than left outside the permission system entirely.
insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('dashboard',           'Dashboard',           '/',                 '{admin,user}'),
  ('receiving',           'Receiving',           '/receiving',        '{admin,user}'),
  ('bottling',            'Bottling (legacy)',   '/bottling',         '{admin,user}'),
  ('raw-materials',       'Raw Materials (legacy)', '/raw-materials', '{admin,user}'),
  ('dilutions',           'Dilutions',           '/dilutions',        '{admin,user}'),
  ('distillation',        'Distillations',       '/distillation',     '{admin,user}'),
  ('sns-distillation',    'SNS Distillation',    '/sns-distillation', '{admin,user}'),
  ('bottling-floor',      'Bottling Floor',      '/bottling-floor',   '{admin,user}'),
  ('inventory',           'Finished Goods',      '/inventory',        '{admin,user}'),
  ('warehouse',           'Warehouse (3PL)',     '/warehouse',        '{admin,user}'),
  ('stock-takes',         'Stock Takes',         '/stock-takes',      '{admin,user}'),
  ('whiskey-barrels',     'Whiskey Barrels',     '/whiskey-barrels',  '{admin,user}'),
  ('batch-tracker',       'Batch Tracker',       '/batch-tracker',    '{admin,user}'),
  ('dispatch',            'Dispatch',            '/dispatch',         '{admin,user}'),
  ('customers',           'Customers',           '/customers',        '{admin,user}'),
  ('suppliers',           'Suppliers',           '/suppliers',        '{admin,user}'),
  ('checklists',          'Checklists',          '/checklists',       '{admin,user}'),
  ('temperature-logs',    'Temperature Logs',    '/temperature-logs', '{admin,user}'),
  ('maintenance',         'Maintenance',         '/maintenance',      '{admin,user}'),
  ('pest-control',        'Pest Control',        '/pest-control',     '{admin,user}'),
  ('food-recall',         'Food Recall',         '/food-recall',      '{admin,user}'),
  ('waste-tracker',       'Waste Tracker',       '/waste-tracker',    '{admin,user}'),
  ('utilities',           'Utilities',           '/utilities',        '{admin,user}'),
  ('reports',             'Reports',             '/reports',          '{admin,user}'),
  ('settings',            'Settings',            '/settings',         '{admin,user}');

alter table public.page_permission enable row level security;

-- Any signed-in user needs to read this (to know what nav/routes to show
-- themselves) - only super_admin can change it.
create policy page_permission_select on public.page_permission
  for select to authenticated using (true);
create policy page_permission_insert on public.page_permission
  for insert to authenticated
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');
create policy page_permission_update on public.page_permission
  for update to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin')
  with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');
create policy page_permission_delete on public.page_permission
  for delete to authenticated
  using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin');

revoke all on public.page_permission from anon;
grant select, insert, update, delete on public.page_permission to authenticated;
