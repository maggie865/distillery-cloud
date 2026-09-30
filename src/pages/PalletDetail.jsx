import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Plus, Printer, PackageMinus, Archive, ArchiveRestore, Wine, Droplets } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { printPalletLabel } from '@/lib/palletLabel';
import AddPalletItemDialog from '@/components/pallets/AddPalletItemDialog';
import TakeOffPalletDialog from '@/components/pallets/TakeOffPalletDialog';

export default function PalletDetail() {
  const { palletCode } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [addingItem, setAddingItem] = useState(false);
  const [takingOffItem, setTakingOffItem] = useState(null);

  const { data: pallets = [], isLoading } = useQuery({
    queryKey: ['pallets'],
    queryFn: () => base44.entities.Pallet.list('-created_at', 5000),
  });
  const pallet = pallets.find(p => p.pallet_code.toLowerCase() === (palletCode || '').toLowerCase());

  const { data: items = [] } = useQuery({
    queryKey: ['palletItems', pallet?.id],
    queryFn: () => base44.entities.PalletItem.filter({ pallet_id: pallet.id }),
    enabled: !!pallet,
  });

  const { data: finishedGoods = [] } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => base44.entities.FinishedGood.list('-created_at', 5000),
  });

  const archiveMutation = useMutation({
    mutationFn: (status) => base44.entities.Pallet.update(pallet.id, { status, updated_at: new Date().toISOString() }),
    onSuccess: (_, status) => {
      qc.invalidateQueries({ queryKey: ['pallets'] });
      toast.success(status === 'archived' ? 'Pallet archived' : 'Pallet reactivated');
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!pallet) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/pallets')} className="gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Pallets
        </Button>
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No pallet found with code "{palletCode}".</p>
        </Card>
      </div>
    );
  }

  const totalBottles = items.reduce((s, it) => s + (it.quantity_bottles || 0), 0);
  const totalLals = items.reduce((s, it) => s + (it.total_lals || 0), 0);

  return (
    <div>
      <Link to="/pallets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-3">
        <ArrowLeft className="w-4 h-4" /> Back to Pallets
      </Link>
      <PageHeader
        title={pallet.pallet_code}
        subtitle={`${pallet.location} · Created ${pallet.created_at ? format(new Date(pallet.created_at), 'd MMM yyyy') : ''}${pallet.created_by_name ? ` by ${pallet.created_by_name}` : ''}`}
      >
        <div className="flex gap-2">
          {pallet.status === 'archived' ? (
            <Badge variant="outline" className="self-center">Archived</Badge>
          ) : null}
          <Button variant="outline" onClick={() => printPalletLabel(pallet)} className="gap-1.5">
            <Printer className="w-4 h-4" /> Print Label
          </Button>
          <Button
            variant="outline"
            onClick={() => archiveMutation.mutate(pallet.status === 'archived' ? 'active' : 'archived')}
            disabled={archiveMutation.isPending}
            className="gap-1.5"
          >
            {pallet.status === 'archived' ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            {pallet.status === 'archived' ? 'Reactivate' : 'Archive'}
          </Button>
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3 mb-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><Wine className="w-4 h-4 text-purple-600" /><p className="text-xs text-muted-foreground">Total bottles</p></div>
          <p className="text-xl font-bold font-display">{totalBottles.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><Droplets className="w-4 h-4 text-cyan-600" /><p className="text-xs text-muted-foreground">Total LALs</p></div>
          <p className="text-xl font-bold font-display">{totalLals.toFixed(2)}</p>
        </Card>
      </div>

      {pallet.notes && (
        <Card className="p-3 mb-4 bg-muted/50">
          <p className="text-sm text-muted-foreground">{pallet.notes}</p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <p className="font-semibold text-sm">Contents</p>
          <Button size="sm" onClick={() => setAddingItem(true)} className="gap-1">
            <Plus className="w-3.5 h-3.5" /> Add Item
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Bottles</TableHead>
                <TableHead className="text-right">LALs</TableHead>
                <TableHead>Source</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No items on this pallet yet</TableCell></TableRow>
              ) : items.map(it => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium text-sm">{it.product_name}</TableCell>
                  <TableCell className="font-mono text-sm">{it.batch_number || '—'}</TableCell>
                  <TableCell className="text-sm">{it.bottle_size_ml ? `${it.bottle_size_ml}ml` : '—'}</TableCell>
                  <TableCell className="text-right font-semibold text-sm">{(it.quantity_bottles || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{(it.total_lals || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground capitalize">{it.source === 'bottling_run' ? 'Bottling run' : 'Manual'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setTakingOffItem(it)}>
                      <PackageMinus className="w-3.5 h-3.5" /> Take Off
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <AddPalletItemDialog
        open={addingItem}
        onClose={() => setAddingItem(false)}
        pallet={pallet}
        finishedGoods={finishedGoods}
      />
      <TakeOffPalletDialog
        open={!!takingOffItem}
        onClose={() => setTakingOffItem(null)}
        item={takingOffItem}
        currentPalletId={pallet.id}
      />
    </div>
  );
}
