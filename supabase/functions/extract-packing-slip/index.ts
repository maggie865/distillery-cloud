// extract-packing-slip — reads an uploaded packing slip (image or PDF) and
// pulls out supplier/date/items so Receiving's "Attach Packing Slip" flow can
// pre-fill the form. The old client-side call
// (base44.integrations.Core.ExtractDataFromUploadedFile) never worked at all
// — base44.integrations doesn't exist on the Supabase-backed base44 client
// (see src/api/base44Client.js) — so this is a first real implementation,
// not a fix to something that used to work.
//
// Calls the Claude API server-side (needs a real API key, and the browser
// can't call api.anthropic.com directly due to CORS). Uses tool-choice to
// force a single structured tool call back, so the response is always valid
// JSON matching the schema rather than prose that needs parsing.
//
// Deployment:
//   supabase functions deploy extract-packing-slip
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const ANTHROPIC_MODEL = 'claude-sonnet-5';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const EXTRACT_TOOL = {
  name: 'extract_packing_slip',
  description: 'Record the structured details of a supplier packing slip / delivery note.',
  input_schema: {
    type: 'object',
    properties: {
      supplier: { type: 'string', description: 'Supplier or vendor name printed on the document' },
      date_received: { type: 'string', description: 'Delivery/document date in YYYY-MM-DD format' },
      packing_slip_number: { type: 'string', description: 'Packing slip, delivery note, or invoice number' },
      notes: { type: 'string', description: 'Any other relevant notes from the document' },
      items: {
        type: 'array',
        description: 'Every distinct material or product line listed on the packing slip',
        items: {
          type: 'object',
          properties: {
            material_name: { type: 'string', description: 'Name of the material or product received. If a "known item names" list was provided and one of those names clearly refers to the same product (even if the slip uses different wording), use that exact known name verbatim. Otherwise use the name as printed on the document.' },
            material_type: { type: 'string', description: 'One of: ethanol, botanical, grain, sugar, water, flavoring, packaging, other' },
            quantity: { type: 'number', description: 'Quantity received' },
            unit: { type: 'string', description: 'One of: litres, kg, units' },
            abv_percent: { type: 'number', description: 'ABV percentage if applicable' },
            cost_per_unit: { type: 'number', description: 'Cost per unit if listed' },
            batch_number: { type: 'string', description: 'Lot or batch number for this line, if listed' },
          },
          required: ['material_name'],
        },
      },
    },
    required: ['items'],
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (!ANTHROPIC_API_KEY) {
      return jsonResponse({ success: false, error: 'ANTHROPIC_API_KEY is not configured' }, 500);
    }

    const { file_url, known_items } = await req.json().catch(() => ({}));
    if (!file_url) {
      return jsonResponse({ success: false, error: 'file_url is required' }, 400);
    }

    const fileRes = await fetch(file_url);
    if (!fileRes.ok) {
      return jsonResponse({ success: false, error: `Could not fetch the uploaded file (${fileRes.status})` }, 502);
    }
    const contentType = fileRes.headers.get('content-type') || 'application/octet-stream';
    const bytes = new Uint8Array(await fileRes.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);

    const isPdf = contentType.includes('pdf') || file_url.toLowerCase().includes('.pdf');
    const docBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
      : { type: 'image', source: { type: 'base64', media_type: contentType.startsWith('image/') ? contentType : 'image/jpeg', data: base64 } };

    const knownItemsList = Array.isArray(known_items) ? known_items.filter((s: unknown) => typeof s === 'string' && s.trim()) : [];
    const knownItemsText = knownItemsList.length > 0
      ? `\n\nKnown item names already tracked in stock (match to these when a line clearly refers to the same product, even under different supplier wording — use the exact string from this list, don't paraphrase it):\n${knownItemsList.map((s: string) => `- ${s}`).join('\n')}`
      : '';

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'tool', name: 'extract_packing_slip' },
        messages: [{
          role: 'user',
          content: [
            docBlock,
            { type: 'text', text: `Extract the details of this packing slip / delivery note using the extract_packing_slip tool.${knownItemsText}` },
          ],
        }],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.text();
      console.error('Anthropic API error:', anthropicRes.status, errBody);
      return jsonResponse({ success: false, error: `Document scan failed (${anthropicRes.status})` }, 502);
    }

    const result = await anthropicRes.json();
    const toolUse = result.content?.find((b: { type: string }) => b.type === 'tool_use');
    if (!toolUse) {
      return jsonResponse({ success: false, error: 'Could not extract structured data from the document' }, 502);
    }

    return jsonResponse({ success: true, data: toolUse.input });
  } catch (err) {
    console.error('extract-packing-slip error:', err);
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
