-- Support for the Tank Detail page (control-centre view of a single tank):
--  * storage_tank.expected_ready_at — optional, user-set target time for when
--    a maturing/holding tank's contents will be ready (e.g. for bottling).
--    Nullable and never auto-populated — the UI must leave it blank rather
--    than invent a value until someone actually sets it.
--  * tank_movement.temperature_c — optional reading captured alongside a
--    volume/ABV measurement, extending the existing tank event ledger rather
--    than introducing a parallel "measurements" table.
--
-- Also backfills two page_permission rows that were missing from the
-- original seed in 20260806030000_roles_and_permissions.sql: 'tanks' (the
-- Tank Farm page, linked from pages.js since day one) and the new
-- 'tank-detail' route added alongside this migration. Without these, only
-- super_admin could reach either page — admin/user were silently denied.

alter table public.storage_tank add column expected_ready_at timestamptz;
alter table public.tank_movement add column temperature_c numeric;

insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('tanks',        'Tanks',        '/tanks',        '{admin,user}'),
  ('tank-detail',  'Tank Detail',  '/tanks/:tankId', '{admin,user}')
on conflict (page_key) do nothing;
