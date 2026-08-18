-- product_alias — supplier packing-slip wording linked to a real stock
-- item, so Receiving's autocomplete can match "Neutral Grain Spirit 96" to
-- "Wheat ENA 96%" etc. Referenced by ProductLinksManager.jsx (Settings ->
-- Distillery -> Product Links) and MaterialAutocomplete.jsx (Receiving),
-- both already written against this exact shape — the table itself was
-- simply never created when the rest of the schema was migrated, so the
-- feature has never actually been able to save anything.

create table public.product_alias (
  id uuid primary key default gen_random_uuid(),
  alias_name text not null,
  raw_material_id uuid not null references public.raw_material (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One alias should only ever point at one stock item — case-insensitive so
-- "Neutral Grain Spirit 96" and "neutral grain spirit 96" aren't treated as
-- different aliases. Matches the "may already be in use" error message
-- ProductLinksManager.jsx already has ready for this.
create unique index product_alias_name_key on public.product_alias (lower(alias_name));
create index product_alias_raw_material_idx on public.product_alias (raw_material_id);

alter table public.product_alias enable row level security;
create policy product_alias_authenticated_all on public.product_alias
  for all to authenticated using (true) with check (true);
-- RLS policies alone don't grant table-level access — confirmed directly
-- against this project: authenticated gets no default SELECT/INSERT/
-- UPDATE/DELETE on a newly created table either (same class of gap fixed
-- for service_role in 20260819000000_grant_service_role_table_access.sql,
-- just for the other role this time).
grant select, insert, update, delete on public.product_alias to authenticated;
