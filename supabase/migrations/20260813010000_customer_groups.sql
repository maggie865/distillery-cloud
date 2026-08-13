-- Customer groups: user-defined tags a customer can carry any number of
-- (e.g. "Christmas Promo", "North Island Route", "VIP") to support ad-hoc
-- grouping/search on the Customers page, on top of the existing
-- type/region/account-manager filters. A real group table (rather than a
-- free-text array on customer) so a group can be renamed in one place and
-- so membership can be queried/counted without scanning every customer row.

create table public.customer_group (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  created_at timestamptz not null default now()
);

create table public.customer_group_member (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer (id) on delete cascade,
  group_id uuid not null references public.customer_group (id) on delete cascade,
  created_at timestamptz not null default now()
);
create unique index customer_group_member_unique on public.customer_group_member (customer_id, group_id);
create index customer_group_member_group_idx on public.customer_group_member (group_id);
create index customer_group_member_customer_idx on public.customer_group_member (customer_id);

alter table public.customer_group enable row level security;
alter table public.customer_group_member enable row level security;

create policy customer_group_authenticated_all on public.customer_group
  for all to authenticated using (true) with check (true);
create policy customer_group_member_authenticated_all on public.customer_group_member
  for all to authenticated using (true) with check (true);

revoke all on public.customer_group from anon;
revoke all on public.customer_group_member from anon;
grant select, insert, update, delete on public.customer_group to authenticated;
grant select, insert, update, delete on public.customer_group_member to authenticated;
