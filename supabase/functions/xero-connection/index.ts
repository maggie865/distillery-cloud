// xero-connection — status check + disconnect for the Xero integration.
//
// xero_connection holds live OAuth tokens and is locked down to
// service_role only (see 20260818000000_xero_integration.sql) — the
// frontend can't query it directly. This is the one place that reads it,
// and it only ever returns non-secret fields.
//
// Called via a normal authenticated call:
//   supabase.functions.invoke('xero-connection', { body: { action: 'status' | 'disconnect' } })

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { action } = await req.json();
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action === 'disconnect') {
      const { error } = await supabase.from('xero_connection').delete().not('id', 'is', null);
      if (error) return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ success: true, connected: false }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (action === 'status') {
      const { data, error } = await supabase
        .from('xero_connection')
        .select('tenant_name, connected_at, last_synced_at')
        .order('connected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({
        success: true,
        connected: !!data,
        tenant_name: data?.tenant_name ?? null,
        connected_at: data?.connected_at ?? null,
        last_synced_at: data?.last_synced_at ?? null,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, error: `Unknown action: ${action}` }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
