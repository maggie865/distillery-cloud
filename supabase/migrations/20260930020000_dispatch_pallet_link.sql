-- Lets a dispatch record which physical pallet its stock came off, so
-- dispatching wholesale stock can (best-effort) decrement the matching
-- pallet_item — the pallet is a manifest, so this never blocks or corrects
-- the actual FinishedGood/WarehouseStock accounting, which stays the source
-- of truth for stock levels.
alter table public.dispatch add column if not exists pallet_id uuid references public.pallet(id) on delete set null;
create index if not exists dispatch_pallet_id_idx on public.dispatch (pallet_id);
