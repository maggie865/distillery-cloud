-- Sales Rep portal: a fourth role, locked to a small slice of pages
-- (Sales Overview, Customers, Dispatch), scoped to only the customers
-- assigned to that rep, with manual pinning to prioritize which of their
-- own accounts float to the top.

-- ── Allow the new role everywhere the role enum is checked ─────────────────
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

  if new_role not in ('super_admin', 'admin', 'user', 'sales_rep') then
    raise exception 'Invalid role: %', new_role;
  end if;

  select coalesce(raw_app_meta_data ->> 'role', 'user') into current_target_role
  from auth.users where id = target_user_id;

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

-- list_users_for_admin now also returns full_name (Google display name),
-- needed so the Permissions user list and the customer rep-assignment
-- dropdown can show a real name instead of just an email address. The
-- return row shape changed, so the old signature has to be dropped first —
-- create or replace alone can't change OUT parameters.
drop function if exists public.list_users_for_admin();

create or replace function public.list_users_for_admin()
returns table (
  id uuid,
  email text,
  full_name text,
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
    select u.id, u.email::text, coalesce(u.raw_user_meta_data ->> 'full_name', u.email::text),
      coalesce(u.raw_app_meta_data ->> 'role', 'user'), u.created_at, u.last_sign_in_at
    from auth.users u
    order by u.created_at asc;
end;
$$;

-- Separate, much less privileged RPC — any signed-in user needs to see the
-- list of sales_rep accounts to assign a customer to one, but the existing
-- list_users_for_admin() is deliberately locked to super_admin only (it
-- exposes every user, every role, sign-in history). This exposes just
-- id/name for accounts already in the one low-sensitivity role that needs
-- to be pickable from a dropdown.
create or replace function public.list_sales_reps()
returns table (id uuid, full_name text)
language sql
security definer
set search_path = ''
stable
as $$
  select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', u.email::text)
  from auth.users u
  where coalesce(u.raw_app_meta_data ->> 'role', 'user') = 'sales_rep'
  order by 2;
$$;

revoke execute on function public.list_sales_reps() from public, anon;
grant execute on function public.list_sales_reps() to authenticated;

-- ── Customer → sales rep assignment ─────────────────────────────────────────
-- Deliberately a real reference to a real login (not the existing free-text
-- account_manager field, which stays untouched for its existing display/
-- filter uses) so "my customers" scoping can't drift out of sync with a
-- typo'd name.
alter table public.customer add column if not exists assigned_rep_id uuid references auth.users(id) on delete set null;
create index if not exists customer_assigned_rep_id_idx on public.customer (assigned_rep_id);

-- ── Manual customer pinning (per user, not just sales_rep — any user can
-- pin their own priority accounts) ──────────────────────────────────────────
create table public.customer_pin (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customer(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, customer_id)
);

alter table public.customer_pin enable row level security;

create policy customer_pin_select on public.customer_pin
  for select to authenticated using (user_id = auth.uid());
create policy customer_pin_insert on public.customer_pin
  for insert to authenticated with check (user_id = auth.uid());
create policy customer_pin_delete on public.customer_pin
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.customer_pin to authenticated;

-- ── Page access for the new role ────────────────────────────────────────────
-- Only the "sales area" pages the user asked for: Sales Overview, Customers
-- (+ its detail/order-detail drill-downs), and Dispatch. Everything else
-- (Production, Stock, Compliance, EMS, Suppliers, Reports, Settings, the
-- main company Dashboard) stays off — PageGate's existing fallback redirect
-- means visiting "/" bounces a sales_rep straight to the first page they do
-- have (Sales Overview), with no separate redirect logic needed.
update public.page_permission
set allowed_roles = array_append(allowed_roles, 'sales_rep')
where page_key in ('sales', 'customers', 'customer-detail', 'order-detail', 'dispatch')
  and not ('sales_rep' = any(allowed_roles));
