// xero-oauth-callback — step 2 of the Xero Authorization Code flow.
//
// Xero redirects the user's browser here directly after they approve
// access, as a plain GET with ?code=&state= — there is no Supabase JWT on
// this request (OAuth redirects can't carry custom headers), so this is
// the ONE function in this feature that must be deployed with JWT
// verification OFF:
//   supabase functions deploy xero-oauth-callback --no-verify-jwt
// Do not "fix" this by turning verification back on later — that would
// just make every real Xero redirect fail with 401.
//
// Deployment also requires:
//   supabase secrets set XERO_CLIENT_ID=... XERO_CLIENT_SECRET=...
// and the Redirect URI registered at developer.xero.com must exactly match
// SUPABASE_URL + /functions/v1/xero-oauth-callback (see xero-oauth-start).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const XERO_CLIENT_ID = Deno.env.get('XERO_CLIENT_ID');
const XERO_CLIENT_SECRET = Deno.env.get('XERO_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const XERO_REDIRECT_URI = `${SUPABASE_URL}/functions/v1/xero-oauth-callback`;
// Only used if a state row genuinely couldn't be matched (so we don't know
// where the user came from) — should be rare; the real per-request origin
// always comes from xero_oauth_state.return_origin.
const FALLBACK_ORIGIN = 'https://bluffdistillery.com';

function redirectTo(origin: string | null, status: 'connected' | 'error', message?: string) {
  const url = new URL('/settings', origin || FALLBACK_ORIGIN);
  url.searchParams.set('xero', status);
  if (message) url.searchParams.set('xero_message', message);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Look up (and consume) the state row regardless of outcome, so we know
  // where to redirect back to even on failure.
  let returnOrigin: string | null = null;
  if (state) {
    const { data: stateRow } = await supabase.from('xero_oauth_state').select('return_origin').eq('state', state).maybeSingle();
    returnOrigin = stateRow?.return_origin ?? null;
    await supabase.from('xero_oauth_state').delete().eq('state', state);
  }

  if (errorParam) return redirectTo(returnOrigin, 'error', errorParam);
  if (!code || !state) return redirectTo(returnOrigin, 'error', 'missing_code_or_state');
  if (!returnOrigin) {
    // state didn't match any row we issued — expired, already used, or
    // forged. Never proceed with the token exchange in that case.
    return redirectTo(null, 'error', 'invalid_state');
  }
  if (!XERO_CLIENT_ID || !XERO_CLIENT_SECRET) {
    return redirectTo(returnOrigin, 'error', 'not_configured');
  }

  try {
    const tokenRes = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: XERO_REDIRECT_URI }),
    });
    if (!tokenRes.ok) {
      console.error('Xero token exchange failed:', tokenRes.status, await tokenRes.text());
      return redirectTo(returnOrigin, 'error', 'token_exchange_failed');
    }
    const tokens = await tokenRes.json();

    const connectionsRes = await fetch('https://api.xero.com/connections', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!connectionsRes.ok) {
      console.error('Xero /connections failed:', connectionsRes.status, await connectionsRes.text());
      return redirectTo(returnOrigin, 'error', 'connections_lookup_failed');
    }
    const connections = await connectionsRes.json();
    // Single-tenant assumption — fine for one distillery's Xero org. If
    // the user connects a different org later, this just overwrites the
    // stored connection (upsert on tenant_id would instead add a second
    // row; that's a deliberate non-goal here, not a bug to fix blindly).
    const tenant = Array.isArray(connections) ? connections[0] : null;
    if (!tenant?.tenantId) return redirectTo(returnOrigin, 'error', 'no_xero_organisation');

    const expiresAt = new Date(Date.now() + (Number(tokens.expires_in) || 1800) * 1000).toISOString();
    const nowIso = new Date().toISOString();
    const { error: upsertError } = await supabase.from('xero_connection').upsert({
      tenant_id: tenant.tenantId,
      tenant_name: tenant.tenantName ?? null,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_token_expires_at: expiresAt,
      scopes: tokens.scope ?? null,
      connected_at: nowIso,
      last_refreshed_at: nowIso,
    }, { onConflict: 'tenant_id' });

    if (upsertError) {
      console.error('Failed to store Xero connection:', upsertError.message);
      return redirectTo(returnOrigin, 'error', 'storage_failed');
    }

    return redirectTo(returnOrigin, 'connected');
  } catch (err) {
    console.error('xero-oauth-callback error:', err);
    return redirectTo(returnOrigin, 'error', 'unexpected_error');
  }
});
