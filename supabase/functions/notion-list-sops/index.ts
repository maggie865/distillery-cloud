// notion-list-sops — lists every page in a private Notion database (the SOP
// library) so Congener can show staff a browsable list without ever
// publishing the SOPs publicly. The Notion integration token is a secret
// held only here on the server; the browser never sees it or talks to
// Notion directly.
//
// Deployment:
//   supabase secrets set NOTION_API_KEY=secret_...
// The database itself must be shared with that integration in Notion
// (database page -> "..." menu -> Connections -> add the integration) or
// every query here will 404/403 even with a valid token.

const NOTION_API_KEY = Deno.env.get('NOTION_API_KEY');
const NOTION_VERSION = '2022-06-28';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Notion property values differ in shape per type — flatten each into a
// plain string/array/boolean so the frontend can render any property found
// without knowing the database's exact schema ahead of time.
function simplifyProperty(prop: any): unknown {
  switch (prop?.type) {
    case 'title':
      return (prop.title || []).map((t: any) => t.plain_text).join('');
    case 'rich_text':
      return (prop.rich_text || []).map((t: any) => t.plain_text).join('');
    case 'select':
      return prop.select?.name ?? null;
    case 'status':
      return prop.status?.name ?? null;
    case 'multi_select':
      return (prop.multi_select || []).map((o: any) => o.name);
    case 'checkbox':
      return !!prop.checkbox;
    case 'number':
      return prop.number ?? null;
    case 'date':
      return prop.date?.start ?? null;
    case 'people':
      return (prop.people || []).map((p: any) => p.name).filter(Boolean);
    case 'url':
      return prop.url ?? null;
    default:
      return null;
  }
}

function simplifyPage(page: any) {
  const properties: Record<string, unknown> = {};
  let title = 'Untitled';
  for (const [key, prop] of Object.entries(page.properties || {})) {
    const value = simplifyProperty(prop);
    if ((prop as any).type === 'title') {
      title = (value as string) || 'Untitled';
    } else {
      properties[key] = value;
    }
  }
  return {
    id: page.id,
    title,
    properties,
    last_edited_time: page.last_edited_time,
    url: page.url,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    if (!NOTION_API_KEY) {
      return jsonResponse({ success: false, error: 'NOTION_API_KEY is not configured' }, 500);
    }

    const { database_id } = await req.json().catch(() => ({}));
    if (!database_id) {
      return jsonResponse({ success: false, error: 'database_id is required' }, 400);
    }

    const headers = {
      Authorization: `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    };

    const pages: any[] = [];
    let cursor: string | undefined;
    do {
      const res = await fetch(`https://api.notion.com/v1/databases/${database_id}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ start_cursor: cursor, page_size: 100 }),
      });
      const body = await res.json();
      if (!res.ok) {
        // Notion's error payloads carry the real reason (unauthorized, database
        // not shared with the integration, invalid id) — surface it directly
        // rather than a generic 502, since first-time setup is the most
        // likely failure point.
        const hint = res.status === 404
          ? ' — check the database ID, and that the database has been shared with your Notion integration (database page -> … -> Connections)'
          : res.status === 401
          ? ' — check NOTION_API_KEY is correct'
          : '';
        return jsonResponse({ success: false, error: `Notion API: ${body.message || res.statusText}${hint}` }, res.status === 404 || res.status === 401 ? res.status : 502);
      }
      pages.push(...(body.results || []));
      cursor = body.has_more ? body.next_cursor : undefined;
    } while (cursor);

    const simplified = pages.map(simplifyPage).sort((a, b) => a.title.localeCompare(b.title));

    return jsonResponse({ success: true, sops: simplified });
  } catch (err) {
    console.error('notion-list-sops error:', err);
    return jsonResponse({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
