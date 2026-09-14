-- SOP Library page — reads SOPs live from a private Notion database via the
-- notion-list-sops / notion-get-page edge functions, never publishes them,
-- and needs no table of its own (Notion is the source of truth). Only the
-- page_permission row is needed so the page isn't denied by default.
insert into public.page_permission (page_key, label, path, allowed_roles) values
  ('sop-library', 'SOPs', '/sops', '{admin,user}')
on conflict (page_key) do nothing;
