import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { buildBluffProductOptions, allocateBluffLineItems } from '@/lib/dispatchAllocation';

// Product/batch picker for approving a Bluff-sourced dispatch row in
// DispatchHub's Edit dialog — built on the same FIFO allocator DispatchForm
// uses at creation time (buildBluffProductOptions/allocateBluffLineItems),
// so there's one allocation implementation, not a third copy.
//
// Xero-synced rows reach this two ways: matched (product_name/bottle_size_ml
// already line up with a real product via XeroMappingManager) or unmatched
// (product_name is the raw Xero line description, bottle_size_ml is null) —
// the product picker only appears for the latter. A row that already has a
// batch_number (a normal dispatch, or a Xero row already approved once)
// shows as a summary instead of re-allocating on open — silently changing an
// already-committed allocation just because current stock has since moved
// would be wrong; reassigning is an explicit action.
export default function BatchPicker({ finishedGoods = [], productName, bottleSizeMl, batchNumber, quantityBottles, distanceKm = 0, transportMethod, onAllocate }) {
  const [manualProductId, setManualProductId] = useState('');
  const [allocationMode, setAllocationMode] = useState('fifo');
  const [manualBatchId, setManualBatchId] = useState('');
  const [reassigning, setReassigning] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('sort_order', 1000),
  });

  const bluffProductOptions = useMemo(() => buildBluffProductOptions(finishedGoods), [finishedGoods]);

  // The product catalog (Settings → Products) names each size variant with
  // the size baked into the string — e.g. "London Dry Gin 200ml" — while
  // finished_good (actual physical stock) stores the base name and size as
  // separate fields — "London Dry Gin" + bottle_size_ml: 200. A literal
  // string match between the two never succeeds, so names are compared with
  // any trailing "<N>ml" stripped; bottle_size_ml is still matched exactly.
  const stripSizeSuffix = (name) => (name || '').replace(/\s*\d+\s*ml\s*$/i, '').trim().toLowerCase();

  const matchedOption = useMemo(() => {
    const normalized = stripSizeSuffix(productName);
    if (bottleSizeMl) {
      return bluffProductOptions.find(o => stripSizeSuffix(o.product_name) === normalized && Number(o.bottle_size_ml) === Number(bottleSizeMl)) || null;
    }
    const candidates = bluffProductOptions.filter(o => stripSizeSuffix(o.product_name) === normalized);
    return candidates.length === 1 ? candidates[0] : null;
  }, [bluffProductOptions, productName, bottleSizeMl]);

  const manualProduct = products.find(p => p.id === manualProductId);
  const effectiveOption = matchedOption
    || (manualProduct ? bluffProductOptions.find(o => stripSizeSuffix(o.product_name) === stripSizeSuffix(manualProduct.name) && Number(o.bottle_size_ml) === Number(manualProduct.bottle_size_ml)) : null);

  const showPicker = reassigning || !batchNumber;

  const allocate = (batchId) => {
    if (!effectiveOption) return;
    // Use effectiveOption's own product_name/bottle_size_ml, not the raw
    // Xero/catalog name that resolved it — that's the finished_good naming
    // convention, and everything downstream (stock deduction on dispatch,
    // returns, deletes) matches dispatch rows to finished_good by exact
    // product_name string, so this has to be the value that's actually
    // saved back.
    const key = `${effectiveOption.product_name}||${effectiveOption.bottle_size_ml}`;
    try {
      const [first, ...rest] = allocateBluffLineItems(
        [{ productKey: key, quantity: quantityBottles, batchId: batchId || undefined }],
        bluffProductOptions,
        { distanceKm, transportMethod }
      );
      if (!first) return;
      if (rest.length > 0) {
        toast.warning(`Only ${first.take} of ${quantityBottles} bottles available in batch ${first.batch.batch_number} — quantity adjusted. Create a separate dispatch for the remainder.`);
      }
      onAllocate({
        product_name: effectiveOption.product_name,
        bottle_size_ml: first.batch.bottle_size_ml || effectiveOption.bottle_size_ml || null,
        batch_number: first.batch.batch_number,
        quantity_bottles: first.take,
        total_lals: parseFloat(first.lals.toFixed(4)),
        parcel_weight_kg: first.weightKg,
        co2e_kg: first.co2e,
      });
    } catch (e) {
      toast.error(e.message || 'Failed to allocate stock');
    }
  };

  // Auto-run FIFO allocation as soon as a matched/chosen product with stock
  // is known — approving an already-mapped Xero row shouldn't need an extra
  // manual step in the common case. Only while the picker is actually shown
  // (never for a row that already has a settled batch_number).
  useEffect(() => {
    if (showPicker && allocationMode === 'fifo' && effectiveOption && quantityBottles > 0) {
      allocate();
    }
  }, [showPicker, effectiveOption?.product_name, effectiveOption?.bottle_size_ml, allocationMode, quantityBottles]);

  if (!showPicker) {
    return (
      <div className="col-span-2 flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{productName}{bottleSizeMl ? ` (${bottleSizeMl}ml)` : ''}</p>
          <p className="text-xs text-muted-foreground">Batch {batchNumber}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setReassigning(true)}>Reassign</Button>
      </div>
    );
  }

  if (!matchedOption) {
    return (
      <div className="col-span-2 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="text-xs text-amber-800 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> &ldquo;{productName}&rdquo; doesn&apos;t match a known product — choose which one this dispatch is really for.</p>
        <div>
          <Label>Product</Label>
          <Select value={manualProductId} onValueChange={v => { setManualProductId(v); setManualBatchId(''); }}>
            <SelectTrigger className="mt-1 bg-background"><SelectValue placeholder="Choose a product" /></SelectTrigger>
            <SelectContent>
              {products.filter(p => p.active !== false).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}{p.bottle_size_ml ? ` (${p.bottle_size_ml}ml)` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {manualProduct && !effectiveOption && (
          <p className="text-xs text-destructive">No stock available for {manualProduct.name}{manualProduct.bottle_size_ml ? ` (${manualProduct.bottle_size_ml}ml)` : ''}.</p>
        )}
        {manualProduct && effectiveOption && (
          <BatchSelector effectiveOption={effectiveOption} allocationMode={allocationMode} setAllocationMode={setAllocationMode} manualBatchId={manualBatchId} setManualBatchId={setManualBatchId} onPick={allocate} />
        )}
      </div>
    );
  }

  if (!effectiveOption) {
    return (
      <div className="col-span-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> No stock available for {productName}{bottleSizeMl ? ` (${bottleSizeMl}ml)` : ''}.</p>
      </div>
    );
  }

  return (
    <div className="col-span-2 space-y-2">
      <Label>Product — {productName}{bottleSizeMl ? ` (${bottleSizeMl}ml)` : ''}</Label>
      <BatchSelector effectiveOption={effectiveOption} allocationMode={allocationMode} setAllocationMode={setAllocationMode} manualBatchId={manualBatchId} setManualBatchId={setManualBatchId} onPick={allocate} />
    </div>
  );
}

function BatchSelector({ effectiveOption, allocationMode, setAllocationMode, manualBatchId, setManualBatchId, onPick }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1 rounded-md bg-muted p-1">
        <button type="button" className={`flex-1 text-xs font-medium py-1 rounded ${allocationMode === 'fifo' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`} onClick={() => setAllocationMode('fifo')}>FIFO (auto)</button>
        <button type="button" className={`flex-1 text-xs font-medium py-1 rounded ${allocationMode === 'manual' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`} onClick={() => setAllocationMode('manual')}>Choose batch</button>
      </div>
      {allocationMode === 'manual' && (
        <Select value={manualBatchId} onValueChange={v => { setManualBatchId(v); onPick(v); }}>
          <SelectTrigger><SelectValue placeholder="Select batch…" /></SelectTrigger>
          <SelectContent>
            {effectiveOption.batches.map(b => (
              <SelectItem key={b.id} value={b.id}>Batch {b.batch_number} — {b.available} btls</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
