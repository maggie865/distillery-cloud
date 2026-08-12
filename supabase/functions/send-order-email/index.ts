// send-order-email — first Edge Function in this repo.
//
// Called from QuickOrderModal.jsx (and OrderDetail.jsx's "Resend Email")
// only AFTER the customer_order + dispatch rows are already committed —
// this function's only job is the notification, and its failure must never
// look like success. It returns a non-2xx with { error } on any failure;
// the caller (never this function) is responsible for recording
// email_status/email_error on the order and offering a resend.
//
// Deployment (blocked in the session that wrote this — no Supabase CLI/MCP
// auth available there):
//   supabase functions deploy send-order-email
//   supabase secrets set RESEND_API_KEY=...
//
// Requires a Resend account + API key (https://resend.com) and a verified
// sending domain so ORDER_FROM_EMAIL below isn't rejected — set both as
// Edge Function secrets, never as a client-exposed VITE_ env var.

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ORDER_TO_EMAIL = 'info@bluffdistillery.com';
const ORDER_FROM_EMAIL = Deno.env.get('ORDER_FROM_EMAIL') || 'orders@bluffdistillery.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function escapeHtml(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function renderEmail(body: {
  orderNumber: string; customerName: string; orderDate: string; orderedBy?: string;
  lines: { productName: string; sku?: string; qty: number }[]; totalUnits: number; notes?: string;
}) {
  const rows = body.lines.map((l) =>
    `<tr><td style="padding:4px 12px 4px 0">${escapeHtml(l.productName)}${l.sku ? ` (${escapeHtml(l.sku)})` : ''}</td><td style="padding:4px 0;text-align:right;font-weight:600">${l.qty}</td></tr>`
  ).join('');

  const html = `
    <div style="font-family:sans-serif;color:#1f1a17;max-width:480px">
      <p style="display:inline-block;background:#c2600a;color:#fff;font-size:12px;font-weight:700;letter-spacing:0.04em;padding:4px 10px;border-radius:999px;text-transform:uppercase">New Customer Order</p>
      <h2 style="margin:12px 0 4px">${escapeHtml(body.orderNumber)}</h2>
      <p style="margin:0 0 16px;color:#6b6862">${escapeHtml(body.customerName)} &middot; ${escapeHtml(body.orderDate)}${body.orderedBy ? ` &middot; Ordered by ${escapeHtml(body.orderedBy)}` : ''}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px">${rows}
        <tr style="border-top:1px solid #e5e0da"><td style="padding:8px 12px 0 0;font-weight:700">Total Units</td><td style="padding:8px 0 0;text-align:right;font-weight:700">${body.totalUnits}</td></tr>
      </table>
      ${body.notes ? `<p style="margin:0;color:#6b6862"><strong>Notes:</strong> ${escapeHtml(body.notes)}</p>` : ''}
    </div>`;

  const text = [
    `NEW CUSTOMER ORDER — ${body.orderNumber}`,
    `Customer: ${body.customerName}`,
    `Order Date: ${body.orderDate}`,
    body.orderedBy ? `Ordered By: ${body.orderedBy}` : null,
    '',
    ...body.lines.map((l) => `${l.productName}${l.sku ? ` (${l.sku})` : ''} — ${l.qty}`),
    '',
    `Total Units: ${body.totalUnits}`,
    body.notes ? `Notes: ${body.notes}` : null,
  ].filter(Boolean).join('\n');

  return { html, text };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'RESEND_API_KEY is not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json();
    if (!body?.orderNumber || !body?.customerName || !Array.isArray(body?.lines)) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required order fields' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { html, text } = renderEmail(body);

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: ORDER_FROM_EMAIL,
        to: [ORDER_TO_EMAIL],
        subject: `NEW CUSTOMER ORDER — ${body.orderNumber} — ${body.customerName}`,
        html,
        text,
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      return new Response(JSON.stringify({ success: false, error: `Resend API error (${resendRes.status}): ${errBody}` }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
