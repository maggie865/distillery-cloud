-- Compliance is being reorganized into a hub page (/compliance) with the
-- existing Checklists page merged with the bottle washer's pre-use check
-- into "Daily Checks" (/daily-checks) — see src/pages/Compliance.jsx and
-- src/pages/Checklists.jsx. page_permission access is deny-by-default for
-- any page_key with no row (usePagePermissions.js), so the new hub needs
-- its own row or every non-super-admin user gets locked out of it; the
-- 'checklists' key/permissions are kept as-is (same key = same existing
-- grants carry over to the merged page), just relabeled here so the
-- Permissions settings page displays the new name/path.

insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('compliance', 'Compliance', '/compliance', '{admin,user}')
on conflict (page_key) do nothing;

update public.page_permission
set label = 'Daily Checks', path = '/daily-checks'
where page_key = 'checklists';
