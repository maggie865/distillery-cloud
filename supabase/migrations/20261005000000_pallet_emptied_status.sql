-- A pallet whose contents have all been taken off (dispatched, or moved to
-- another pallet — see deductFromPallet/TakeOffPalletDialog) is now marked
-- "emptied" rather than silently staying active/full with zero PalletItem
-- rows. This lets the bottling team pick the physical pallet back up (scan
-- it on the floor, or the "Add to Pallet" quick action after a run) instead
-- of it only ever being reachable by starting a brand new one.
alter table public.pallet drop constraint pallet_status_check;
alter table public.pallet add constraint pallet_status_check check (status in ('active', 'full', 'emptied', 'archived'));
