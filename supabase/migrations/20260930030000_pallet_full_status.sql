-- A pallet being actively stacked on the bottling floor can now be marked
-- "full" (via the Complete Pallet action) distinct from "archived" (broken
-- down / no longer tracked at all) — it's a completed, shippable pallet
-- that still shows up as a real pallet with real contents, just not one
-- staff should keep adding bottles to.
alter table public.pallet drop constraint pallet_status_check;
alter table public.pallet add constraint pallet_status_check check (status in ('active', 'full', 'archived'));
