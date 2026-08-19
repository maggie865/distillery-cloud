-- Step 1 of building out the EMS (Environmental Management System) section
-- the user wants to grow toward ISO 14001 alignment: relocate Waste Tracker
-- and Utilities out of Compliance into their own EMS nav group, behind a
-- new /ems hub page (src/pages/EMS.jsx), mirroring how /compliance works.
-- page_permission access is deny-by-default for any page_key with no row
-- (usePagePermissions.js), so the new hub needs its own row or every
-- non-super-admin user gets locked out of it. waste-tracker/utilities keep
-- their existing keys and permission rows unchanged — only their navGroup
-- moved in pages.js, which isn't stored here at all.

insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('ems', 'EMS', '/ems', '{admin,user}')
on conflict (page_key) do nothing;
