// xero-oauth-start — step 1 of the Xero Authorization Code flow.
//
// Called from XeroConnectionPanel.jsx's "Connect to Xero" button via a
// normal authenticated supabase.functions.invoke() — this function's only
// job is to mint a CSRF `state` token and hand back the Xero consent-screen
// URL. The browser must then do a real top-level navigation
// (window.location.href = authorize_url), not a fetch — Xero's login/
// consent page can't be loaded inside an XHR response.
//
// Deployment:
//   supabase functions deploy xero-oauth-start
//   supabase secrets set XERO_CLIENT_ID=...
// (XERO_CLIENT_SECRET is only needed by xero-oauth-callback and
// xero-sync-invoices, not here — the authorize request never sends it.)
//
// The Redirect URI below is derived from SUPABASE_URL, which Supabase
// injects automatically into every Edge Function — it must exactly match
// what's registered as the app's Redirect URI at developer.xero.com.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const XERO_CLIENT_ID = Deno.env.get('XERO_CLIENT_ID');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const XERO_REDIRECT_URI = `${SUPABASE_URL}/functions/v1/xero-oauth-callback`;
// accounting.contacts.read is deliberately NOT requested — xero-sync-invoices
// only ever calls GET /Invoices, which already includes each invoice's
// Contact.Name inline; that separate scope is only needed for calling the
// standalone /Contacts endpoint, which nothing here does.
const XERO_SCOPES = 'accounting.transactions.read offline_access';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (!XERO_CLIENT_ID) {
      return new Response(JSON.stringify({ success: false, error: 'XERO_CLIENT_ID is not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // return_origin is the browser's own window.location.origin, sent by
    // the caller so xero-oauth-callback (which runs with no knowledge of
    // which domain — production or a preview deploy — the user started
    // from) knows where to redirect back to. See
    // 20260818010000_xero_oauth_state_return_origin.sql for why this isn't
    // just a hardcoded APP_URL secret instead.
    let returnOrigin: string | null = null;
    try {
      const body = await req.json();
      returnOrigin = typeof body?.return_origin === 'string' ? body.return_origin : null;
    } catch {
      // no/empty body — returnOrigin stays null; callers should always send it.
    }

    const state = crypto.randomUUID();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { error: insertError } = await supabase.from('xero_oauth_state').insert({ state, return_origin: returnOrigin });
    if (insertError) {
      return new Response(JSON.stringify({ success: false, error: insertError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const authorizeUrl = new URL('https://login.xero.com/identity/connect/authorize');
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('client_id', XERO_CLIENT_ID);
    authorizeUrl.searchParams.set('redirect_uri', XERO_REDIRECT_URI);
    authorizeUrl.searchParams.set('scope', XERO_SCOPES);
    authorizeUrl.searchParams.set('state', state);

    return new Response(JSON.stringify({ success: true, authorize_url: authorizeUrl.toString() }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
