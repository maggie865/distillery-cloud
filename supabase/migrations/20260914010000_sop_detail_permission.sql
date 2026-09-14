-- SOP detail/reader page (navGroup: null, like customer-detail) needs its
-- own page_permission row too — PageGate checks by page_key regardless of
-- whether the page appears in the nav.
insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('sop-detail', 'SOP Detail', '/sops/:pageId', '{admin,user}')
on conflict (page_key) do nothing;
