// notion-get-page — fetches one Notion page's block content (recursively)
// and flattens it into a simple {type, text, children} tree the Congener
// frontend can render, so the SOP Library never needs to talk to Notion
// directly or hold the integration token client-side.
//
// Deployment:
//   supabase secrets set NOTION_API_KEY=secret_...
// (same secret as notion-list-sops)

const NOTION_API_KEY = Deno.env.get('NOTION_API_KEY');
const NOTION_VERSION = '2022-06-28';

// Safety valves — an SOP page is a handful of headings/lists/paragraphs, not
// a deeply nested document. These caps stop a mis-structured or huge Notion
// page (e.g. an accidentally-linked whole workspace) from turning one
// request into thousands of API calls.
const MAX_DEPTH = 6;
const MAX_BLOCKS = 500;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function simplifyRichText(richText: any[] = []) {
  return richText.map((t) => ({
    content: t.plain_text || '',
    href: t.href || t.text?.link?.url || null,
    bold: !!t.annotations?.bold,
    italic: !!t.annotations?.italic,
    strikethrough: !!t.annotations?.strikethrough,
    code: !!t.annotations?.code,
  }));
}

// Shared state threaded through the recursion so the block/fetch caps apply
// across the whole page, not per-branch.
type Ctx = { headers: Record<string, string>; blockCount: number; truncated: boolean };

async function fetchChildren(blockId: string, ctx: Ctx): Promise<any[]> {
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    if (ctx.blockCount >= MAX_BLOCKS) { ctx.truncated = true; break; }
    const url = new URL(`https://api.notion.com/v1/blocks/${blockId}/children`);
    url.searchParams.set('page_size', '100');
    if (cursor) url.searchParams.set('start_cursor', cursor);
    const res = await fetch(url.toString(), { headers: ctx.headers });
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || res.statusText);
    blocks.push(...(body.results || []));
    cursor = body.has_more ? body.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

async function simplifyBlock(block: any, ctx: Ctx, depth: number): Promise<any> {
  ctx.blockCount += 1;
  const type = block.type;
  const data = block[type] || {};

  const simplified: Record<string, unknown> = { id: block.id, type };

  if (data.rich_text) simplified.text = simplifyRichText(data.rich_text);
  if (type === 'to_do') simplified.checked = !!data.checked;
  if (type === 'code') simplified.language = data.language || 'plain text';
  if (type === 'callout') simplified.icon = data.icon?.emoji || null;
  if (type === 'image' || type === 'file' || type === 'video' || type === 'pdf') {
    simplified.url = data.type === 'external' ? data.external?.url : data.file?.url;
  }
  if (type === 'bookmark' || type === 'embed') simplified.url = data.url;
  if (type === 'table') {
    simplified.tableWidth = data.table_width;
    simplified.hasColumnHeader = !!data.has_column_header;
  }
  if (type === 'table_row') simplified.cells = (data.cells || []).map(simplifyRichText);

  if (block.has_children && depth < MAX_DEPTH && ctx.blockCount < MAX_BLOCKS) {
    const children = await fetchChildren(block.id, ctx);
    simplified.children = await Promise.all(children.map((c) => simplifyBlock(c, ctx, depth + 1)));
  }

  return simplified;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (!NOTION_API_KEY) {
      return jsonResponse({ success: false, error: 'NOTION_API_KEY is not configured' }, 500);
    }

    const { page_id } = await req.json().catch(() => ({}));
    if (!page_id) {
      return jsonResponse({ success: false, error: 'page_id is required' }, 400);
    }

    const headers = {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    };

    const ctx: Ctx = { headers, blockCount: 0, truncated: false };
    const topLevel = await fetchChildren(page_id, ctx);
    const blocks = await Promise.all(topLevel.map((b) => simplifyBlock(b, ctx, 0)));

    return jsonResponse({ success: true, blocks, truncated: ctx.truncated });
  } catch (err) {
    console.error('notion-get-page error:', err);
    const message = err instanceof Error ? err.message : String(err);
    const hint = /not found|404/i.test(message)
      ? ' — check the page still exists and its database is shared with your Notion integration'
      : /unauthorized|401/i.test(message)
      ? ' — check NOTION_API_KEY is correct'
      : '';
    return jsonResponse({ success: false, error: `${message}${hint}` }, 500);
  }
});
