// xero-sync-invoices — pulls authorised Xero sales invoices in as draft
// ('pending') dispatch rows for the sales team to review and approve.
//
// Triggered on demand from XeroConnectionPanel.jsx's "Sync Now" button via
// a normal authenticated supabase.functions.invoke('xero-sync-invoices').
// There is no automatic polling in this first version (no pg_cron/pg_net
// set up anywhere in this project yet) — manual sync only, deliberately,
// until that's proven out.
//
// Idempotent: every dispatch row created here carries xero_line_item_id
// (unique) and is written via upsert(..., { onConflict: 'xero_line_item_id',
// ignoreDuplicates: true }), so re-running this never duplicates a row or
// clobbers one that's since been edited/approved.
//
// Deployment:
//   supabase functions deploy xero-sync-invoices
// Requires XERO_CLIENT_ID/XERO_CLIENT_SECRET (same secrets as the OAuth
// functions) and a row already in xero_connection (i.e. someone has
// connected via Settings first).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const XERO_CLIENT_ID = Deno.env.get('XERO_CLIENT_ID');
const XERO_CLIENT_SECRET = Deno.env.get('XERO_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

type XeroLineItem = {
  LineItemID: string;
  ItemCode?: string;
  Description?: string;
  Quantity: number;
};
type XeroInvoice = {
  InvoiceID: string;
  InvoiceNumber?: string;
  DateString?: string;
  Contact?: { Name?: string };
  LineItems?: XeroLineItem[];
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (!XERO_CLIENT_ID || !XERO_CLIENT_SECRET) {
      return jsonResponse({ success: false, error: 'Xero is not configured (XERO_CLIENT_ID/XERO_CLIENT_SECRET missing)' }, 500);
    }

    // Optional explicit backfill window from XeroConnectionPanel.jsx's
    // "Sync from date" field — a one-off "pull everything from this date
    // forward" request, distinct from the normal incremental sync below.
    const body = await req.json().catch(() => ({}));
    const sinceDateParam = typeof body?.since_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.since_date) ? body.since_date : null;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: connection, error: connError } = await supabase
      .from('xero_connection')
      .select('*')
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (connError) return jsonResponse({ success: false, error: connError.message }, 500);
    if (!connection) return jsonResponse({ success: false, error: 'Not connected to Xero' }, 400);

    // Refresh if the access token is at or near expiry. Xero rotates the
    // refresh token on every use and immediately invalidates the previous
    // one — the new refresh_token from this response MUST be persisted, or
    // the next sync fails permanently.
    let accessToken = connection.access_token as string;
    const expiresAt = new Date(connection.access_token_expires_at as string).getTime();
    if (expiresAt - Date.now() < 2 * 60 * 1000) {
      const refreshRes = await fetch('https://identity.xero.com/connect/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: connection.refresh_token as string }),
      });
      if (!refreshRes.ok) {
        console.error('Xero token refresh failed:', refreshRes.status, await refreshRes.text());
        return jsonResponse({ success: false, error: 'Xero token refresh failed — reconnect in Settings' }, 401);
      }
      const refreshed = await refreshRes.json();
      accessToken = refreshed.access_token;
      const newExpiresAt = new Date(Date.now() + (Number(refreshed.expires_in) || 1800) * 1000).toISOString();
      const nowIso = new Date().toISOString();
      const { error: updateError } = await supabase
        .from('xero_connection')
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token, // rotated — must overwrite, never keep the old one
          access_token_expires_at: newExpiresAt,
          last_refreshed_at: nowIso,
        })
        .eq('id', connection.id);
      if (updateError) return jsonResponse({ success: false, error: `Failed to save refreshed token: ${updateError.message}` }, 500);
    }

    // Load active mappings once; match by ItemCode first, then by
    // lower-cased Description as a fallback for line items with no code.
    const { data: mappings, error: mappingError } = await supabase
      .from('xero_item_mapping')
      .select('xero_item_code, xero_description, bottles_per_line_unit, duty_free, sample_dispatch, product:product_id(id, name, bottle_size_ml)')
      .eq('active', true);
    if (mappingError) return jsonResponse({ success: false, error: mappingError.message }, 500);

    const byCode = new Map<string, typeof mappings[number]>();
    const byDescription = new Map<string, typeof mappings[number]>();
    for (const m of mappings ?? []) {
      if (m.xero_item_code) byCode.set(m.xero_item_code, m);
      else if (m.xero_description) byDescription.set(m.xero_description.toLowerCase(), m);
    }

    const invoiceHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Xero-tenant-id': connection.tenant_id as string,
      Accept: 'application/json',
    };

    // Status=="AUTHORISED" alone misses anything already paid — Xero moves a
    // paid invoice to its own PAID status rather than leaving it AUTHORISED,
    // so a quick-settling channel (Shopify, cellar door) would silently
    // never match. Either status means "finalized, not draft/voided" — the
    // only thing that matters for turning it into a dispatch to approve.
    let whereClause = 'Type=="ACCREC" AND (Status=="AUTHORISED" OR Status=="PAID")';
    if (sinceDateParam) {
      // Explicit backfill window — filter by the invoice's own Date, not
      // modification time, and skip If-Modified-Since entirely: the user is
      // asking for a specific historical range, not "what changed since I
      // last checked". Safe to re-run — the dispatch upsert below is
      // idempotent on xero_line_item_id either way.
      const [y, m, d] = sinceDateParam.split('-').map(Number);
      whereClause += ` AND Date >= DateTime(${y},${m},${d})`;
    } else if (connection.last_synced_at) {
      invoiceHeaders['If-Modified-Since'] = new Date(connection.last_synced_at as string).toUTCString();
    } else {
      // First-ever sync with no explicit date chosen — bound it to the last
      // 30 days rather than pulling the org's entire invoice history into
      // Dispatch Hub as pending rows in one go.
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      whereClause += ` AND Date >= DateTime(${thirtyDaysAgo.getUTCFullYear()},${thirtyDaysAgo.getUTCMonth() + 1},${thirtyDaysAgo.getUTCDate()})`;
    }

    const invoicesUrl = new URL('https://api.xero.com/api.xro/2.0/Invoices');
    invoicesUrl.searchParams.set('where', whereClause);
    // Without this, Xero's list endpoint returns "summarized" invoices with
    // LineItems stripped out entirely (confirmed: invoices_processed came
    // back >0 but every invoice's LineItems array was empty) — full detail
    // has to be requested explicitly.
    invoicesUrl.searchParams.set('SummaryOnly', 'false');

    const invoicesRes = await fetch(invoicesUrl.toString(), { headers: invoiceHeaders });
    // Xero returns 304 Not Modified (no body) when nothing changed since
    // If-Modified-Since — that's success, not an error.
    if (invoicesRes.status === 304) {
      await supabase.from('xero_connection').update({ last_synced_at: new Date().toISOString() }).eq('id', connection.id);
      return jsonResponse({ success: true, invoices_processed: 0, lines_created: 0, lines_unmatched: 0, debug_where: whereClause, debug_if_modified_since: invoiceHeaders['If-Modified-Since'] ?? null, debug_xero_status: 304 });
    }
    if (!invoicesRes.ok) {
      const errText = await invoicesRes.text();
      console.error('Xero Invoices API error:', invoicesRes.status, errText);
      return jsonResponse({ success: false, error: `Xero Invoices API error (${invoicesRes.status}): ${errText.slice(0, 300)}`, debug_where: whereClause }, 502);
    }
    const invoicesBody = await invoicesRes.json();
    const invoices: XeroInvoice[] = invoicesBody?.Invoices ?? [];

    const rows: Record<string, unknown>[] = [];
    let unmatchedCount = 0;

    for (const invoice of invoices) {
      const dispatchDate = invoice.DateString ? invoice.DateString.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const customerName = invoice.Contact?.Name || 'Unknown Xero Contact';
      // The Xero contact named "Shopify" represents cellar-door/online POS
      // sales rung through Shopify, not an actual wholesale customer — the
      // dispatch table already has a distinct 'shopify' sales_channel
      // (rendered as its own badge, excluded from wholesale filtering) for
      // exactly this; Xero doesn't tell us which of cellar door vs. online
      // any individual sale came from, so both land under the one channel.
      const salesChannel = customerName.trim().toLowerCase() === 'shopify' ? 'shopify' : null;

      for (const line of invoice.LineItems ?? []) {
        if (!line.LineItemID) continue; // can't dedupe without it — skip rather than risk a duplicate on re-sync

        const mapping = (line.ItemCode && byCode.get(line.ItemCode))
          || (line.Description && byDescription.get(line.Description.toLowerCase()))
          || null;

        const qty = Number(line.Quantity) || 0;
        const base = {
          dispatch_date: dispatchDate,
          customer_name: customerName,
          sales_channel: salesChannel,
          order_reference: invoice.InvoiceNumber || null,
          xero_invoice_id: invoice.InvoiceID,
          xero_line_item_id: line.LineItemID,
          xero_item_code: line.ItemCode || null,
          status: 'pending',
          dispatched_from: 'Bluff',
          total_lals: 0,
          transport_method: 'road',
        };

        if (mapping?.product) {
          rows.push({
            ...base,
            product_name: mapping.product.name,
            bottle_size_ml: mapping.product.bottle_size_ml,
            quantity_bottles: qty * (mapping.bottles_per_line_unit || 1),
            duty_free: mapping.duty_free === true,
            sample_dispatch: mapping.sample_dispatch === true,
          });
        } else {
          unmatchedCount += 1;
          rows.push({
            ...base,
            product_name: line.Description || 'Unmatched Xero item',
            bottle_size_ml: null,
            quantity_bottles: qty,
            duty_free: false,
            sample_dispatch: false,
            notes: 'Unmatched Xero item — configure a mapping in Settings › Sales › Xero Product Mapping, or fix this dispatch manually before approving.',
          });
        }
      }
    }

    let linesCreated = 0;
    if (rows.length > 0) {
      const { data: upserted, error: upsertError } = await supabase
        .from('dispatch')
        .upsert(rows, { onConflict: 'xero_line_item_id', ignoreDuplicates: true })
        .select('id');
      if (upsertError) return jsonResponse({ success: false, error: `Failed to save dispatch rows: ${upsertError.message}` }, 500);
      linesCreated = upserted?.length ?? 0;
    }

    await supabase.from('xero_connection').update({ last_synced_at: new Date().toISOString() }).eq('id', connection.id);

    return jsonResponse({
      success: true,
      invoices_processed: invoices.length,
      lines_created: linesCreated,
      lines_unmatched: unmatchedCount,
      debug_where: whereClause,
      debug_if_modified_since: invoiceHeaders['If-Modified-Since'] ?? null,
    });
  } catch (err) {
    console.error('xero-sync-invoices error:', err);
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
