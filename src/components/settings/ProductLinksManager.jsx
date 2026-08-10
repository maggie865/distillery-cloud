import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Link2, Plus, X, Package } from 'lucide-react';
import { toast } from 'sonner';

export default function ProductLinksManager() {
  const qc = useQueryClient();
  const [rawMaterialId, setRawMaterialId] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');
  const [aliasName, setAliasName] = useState('');

  const { data: rawMaterials = [], isLoading: loadingMaterials } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => base44.entities.RawMaterial.list('name', 5000),
  });

  const { data: aliases = [], isLoading: loadingAliases } = useQuery({
    queryKey: ['productAliases'],
    queryFn: () => base44.entities.ProductAlias.list('alias_name', 5000),
  });

  const rawMaterialById = useMemo(() => new Map(rawMaterials.map(rm => [rm.id, rm])), [rawMaterials]);

  const grouped = useMemo(() => {
    const g = new Map();
    for (const a of aliases) {
      const rm = rawMaterialById.get(a.raw_material_id);
      if (!rm) continue;
      if (!g.has(rm.id)) g.set(rm.id, { rawMaterial: rm, aliases: [] });
      g.get(rm.id).aliases.push(a);
    }
    return [...g.values()].sort((a, b) => a.rawMaterial.name.localeCompare(b.rawMaterial.name));
  }, [aliases, rawMaterialById]);

  const filteredMaterials = materialSearch
    ? rawMaterials.filter(rm => rm.name.toLowerCase().includes(materialSearch.toLowerCase()))
    : rawMaterials;

  const createMutation = useMutation({
    mutationFn: () => base44.entities.ProductAlias.create({ alias_name: aliasName.trim(), raw_material_id: rawMaterialId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productAliases'] });
      setAliasName('');
      toast.success('Alias linked');
    },
    onError: (err) => toast.error('Failed to link alias: ' + (err?.message || 'It may already be in use')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ProductAlias.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productAliases'] });
      toast.success('Alias removed');
    },
  });

  const handleAdd = (e) => {
    e.preventDefault();
    if (!rawMaterialId || !aliasName.trim()) {
      toast.error('Pick a stock item and enter the alias name');
      return;
    }
    createMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link2 className="w-4 h-4" /> Product Links</CardTitle>
          <CardDescription>
            Some suppliers print a different name on their packing slip than what you track in stock
            (e.g. "Neutral Grain Spirit 96" vs "Wheat ENA 96%"). Link that wording here once, and the
            Receiving form will auto-match it to the right stock item from then on.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <Label className="text-xs font-semibold">Stock item</Label>
              <Input
                placeholder="Search stock items…"
                value={materialSearch}
                onChange={(e) => setMaterialSearch(e.target.value)}
                className="mt-1 mb-1.5 text-sm"
              />
              <select
                value={rawMaterialId}
                onChange={(e) => setRawMaterialId(e.target.value)}
                className="w-full border border-border rounded-md px-2 py-2 text-sm bg-background"
              >
                <option value="">{loadingMaterials ? 'Loading…' : 'Select a stock item'}</option>
                {filteredMaterials.map(rm => (
                  <option key={rm.id} value={rm.id}>{rm.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs font-semibold">Alias (as printed on packing slip)</Label>
              <Input
                value={aliasName}
                onChange={(e) => setAliasName(e.target.value)}
                placeholder="e.g. Neutral Grain Spirit 96"
                className="mt-1"
              />
            </div>
            <Button type="submit" className="gap-2" disabled={createMutation.isPending}>
              <Plus className="w-4 h-4" /> Link
            </Button>
          </form>
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold mb-3">Linked items</h3>
        {loadingAliases ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : grouped.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No product links yet — add one above when a supplier's packing slip uses different wording than your stock item.
          </Card>
        ) : (
          <div className="grid gap-3">
            {grouped.map(({ rawMaterial, aliases: rmAliases }) => (
              <Card key={rawMaterial.id}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                    <p className="font-semibold text-sm">{rawMaterial.name}</p>
                    <Badge variant="secondary" className="text-xs capitalize">{rawMaterial.type}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {rmAliases.map(a => (
                      <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 pl-3 pr-1.5 py-1 text-xs">
                        {a.alias_name}
                        <button
                          type="button"
                          onClick={() => deleteMutation.mutate(a.id)}
                          className="rounded-full p-0.5 hover:bg-destructive/10 hover:text-destructive transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
