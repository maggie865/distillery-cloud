import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2 } from 'lucide-react';

// Groups FinishedGood by product + bottle size (same FIFO-friendly grouping
// as TransferTo3PLDialog) so a pallet item can be picked either as "some of
// this product/size, oldest batch first" or a specific batch. Tasting/sample
// stock is deliberately excluded — it's kept separately from real pallets,
// never stacked or shipped via 3PL, so it should never be pickable here.
export function groupFinishedGoods(finishedGoods = []) {
  const map = {};
  for (const fg of finishedGoods) {
    if ((fg.quantity_bottles || 0) <= 0) continue;
    if (fg.is_tasting === true || (fg.product_name || '').includes('Tasting')) continue;
    const key = `${fg.product_name}||${fg.bottle_size_ml || ''}`;
    if (!map[key]) {
      map[key] = {
        key,
        product_name: fg.product_name,
        bottle_size_ml: fg.bottle_size_ml || '',
        totalAvailable: 0,
        batches: [],
      };
    }
    map[key].totalAvailable += (fg.quantity_bottles || 0);
    map[key].batches.push(fg);
  }
  for (const opt of Object.values(map)) {
    opt.batches.sort((a, b) => (a.batch_number || '').localeCompare(b.batch_number || ''));
  }
  return Object.values(map).sort((a, b) =>
    `${a.product_name} ${a.bottle_size_ml}`.localeCompare(`${b.product_name} ${b.bottle_size_ml}`)
  );
}

// One row: pick a product+size, optionally a specific batch, and a bottle
// count. Reports back a resolved pallet_item payload (proportional LALs from
// whichever FinishedGood batch/batches it's drawn from) via onChange.
export default function PalletItemPicker({ row, onChange, onRemove, productOptions }) {
  const opt = productOptions.find(o => o.key === row.productKey);
  const batch = opt?.batches.find(b => b.id === row.batchId);
  const available = batch ? (batch.quantity_bottles || 0) : (opt?.totalAvailable || 0);
  const qty = parseInt(row.qty) || 0;
  const invalid = row.productKey && qty > 0 && qty > available;

  const lalsPerBottle = useMemo(() => {
    if (!opt) return 0;
    if (batch) {
      return (batch.quantity_bottles || 0) > 0 && batch.total_lals ? batch.total_lals / batch.quantity_bottles : 0;
    }
    // No specific batch chosen — average across the product's batches
    const totalLals = opt.batches.reduce((s, b) => s + (b.total_lals || 0), 0);
    const totalQty = opt.batches.reduce((s, b) => s + (b.quantity_bottles || 0), 0);
    return totalQty > 0 ? totalLals / totalQty : 0;
  }, [opt, batch]);

  const resolvedItem = (nextOpt, nextBatch, nextQty) => ({
    product_name: nextOpt?.product_name,
    batch_number: nextBatch?.batch_number || null,
    bottle_size_ml: nextOpt?.bottle_size_ml || null,
    quantity_bottles: nextQty,
    total_lals: nextQty > 0 ? parseFloat((nextQty * lalsPerBottle).toFixed(4)) : 0,
  });

  const set = (field, value) => {
    const next = { ...row, [field]: value };
    if (field === 'productKey') next.batchId = '';
    const nextOpt = field === 'productKey' ? productOptions.find(o => o.key === value) : opt;
    const nextBatch = field === 'batchId' ? nextOpt?.batches.find(b => b.id === value) : batch;
    onChange(next, resolvedItem(nextOpt, nextBatch, qty));
  };

  return (
    <div className="flex items-start gap-2">
      <Select value={row.productKey} onValueChange={(v) => set('productKey', v)}>
        <SelectTrigger className="flex-1"><SelectValue placeholder="Select product & size" /></SelectTrigger>
        <SelectContent>
          {productOptions.map(o => (
            <SelectItem key={o.key} value={o.key}>{o.product_name} — {o.bottle_size_ml}ml ({o.totalAvailable} available)</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {opt && opt.batches.length > 1 && (
        <Select value={row.batchId || 'any'} onValueChange={(v) => set('batchId', v === 'any' ? '' : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Any batch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any batch (FIFO)</SelectItem>
            {opt.batches.map(b => <SelectItem key={b.id} value={b.id}>{b.batch_number} ({b.quantity_bottles})</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      <div className="w-28">
        <Input
          type="number"
          min="1"
          placeholder="Bottles"
          value={row.qty}
          onChange={(e) => {
            const val = e.target.value;
            onChange({ ...row, qty: val }, resolvedItem(opt, batch, parseInt(val) || 0));
          }}
          className={invalid ? 'border-destructive' : ''}
        />
        {invalid && <p className="text-xs text-destructive mt-0.5">Only {available} available</p>}
      </div>
      {onRemove && (
        <Button type="button" variant="ghost" size="icon" onClick={onRemove}>
          <Trash2 className="w-4 h-4 text-muted-foreground" />
        </Button>
      )}
    </div>
  );
}
