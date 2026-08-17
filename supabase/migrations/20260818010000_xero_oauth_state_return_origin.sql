-- The OAuth callback runs server-side with no reliable way to know which
-- frontend origin (production domain, or a Vercel preview URL) the user
-- started the "Connect to Xero" flow from. Rather than hardcode a domain,
-- xero-oauth-start now records the browser's own window.location.origin
-- alongside the CSRF state token, and xero-oauth-callback reads it back
-- to build the redirect Location — works correctly from any deployment.

alter table public.xero_oauth_state add column return_origin text;
