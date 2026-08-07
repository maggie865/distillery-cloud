-- Xero integration: OAuth token storage + supporting columns.
--
-- All the actual Xero API calls (OAuth exchange, contact sync, invoice
-- posting) happen in Edge Functions (supabase/functions/xero-*), never in
-- the browser - a Xero refresh token grants long-lived access to real
-- accounting data, so it can never be readable by the authenticated role,
-- only by Edge Functions using the service role key (which bypasses RLS
-- entirely). xero_tokens below has RLS enabled with zero policies for
-- authenticated/anon, i.e. the client can never read or write it under any
-- circumstance - the only way in is the service role.

create table public.xero_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  tenant_name text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create unique index xero_tokens_tenant_id_key on public.xero_tokens (tenant_id);
alter table public.xero_tokens enable row level security;
revoke all on public.xero_tokens from authenticated, anon;

-- Short-lived CSRF state for the OAuth redirect round-trip. xero-oauth-start
-- writes a row, xero-oauth-callback checks and deletes it - both via the
-- service role, same lockdown as xero_tokens.
create table public.xero_oauth_state (
  state text primary key,
  user_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.xero_oauth_state enable row level security;
revoke all on public.xero_oauth_state from authenticated, anon;

-- Safe, read-only status check for the Settings page - exposes whether a
-- connection exists and which org it's to, never the tokens themselves.
create or replace function public.xero_connection_status()
returns table (connected boolean, tenant_name text, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec record;
begin
  if (select auth.jwt() -> 'app_metadata' ->> 'role') <> 'super_admin' then
    raise exception 'Only super_admin can view Xero connection status';
  end if;

  select t.tenant_name, t.updated_at into rec
  from public.xero_tokens t
  order by t.updated_at desc
  limit 1;

  if rec is null then
    return query select false, null::text, null::timestamptz;
  else
    return query select true, rec.tenant_name, rec.updated_at;
  end if;
end;
$$;

create or replace function public.xero_disconnect()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.jwt() -> 'app_metadata' ->> 'role') <> 'super_admin' then
    raise exception 'Only super_admin can disconnect Xero';
  end if;
  delete from public.xero_tokens;
end;
$$;

revoke execute on function public.xero_connection_status() from public, anon;
grant execute on function public.xero_connection_status() to authenticated;
revoke execute on function public.xero_disconnect() from public, anon;
grant execute on function public.xero_disconnect() to authenticated;

-- ── Supporting columns for two-way contact sync + invoice posting ─────────

-- customer already has xero_contact_id (20260806020000) but no updated_at -
-- needed to tell "changed locally since last sync" apart from "changed in
-- Xero since last sync" for the two-way merge in xero-sync-contacts.
alter table public.customer add column if not exists updated_at timestamptz not null default now();
alter table public.customer add column if not exists xero_synced_at timestamptz;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customer_set_updated_at on public.customer;
create trigger customer_set_updated_at
  before update on public.customer
  for each row
  execute function public.set_updated_at();

-- dispatch already has xero_invoice_id (20260806020000) - this just tracks
-- when it was posted, so the "Post to Xero" button knows to show as done
-- without an extra API round-trip.
alter table public.dispatch add column if not exists xero_posted_at timestamptz;
