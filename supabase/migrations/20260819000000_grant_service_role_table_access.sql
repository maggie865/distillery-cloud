-- Fix: service_role was missing SELECT/INSERT/UPDATE/DELETE on every table
-- in public (confirmed project-wide, not just the new xero_* tables — e.g.
-- product/dispatch show the same gap). This project's baseline setup never
-- ran the usual Supabase default-privilege grant to service_role, so it sat
-- latent until the Xero Edge Functions became the first server-side code to
-- actually query the database with a service-role client (every earlier
-- Edge Function, send-order-email, only calls an external API). The
-- resulting error was "permission denied for table xero_connection" /
-- "... xero_oauth_state" / "... dispatch" when xero-oauth-start,
-- xero-oauth-callback, xero-connection and xero-sync-invoices tried to read
-- or write those tables.
--
-- Granting service_role full table access is safe and intended: it's the
-- server-only key (never shipped to the browser, only read via
-- Deno.env.get inside Edge Functions) and already bypasses RLS by design —
-- this migration just restores the grants that should always have existed
-- alongside that.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- So this doesn't recur for any table created after today.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
