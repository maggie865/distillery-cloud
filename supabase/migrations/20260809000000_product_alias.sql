-- product_alias: maps a free-text item name as it appears on a supplier's
-- packing slip to the canonical raw_material record it should be received
-- against. The Receiving form uses this to auto-apply a known alias when a
-- line item's typed name doesn't match the stock item's own name, so
-- "Wheat ENA 96%" and "Neutral Grain Spirit 96" can both receive into the
-- same raw_material record instead of silently creating a duplicate.
--
-- Same blanket RLS approach as the rest of the schema (see initial_app_schema
-- design notes) - any authenticated user can create an alias inline while
-- receiving, not just from the Settings > Product Links manager.

create table public.product_alias (
  id uuid primary key default gen_random_uuid(),
  alias_name text not null,
  raw_material_id uuid not null references public.raw_material (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One canonical mapping per alias text, case-insensitive.
create unique index product_alias_alias_name_key on public.product_alias (lower(alias_name));
create index product_alias_raw_material_id_idx on public.product_alias (raw_material_id);

alter table public.product_alias enable row level security;

create policy product_alias_authenticated_all on public.product_alias
  for all to authenticated using (true) with check (true);

revoke all on public.product_alias from anon;
grant select, insert, update, delete on public.product_alias to authenticated;
