-- Marks one Distillery pallet as the single source distillery dispatches
-- draw from, mirroring storage_tank.is_ready_for_bottling — a persistent
-- flag toggled on the source entity's own page, instead of re-chosen on
-- every dispatch. Application code enforces "only one active at a time"
-- (same way only one of several ready tanks ends up chosen); this column
-- just stores the flag.
alter table public.pallet
  add column is_active_dispatch_pallet boolean not null default false;
