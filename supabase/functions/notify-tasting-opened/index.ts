// notify-tasting-opened — sends an email alert when shop staff click
// "Tasting Bottle Opened". Deliberately has no effect on stock: it's purely
// a notification, called AFTER the tasting_bottle_opened row is already
// committed (see src/pages/PalletDetail.jsx) — its own failure must never
// block that record from being saved, only surface as a toast warning.
//
// Reuses the same Resend secrets as send-order-email (RESEND_API_KEY,
// ORDER_TO_EMAIL, ORDER_FROM_EMAIL) rather than requiring a separate set —
// see that function's header for the unverified-sending-domain caveat.
//
// Deployment:
//   supabase functions deploy notify-tasting-opened

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ALERT_TO_EMAIL = Deno.env.get('TASTING_ALERT_TO_EMAIL') || Deno.env.get('ORDER_TO_EMAIL') || 'maggie@bluffdistillery.com';
const ALERT_FROM_EMAIL = Deno.env.get('ORDER_FROM_EMAIL') || 'onboarding@resend.dev';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function escapeHtml(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'RESEND_API_KEY is not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const palletCode = body?.palletCode || null;
    const location = body?.location || 'Shop';
    const openedBy = body?.openedBy || null;
    const notes = body?.notes || null;
    const whenText = new Date().toLocaleString('en-NZ', { dateStyle: 'medium', timeStyle: 'short' });

    const html = `
      <div style="font-family:sans-serif;color:#1f1a17;max-width:480px">
        <p style="display:inline-block;background:#c2600a;color:#fff;font-size:12px;font-weight:700;letter-spacing:0.04em;padding:4px 10px;border-radius:999px;text-transform:uppercase">Tasting Bottle Opened</p>
        <h2 style="margin:12px 0 4px">${escapeHtml(location)}</h2>
        <p style="margin:0 0 4px;color:#6b6862">${whenText}</p>
        ${palletCode ? `<p style="margin:0 0 4px;color:#6b6862">Pallet: ${escapeHtml(palletCode)}</p>` : ''}
        ${openedBy ? `<p style="margin:0 0 4px;color:#6b6862">Opened by: ${escapeHtml(openedBy)}</p>` : ''}
        ${notes ? `<p style="margin:12px 0 0"><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ''}
        <p style="margin:16px 0 0;color:#6b6862;font-size:12px">This is a notification only — no stock was adjusted.</p>
      </div>`;

    const text = [
      `TASTING BOTTLE OPENED — ${location}`,
      whenText,
      palletCode ? `Pallet: ${palletCode}` : null,
      openedBy ? `Opened by: ${openedBy}` : null,
      notes ? `Notes: ${notes}` : null,
      '',
      'This is a notification only — no stock was adjusted.',
    ].filter(Boolean).join('\n');

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: ALERT_FROM_EMAIL,
        to: [ALERT_TO_EMAIL],
        subject: `Tasting bottle opened — ${location}`,
        html,
        text,
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      console.error(`Resend API error (${resendRes.status}) from=${ALERT_FROM_EMAIL}:`, errBody);
      return new Response(JSON.stringify({ success: false, error: `Resend API error (${resendRes.status}): ${errBody}` }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
