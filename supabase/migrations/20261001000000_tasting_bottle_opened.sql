-- Tracks a shop staff member clicking "Tasting Bottle Opened" — purely a
-- notification/audit record. Deliberately holds no quantity or product
-- reference and never touches finished_good/pallet_item: the whole point is
-- to alert the owner that *a* tasting bottle came open, not to adjust stock.
create table public.tasting_bottle_opened (
  id uuid primary key default gen_random_uuid(),
  pallet_id uuid references public.pallet (id) on delete set null,
  pallet_code text,
  location text,
  opened_by_user_id uuid,
  opened_by_name text,
  notes text,
  created_at timestamptz not null default now()
);
create index tasting_bottle_opened_created_idx on public.tasting_bottle_opened (created_at desc);
create index tasting_bottle_opened_pallet_idx on public.tasting_bottle_opened (pallet_id);

alter table public.tasting_bottle_opened enable row level security;
create policy tasting_bottle_opened_authenticated_all on public.tasting_bottle_opened
  for all to authenticated using (true) with check (true);
revoke all on public.tasting_bottle_opened from anon;
grant select, insert, update, delete on public.tasting_bottle_opened to authenticated;
