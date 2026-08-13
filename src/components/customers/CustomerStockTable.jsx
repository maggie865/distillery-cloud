import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Package } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function CustomerStockTable({ rows, isLoading }) {
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-1.5"><Package className="w-4 h-4" /> Customer Stock</h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No products configured yet</p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Customer Stock</TableHead>
                <TableHead className="text-right">Par Level</TableHead>
                <TableHead>Last Stock Check</TableHead>
                <TableHead>Last Order</TableHead>
                <TableHead className="text-right">Suggested Order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.product.id} className={r.belowPar ? 'bg-destructive/5' : ''}>
                  <TableCell className="font-medium">{r.product.name}{r.product.bottle_size_ml ? ` (${r.product.bottle_size_ml}ml)` : ''}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{r.product.sku || '—'}</TableCell>
                  <TableCell className={`text-right font-semibold ${r.belowPar ? 'text-destructive' : ''}`}>{r.currentStock ?? '—'}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{r.parLevel || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{r.lastCheckDate ? format(parseISO(r.lastCheckDate), 'd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{r.lastOrderDate ? format(parseISO(r.lastOrderDate), 'd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-right font-semibold">{r.suggestedOrderQty > 0 ? r.suggestedOrderQty : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
