import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, ScanLine, Package, Search, Truck } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import CreatePalletDialog from '@/components/pallets/CreatePalletDialog';
import ScanPalletDialog from '@/components/pallets/ScanPalletDialog';
import { groupPalletItems, setActiveDispatchPallet } from '@/lib/palletStock';

export default function Pallets() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [scanning, setScanning] = useState(false);

  const toggleActiveDispatch = useMutation({
    mutationFn: ({ palletId, active }) => setActiveDispatchPallet(palletId, active),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pallets'] }),
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const { data: pallets = [], isLoading } = useQuery({
    queryKey: ['pallets'],
    queryFn: () => base44.entities.Pallet.list('-created_at', 5000),
  });

  const { data: palletItems = [] } = useQuery({
    queryKey: ['palletItemsAll'],
    queryFn: () => base44.entities.PalletItem.list('-created_at', 5000),
  });

  const { data: finishedGoods = [] } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => base44.entities.FinishedGood.list('-created_at', 5000),
  });

  const itemsByPallet = useMemo(() => {
    const map = {};
    for (const it of palletItems) {
      if (!map[it.pallet_id]) map[it.pallet_id] = [];
      map[it.pallet_id].push(it);
    }
    return map;
  }, [palletItems]);

  const filtered = useMemo(() => {
    let list = pallets.filter(p => showArchived ? p.status === 'archived' : p.status !== 'archived');
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => {
        if ((p.pallet_code || '').toLowerCase().includes(q)) return true;
        const items = itemsByPallet[p.id] || [];
        return items.some(it => (it.product_name || '').toLowerCase().includes(q) || (it.batch_number || '').toLowerCase().includes(q));
      });
    }
    return list;
  }, [pallets, itemsByPallet, search, showArchived]);

  const handleScanResolved = (code) => {
    setScanning(false);
    const match = pallets.find(p => p.pallet_code.toLowerCase() === code.toLowerCase());
    if (!match) {
      toast.error(`No pallet found with code "${code}"`);
      return;
    }
    navigate(`/pallets/${match.pallet_code}`);
  };

  return (
    <div>
      <PageHeader title="Pallets" subtitle="Scan a pallet on the floor to see exactly what's on it">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setScanning(true)} className="gap-1.5">
            <ScanLine className="w-4 h-4" /> Scan Pallet
          </Button>
          <Button onClick={() => setCreating(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> Create Pallet
          </Button>
        </div>
      </PageHeader>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search pallet code, product or batch..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant={showArchived ? 'default' : 'outline'} size="sm" onClick={() => setShowArchived(v => !v)}>
          {showArchived ? 'Showing archived' : 'Show archived'}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <Package className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {showArchived ? 'No archived pallets.' : 'No pallets yet — create one to print a scannable label.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(p => {
            const items = itemsByPallet[p.id] || [];
            const grouped = groupPalletItems(items);
            const totalBottles = grouped.reduce((s, g) => s + (g.quantity_bottles || 0), 0);
            const batchNumbers = [...new Set(grouped.map(g => g.batch_number).filter(Boolean))];
            return (
              <Card
                key={p.id}
                className="p-4 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => navigate(`/pallets/${p.pallet_code}`)}
              >
                <div className="flex items-start justify-between mb-2">
                  <p className="font-mono font-semibold">{p.pallet_code}</p>
                  {p.status === 'archived' && <Badge variant="outline">Archived</Badge>}
                  {p.status === 'full' && <Badge className="bg-amber-100 text-amber-700">Full</Badge>}
                  {p.status === 'emptied' && <Badge className="bg-sky-100 text-sky-700">Emptied — ready to reuse</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mb-2">{p.location} · {p.created_at ? format(new Date(p.created_at), 'd MMM yyyy') : ''}</p>
                {p.location === 'Distillery' && p.status !== 'archived' && (
                  <div
                    className={cn(
                      'flex items-center justify-between rounded-lg border px-2.5 py-1.5 mb-2',
                      p.is_active_dispatch_pallet ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30'
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1.5">
                      <Truck className={cn('w-3.5 h-3.5', p.is_active_dispatch_pallet ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="text-xs font-medium">
                        {p.is_active_dispatch_pallet ? 'Available for dispatch' : 'Not shown in dispatch'}
                      </span>
                    </div>
                    {isAdmin ? (
                      <Switch
                        checked={!!p.is_active_dispatch_pallet}
                        onCheckedChange={(checked) => toggleActiveDispatch.mutate({ palletId: p.id, active: checked })}
                        disabled={toggleActiveDispatch.isPending}
                      />
                    ) : (
                      <span className={cn('text-xs font-semibold', p.is_active_dispatch_pallet ? 'text-primary' : 'text-muted-foreground')}>
                        {p.is_active_dispatch_pallet ? '✓' : '—'}
                      </span>
                    )}
                  </div>
                )}
                {batchNumbers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {batchNumbers.map(b => (
                      <Badge key={b} variant="outline" className="text-xs font-mono">{b}</Badge>
                    ))}
                  </div>
                )}
                {grouped.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No items yet</p>
                ) : (
                  <div className="space-y-0.5">
                    {grouped.slice(0, 3).map(g => (
                      <p key={g.key} className="text-sm truncate">{g.product_name} {g.bottle_size_ml}ml — {g.quantity_bottles}</p>
                    ))}
                    {grouped.length > 3 && <p className="text-xs text-muted-foreground">+{grouped.length - 3} more</p>}
                  </div>
                )}
                <p className="text-xs font-medium mt-2">{totalBottles.toLocaleString()} bottles total</p>
              </Card>
            );
          })}
        </div>
      )}

      <CreatePalletDialog
        open={creating}
        onClose={() => setCreating(false)}
        finishedGoods={finishedGoods}
        onCreated={(pallet) => { setCreating(false); navigate(`/pallets/${pallet.pallet_code}`); }}
      />
      <ScanPalletDialog open={scanning} onClose={() => setScanning(false)} onResolve={handleScanResolved} />
    </div>
  );
}
