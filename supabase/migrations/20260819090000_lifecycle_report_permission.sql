-- EMS step 6: Lifecycle Report — new page only, no new table. It reads
-- existing entities (environmental_aspect, receiving, dispatch,
-- warehouse_stock, utility_log) and rolls up their already-computed
-- co2e_kg figures by the same 5 lifecycle stages used in the Aspects &
-- Impacts Register, so just a page_permission row is needed here.

insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('lifecycle-report', 'Lifecycle Report', '/lifecycle-report', '{admin,user}')
on conflict (page_key) do nothing;
