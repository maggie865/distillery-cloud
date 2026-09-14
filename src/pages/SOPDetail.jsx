import { Fragment } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle, Paperclip } from 'lucide-react';

// Renders one Notion rich_text run with its own bold/italic/strikethrough/
// code/link formatting — Notion applies these per-character-run, not per-block.
function RichText({ text }) {
  if (!text || text.length === 0) return null;
  return text.map((t, i) => {
    let node = t.content;
    if (t.code) node = <code key="c" className="bg-muted px-1 py-0.5 rounded text-[0.9em] font-mono">{node}</code>;
    if (t.bold) node = <strong key="b">{node}</strong>;
    if (t.italic) node = <em key="i">{node}</em>;
    if (t.strikethrough) node = <s key="s">{node}</s>;
    if (t.href) node = <a key="a" href={t.href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">{node}</a>;
    return <Fragment key={i}>{node}</Fragment>;
  });
}

// Notion returns each list item as its own top-level block rather than
// pre-grouped into a <ul>/<ol> — group consecutive same-type items so they
// render as one real list instead of one list per item.
function groupBlocks(blocks) {
  const groups = [];
  for (const block of blocks) {
    const last = groups[groups.length - 1];
    if ((block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') && last?.type === block.type) {
      last.items.push(block);
    } else if (block.type === 'bulleted_list_item' || block.type === 'numbered_list_item') {
      groups.push({ type: block.type, items: [block] });
    } else if (block.type === 'table_row') {
      // handled as a child of 'table', shouldn't appear at this level
      continue;
    } else {
      groups.push({ type: 'single', block });
    }
  }
  return groups;
}

function Blocks({ blocks }) {
  if (!blocks || blocks.length === 0) return null;
  return (
    <>
      {groupBlocks(blocks).map((g, i) => {
        if (g.type === 'bulleted_list_item') {
          return <ul key={i} className="list-disc list-outside pl-5 space-y-1 my-2">{g.items.map((b) => <li key={b.id}><RichText text={b.text} />{b.children && <Blocks blocks={b.children} />}</li>)}</ul>;
        }
        if (g.type === 'numbered_list_item') {
          return <ol key={i} className="list-decimal list-outside pl-5 space-y-1 my-2">{g.items.map((b) => <li key={b.id}><RichText text={b.text} />{b.children && <Blocks blocks={b.children} />}</li>)}</ol>;
        }
        return <Block key={g.block.id} block={g.block} />;
      })}
    </>
  );
}

function Block({ block }) {
  const { type } = block;

  switch (type) {
    case 'heading_1':
      return <h2 className="text-xl font-bold font-display mt-6 mb-2 first:mt-0"><RichText text={block.text} /></h2>;
    case 'heading_2':
      return <h3 className="text-lg font-semibold mt-5 mb-2 first:mt-0"><RichText text={block.text} /></h3>;
    case 'heading_3':
      return <h4 className="text-base font-semibold mt-4 mb-1.5 first:mt-0"><RichText text={block.text} /></h4>;
    case 'paragraph':
      if (!block.text || block.text.every((t) => !t.content.trim())) return <div className="h-2" />;
      return <p className="text-sm leading-relaxed mb-2"><RichText text={block.text} /></p>;
    case 'to_do':
      return (
        <label className="flex items-start gap-2 text-sm mb-1.5">
          <input type="checkbox" checked={!!block.checked} readOnly className="mt-1 shrink-0" />
          <span className={block.checked ? 'line-through text-muted-foreground' : ''}><RichText text={block.text} /></span>
        </label>
      );
    case 'toggle':
      return (
        <details className="mb-2 rounded-lg border border-border p-3">
          <summary className="text-sm font-medium cursor-pointer"><RichText text={block.text} /></summary>
          <div className="mt-2 pl-2"><Blocks blocks={block.children} /></div>
        </details>
      );
    case 'quote':
      return <blockquote className="border-l-4 border-primary/30 pl-3 italic text-sm text-muted-foreground my-2"><RichText text={block.text} /></blockquote>;
    case 'callout':
      return (
        <div className="rounded-lg bg-muted/60 border border-border p-3 flex gap-2 text-sm my-2">
          {block.icon && <span className="shrink-0">{block.icon}</span>}
          <span><RichText text={block.text} /></span>
        </div>
      );
    case 'divider':
      return <hr className="border-border my-4" />;
    case 'code':
      return (
        <pre className="bg-muted rounded-lg p-3 overflow-x-auto text-xs font-mono my-2">
          <code>{(block.text || []).map((t) => t.content).join('')}</code>
        </pre>
      );
    case 'image':
      return block.url ? <img src={block.url} alt="" className="rounded-lg my-2 max-w-full" /> : null;
    case 'table':
      return (
        <div className="overflow-x-auto my-2">
          <table className="w-full text-sm border-collapse">
            <tbody>
              {(block.children || []).map((row, ri) => (
                <tr key={row.id} className={block.hasColumnHeader && ri === 0 ? 'font-semibold bg-muted/50' : ''}>
                  {(row.cells || []).map((cell, ci) => (
                    <td key={ci} className="border border-border px-2 py-1.5 align-top"><RichText text={cell} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'bookmark':
    case 'embed':
    case 'file':
    case 'pdf':
    case 'video':
      return block.url ? (
        <a href={block.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-primary underline underline-offset-2 my-2">
          <Paperclip className="w-3.5 h-3.5" /> Open attachment
        </a>
      ) : null;
    default:
      if (block.text && block.text.length > 0) return <p className="text-sm leading-relaxed mb-2"><RichText text={block.text} /></p>;
      return null;
  }
}

export default function SOPDetail() {
  const { pageId } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['sopPage', pageId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('notion-get-page', { body: { page_id: pageId } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to load SOP');
      return data;
    },
  });

  return (
    <div className="max-w-2xl mx-auto">
      <Button variant="ghost" size="sm" className="gap-1.5 mb-3 -ml-2" onClick={() => navigate('/sops')}>
        <ArrowLeft className="w-4 h-4" /> Back to SOPs
      </Button>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>
      ) : error ? (
        <Card className="p-8 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 mx-auto text-destructive" />
          <p className="text-sm font-medium text-destructive">Couldn't load this SOP</p>
          <p className="text-xs text-muted-foreground">{error.message}</p>
        </Card>
      ) : (
        <Card className="p-6">
          <Blocks blocks={data.blocks} />
          {data.truncated && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-4">
              This page is long — some content may have been cut off. View it in Notion for the complete version.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
