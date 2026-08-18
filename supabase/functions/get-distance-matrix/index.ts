// get-distance-matrix — real replacement for the dead base44.functions.invoke(
// 'getDistanceMatrix', ...) calls scattered across DispatchForm.jsx,
// DirectSalesForm.jsx, Receiving.jsx and DispatchHub.jsx. base44.functions
// doesn't exist at all on the Supabase-backed base44 client (see
// src/api/base44Client.js) — every "Auto-calculate from address" button in
// the app has been throwing and silently falling back to "Could not
// calculate distance — enter manually" since the migration off base44.
//
// Calls Google's Distance Matrix REST API server-side (the browser can't
// call this endpoint directly — it has no CORS headers for browser fetch;
// that's exactly why Google ships a separate JS-SDK class for client-side
// use, and why this needs to be a server call instead). Reuses the same
// Google Maps Platform project as VITE_GOOGLE_MAPS_API_KEY (already used
// client-side for maps/autocomplete), stored here as its own secret
// (GOOGLE_MAPS_API_KEY, no VITE_ prefix) so it isn't shipped to the browser
// bundle for this use. If Distance Matrix API isn't enabled for that key in
// Google Cloud Console, Google returns REQUEST_DENIED — surfaced here as a
// clear error rather than another silent failure.
//
// Deployment:
//   supabase functions deploy get-distance-matrix
//   supabase secrets set GOOGLE_MAPS_API_KEY=...   (same value as VITE_GOOGLE_MAPS_API_KEY)

const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (!GOOGLE_MAPS_API_KEY) {
      return jsonResponse({ success: false, error: 'GOOGLE_MAPS_API_KEY is not configured' }, 500);
    }

    const { origin, destination } = await req.json().catch(() => ({}));
    if (!origin || !destination) {
      return jsonResponse({ success: false, error: 'origin and destination are required' }, 400);
    }

    const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
    url.searchParams.set('origins', origin);
    url.searchParams.set('destinations', destination);
    url.searchParams.set('units', 'metric');
    url.searchParams.set('key', GOOGLE_MAPS_API_KEY);

    const res = await fetch(url.toString());
    if (!res.ok) {
      return jsonResponse({ success: false, error: `Google Distance Matrix API error (${res.status})` }, 502);
    }
    const body = await res.json();

    if (body.status !== 'OK') {
      // REQUEST_DENIED usually means Distance Matrix API isn't enabled for
      // this key (or billing isn't set up) in Google Cloud Console — most
      // likely first-time-setup issue, worth calling out specifically.
      const hint = body.status === 'REQUEST_DENIED' ? ' — check that the Distance Matrix API is enabled for this key in Google Cloud Console' : '';
      return jsonResponse({ success: false, error: `Google Distance Matrix API: ${body.status}${body.error_message ? ` (${body.error_message})` : ''}${hint}` }, 502);
    }

    const element = body.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') {
      return jsonResponse({ success: false, error: `Could not find a route between those addresses (${element?.status || 'no result'})` }, 404);
    }

    return jsonResponse({
      success: true,
      distance_km: parseFloat((element.distance.value / 1000).toFixed(1)),
      duration_text: element.duration.text,
    });
  } catch (err) {
    console.error('get-distance-matrix error:', err);
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
