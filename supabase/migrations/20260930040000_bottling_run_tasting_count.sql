-- The only record of how many tasting bottles a run produced was free text
-- inside `notes` ("Tasting: N") — fine for display, but deleteRunMutation
-- had no reliable way to know how many tasting bottles to reverse out of
-- tasting stock when a run is deleted, so it never did.
alter table public.bottling_run add column if not exists tasting_bottles_produced integer;
