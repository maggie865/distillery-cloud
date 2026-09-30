import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Printer, Pencil, Trash2, Package, Wine, Droplets, Cloud } from 'lucide-react';
import { format } from 'date-fns';
import Pagination from '@/components/ui/Pagination';
import AdjustStockDialog from './AdjustStockDialog';

export default function StockTab({ warehouseStock, onPrintSlip, onAdjust, onDelete }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [adjusting, setAdjusting] = useState(null);
  const [adjustPending, setAdjustPending] = useState(false);

  const filtered = useMemo(() => {
    // Only show received stock — in_transit stock is not yet at the 3PL
    const withStock = warehouseStock.filter(w => (w.quantity_bottles || 0) > 0 && w.status !== 'in_transit');
    if (!search) return withStock;
    const q = search.toLowerCase();
    return withStock.filter(w =>
      (w.product_name || '').toLowerCase().includes(q) ||
      (w.batch_number || '').toLowerCase().includes(q)
    );
  }, [warehouseStock, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const pn = (a.product_name || '').localeCompare(b.product_name || '');
      if (pn !== 0) return pn;
      return (a.bottle_size_ml || 0) - (b.bottle_size_ml || 0);
    });
  }, [filtered]);

  const totalProducts = new Set(filtered.map(w => w.product_name)).size;
  const totalBottles = filtered.reduce((s, w) => s + (w.quantity_bottles || 0), 0);
  const totalLALs = filtered.reduce((s, w) => s + (w.total_lals || 0), 0);
  const totalCo2e = filtered.reduce((s, w) => s + (w.co2e_kg || 0), 0);

  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  const handleAdjustConfirm = async (record, qty, lals, reason) => {
    setAdjustPending(true);
    try {
      await onAdjust(record, qty, lals, reason);
      setAdjusting(null);
    } finally {
      setAdjustPending(false);
    }
  };

  const stats = [
    { label: 'Products at 3PL', value: totalProducts, icon: Package, color: 'text-blue-600' },
    { label: 'Total bottles', value: totalBottles.toLocaleString(), icon: Wine, color: 'text-purple-600' },
    { label: 'Total LALs', value: totalLALs.toFixed(2), icon: Droplets, color: 'text-cyan-600' },
    { label: 'Total CO2e (kg)', value: totalCo2e.toFixed(2), icon: Cloud, color: 'text-emerald-600' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(s => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={`w-4 h-4 ${s.color}`} />
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
            <p className="text-xl font-bold font-display">{s.value}</p>
          </Card>
        ))}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search product or batch..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="pl-9"
        />
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>ABV</TableHead>
                <TableHead className="text-right">Bottles</TableHead>
                <TableHead className="text-right">LALs</TableHead>
                <TableHead>Transferred</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No stock at 3PL warehouse</TableCell></TableRow>
              ) : paged.map(w => (
                <TableRow key={w.id}>
                  <TableCell className="font-medium text-sm">{w.product_name}</TableCell>
                  <TableCell className="font-mono text-sm">{w.batch_number}</TableCell>
                  <TableCell className="text-sm">{w.bottle_size_ml}ml</TableCell>
                  <TableCell className="text-sm">{w.abv_percent ? `${w.abv_percent}%` : '—'}</TableCell>
                  <TableCell className="text-right font-semibold text-sm">{(w.quantity_bottles || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{(w.total_lals || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-sm">{w.transfer_date ? format(new Date(w.transfer_date), 'd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => onPrintSlip(w)}>
                        <Printer className="w-3 h-3" /> Slip
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setAdjusting(w)}>
                        <Pencil className="w-3 h-3" /> Adjust
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive gap-1" onClick={() => onDelete(w)}>
                        <Trash2 className="w-3 h-3" /> Cancel
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Pagination total={sorted.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <AdjustStockDialog
        open={!!adjusting}
        onClose={() => setAdjusting(null)}
        record={adjusting}
        onConfirm={handleAdjustConfirm}
        pending={adjustPending}
      />
    </div>
  );
}