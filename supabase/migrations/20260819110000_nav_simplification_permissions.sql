-- Nav simplification: extends the hub-dashboard pattern (already used by
-- Compliance/EMS) to Production and Inventory, and trims Compliance's own
-- top-nav quick-list the same way EMS's already was. Two brand new pages
-- (production, inventory-hub) need their own page_permission row or
-- every non-super-admin user is denied by default (usePagePermissions.js).
-- The existing sub-pages (tanks, dilutions, etc.) keep their current keys
-- and permissions unchanged — only their hubOnly flag in pages.js changed,
-- which isn't stored here at all.

insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('production', 'Production', '/production', '{admin,user}'),
  ('inventory-hub', 'Inventory', '/inventory-hub', '{admin,user}')
on conflict (page_key) do nothing;
