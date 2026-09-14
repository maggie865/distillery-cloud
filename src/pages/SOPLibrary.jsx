import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { db, supabase } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BookOpen, Search, ChevronRight, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import PageHeader from '@/components/shared/PageHeader';

// Must match the exact Notion property name for the single-select "area"
// tag SOPs are sorted into (confirmed with the user, not guessed).
const AREA_PROPERTY_KEY = 'Area';
const UNCATEGORIZED = 'Uncategorized';

// Any other select/status/multi_select property found on an SOP's Notion
// page is shown as a badge — deliberately not hardcoded to specific
// property names, since this reads whatever the Notion database's own
// schema happens to be. Area is excluded here since it's now the section
// heading instead.
function propertyBadges(properties = {}) {
  const badges = [];
  for (const [key, value] of Object.entries(properties)) {
    if (key === AREA_PROPERTY_KEY) continue;
    if (typeof value === 'string' && value) badges.push({ key, text: value });
    else if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      value.forEach((v) => badges.push({ key, text: v }));
    }
  }
  return badges.slice(0, 4);
}

function groupByArea(sops) {
  const groups = {};
  for (const sop of sops) {
    const area = sop.properties?.[AREA_PROPERTY_KEY] || UNCATEGORIZED;
    if (!groups[area]) groups[area] = [];
    groups[area].push(sop);
  }
  return Object.entries(groups).sort(([a], [b]) => {
    if (a === UNCATEGORIZED) return 1;
    if (b === UNCATEGORIZED) return -1;
    return a.localeCompare(b);
  });
}

function SOPRow({ sop, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-left hover:bg-muted/40 transition-colors"
    >
      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <BookOpen className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{sop.title}</p>
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {propertyBadges(sop.properties).map((b, i) => (
            <span key={i} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{b.text}</span>
          ))}
          {sop.last_edited_time && (
            <span className="text-xs text-muted-foreground">Updated {format(parseISO(sop.last_edited_time), 'd MMM yyyy')}</span>
          )}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}

export default function SOPLibrary() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => db.AppSettings.list('key', 5000),
  });
  const databaseId = appSettings.find((s) => s.key === 'notion_sops_database_id')?.value || '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['sopLibrary', databaseId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('notion-list-sops', { body: { database_id: databaseId } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to load SOPs');
      return data.sops;
    },
    enabled: !!databaseId,
  });

  const sops = data || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sops;
    return sops.filter((s) =>
      s.title.toLowerCase().includes(q) ||
      Object.values(s.properties || {}).some((v) => String(v).toLowerCase().includes(q))
    );
  }, [sops, search]);

  const grouped = useMemo(() => groupByArea(filtered), [filtered]);

  return (
    <div>
      <PageHeader title="SOPs" subtitle="Standard operating procedures, synced from Notion" />

      {!databaseId ? (
        <Card className="p-8 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 mx-auto text-amber-500" />
          <p className="text-sm font-medium">No SOP database connected yet</p>
          <p className="text-xs text-muted-foreground">An admin needs to connect your Notion SOP database under Settings → Compliance → SOP Library.</p>
        </Card>
      ) : (
        <>
          <div className="relative mb-4">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search SOPs…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 max-w-md" />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>
          ) : error ? (
            <Card className="p-8 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 mx-auto text-destructive" />
              <p className="text-sm font-medium text-destructive">Couldn't load SOPs</p>
              <p className="text-xs text-muted-foreground">{error.message}</p>
            </Card>
          ) : filtered.length === 0 ? (
            <Card className="p-8 text-center">
              <BookOpen className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">{sops.length === 0 ? 'No SOPs found in the connected Notion database.' : 'No SOPs match your search.'}</p>
            </Card>
          ) : (
            <div className="space-y-6">
              {grouped.map(([area, areaSops]) => (
                <div key={area}>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {area} <span className="font-normal normal-case">({areaSops.length})</span>
                  </h2>
                  <div className="space-y-2">
                    {areaSops.map((sop) => (
                      <SOPRow key={sop.id} sop={sop} onClick={() => navigate(`/sops/${sop.id}`)} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
