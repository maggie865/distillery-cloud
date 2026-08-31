import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowRightLeft, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const BOTTLE_WEIGHT_KG = 1.2;

export default function TransferTo3PLDialog({ open, onClose, finishedGoods = [] }) {
  const qc = useQueryClient();
  const [destination, setDestination] = useState('Auckland 3PL');
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [transferDistance, setTransferDistance] = useState('1500');
  const [rows, setRows] = useState([{ productKey: '', qty: '', batchId: '' }]);

  // Group by product + bottle size — show totals, not individual batches
  const productOptions = useMemo(() => {
    const map = {};
    for (const fg of finishedGoods) {
      if ((fg.quantity_bottles || 0) <= 0) continue;
      const key = `${fg.product_name}||${fg.bottle_size_ml || ''}`;
      if (!map[key]) {
        map[key] = {
          key,
          product_name: fg.product_name,
          bottle_size_ml: fg.bottle_size_ml || '',
          totalAvailable: 0,
          batches: [], // sorted oldest first for FIFO
        };
      }
      map[key].totalAvailable += (fg.quantity_bottles || 0);
      map[key].batches.push(fg);
    }
    // Sort batches FIFO (oldest batch first)
    for (const opt of Object.values(map)) {
      opt.batches.sort((a, b) => (a.batch_number || '').localeCompare(b.batch_number || ''));
    }
    return Object.values(map).sort((a, b) =>
      `${a.product_name} ${a.bottle_size_ml}`.localeCompare(`${b.product_name} ${b.bottle_size_ml}`)
    );
  }, [finishedGoods]);

  const addRow = () => setRows(prev => [...prev, { productKey: '', qty: '', batchId: '' }]);
  const removeRow = (idx) => setRows(prev => prev.filter((_, i) => i !== idx));
  const updateRow = (idx, field, value) => setRows(prev => prev.map((r, i) => {
    if (i !== idx) return r;
    // Changing product invalidates whatever batch was picked for the old one
    if (field === 'productKey') return { ...r, productKey: value, batchId: '' };
    return { ...r, [field]: value };
  }));

  const validRows = rows.filter(r => r.productKey && parseInt(r.qty) > 0);
  const totalBottles = validRows.reduce((s, r) => s + (parseInt(r.qty) || 0), 0);

  const transferCo2e = (() => {
    const weight = totalBottles * BOTTLE_WEIGHT_KG;
    const distance = parseFloat(transferDistance) || 0;
    if (!weight || !distance) return 0;
    return weight / 1000 / 56 * distance * 0.21;
  })();

  // Validate: qty doesn't exceed available — a manually-picked batch caps at
  // that batch's own quantity, FIFO caps at the product's total across batches
  const hasInvalid = validRows.some(r => {
    const opt = productOptions.find(o => o.key === r.productKey);
    if (!opt) return true;
    if (r.batchId) {
      const batch = opt.batches.find(b => b.id === r.batchId);
      return !batch || parseInt(r.qty) > (batch.quantity_bottles || 0);
    }
    // Also account for same productKey in other rows
    const totalAllocated = rows.filter(x => x.productKey === r.productKey).reduce((s, x) => s + (parseInt(x.qty) || 0), 0);
    return totalAllocated > opt.totalAvailable;
  });

  const transferMutation = useMutation({
    mutationFn: async () => {
      if (hasInvalid) throw new Error('Fix quantity errors before transferring');
      if (validRows.length === 0) throw new Error('Add at least one item to transfer');

      // Generate packing slip number
      const allSettings = await base44.entities.AppSettings.list('-created_at', 5000);
      const lastNumSetting = allSettings.find(s => s.key === 'last_packing_slip_number');
      const lastNum = lastNumSetting ? parseInt(lastNumSetting.value) || 0 : 0;
      const newNum = lastNum + 1;
      const psYear = new Date().getFullYear();
      const packingSlipNumber = `PS-${psYear}-${String(newNum).padStart(4, '0')}`;

      const transferFromBatch = async (fg, take) => {
        const lalsPerBottle = (fg.quantity_bottles || 0) > 0 && fg.total_lals
          ? fg.total_lals / fg.quantity_bottles : 0;
        const transferLals = parseFloat((take * lalsPerBottle).toFixed(4));
        const batchCo2e = (take * BOTTLE_WEIGHT_KG) / 1000 / 56 * parseFloat(transferDistance) * 0.21;
        const bottlesPerCase = fg.bottles_per_case || 6;

        // Deduct from FinishedGood
        const newQty = fg.quantity_bottles - take;
        const newLals = Math.max(0, (fg.total_lals || 0) - transferLals);
        if (newQty <= 0) {
          await base44.entities.FinishedGood.delete(fg.id);
        } else {
          await base44.entities.FinishedGood.update(fg.id, {
            quantity_bottles: newQty,
            total_lals: parseFloat(newLals.toFixed(4)),
          });
        }

        // Always create a new WarehouseStock record per transfer (in_transit)
        // rather than merging with existing — this lets us track each shipment separately
        await base44.entities.WarehouseStock.create({
          product_name: fg.product_name,
          batch_number: fg.batch_number,
          bottle_size_ml: fg.bottle_size_ml,
          abv_percent: fg.abv_percent,
          quantity_bottles: take,
          total_lals: transferLals,
          original_quantity_bottles: take,
          original_total_lals: transferLals,
          warehouse_location: destination,
          date_transferred_in: transferDate,
          transfer_date: transferDate,
          co2e_kg: parseFloat(batchCo2e.toFixed(3)),
          transport_distance_km: parseFloat(transferDistance),
          packing_slip_number: packingSlipNumber,
          bottles_per_case: bottlesPerCase,
          status: 'in_transit',
        });
      };

      for (const row of validRows) {
        const opt = productOptions.find(o => o.key === row.productKey);
        const qty = parseInt(row.qty);

        if (row.batchId) {
          // A specific batch was chosen — transfer only from that one
          const fg = opt.batches.find(b => b.id === row.batchId);
          const take = Math.min(qty, fg?.quantity_bottles || 0);
          if (fg && take > 0) await transferFromBatch(fg, take);
          continue;
        }

        // FIFO: allocate from oldest batch first
        let remaining = qty;
        for (const fg of opt.batches) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, fg.quantity_bottles || 0);
          if (take <= 0) continue;
          await transferFromBatch(fg, take);
          remaining -= take;
        }
      }

      // Save packing slip number
      if (lastNumSetting) {
        await base44.entities.AppSettings.update(lastNumSetting.id, { value: String(newNum) });
      } else {
        await base44.entities.AppSettings.create({ key: 'last_packing_slip_number', value: String(newNum) });
      }

      return { packingSlipNumber };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['finishedGoods'] });
      qc.invalidateQueries({ queryKey: ['warehouseStock'] });
      toast.success(`${totalBottles} bottles transferred to ${destination} — Packing Slip ${data?.packingSlipNumber || ''}`);
      setRows([{ productKey: '', qty: '', batchId: '' }]);
      setTransferDate(() => new Date().toISOString().split('T')[0]);
      setDestination('Auckland 3PL');
      setTransferDistance('1500');
      onClose();
    },
    onError: (err) => toast.error(err.message || 'Transfer failed'),
  });

  const handleClose = () => {
    setRows([{ productKey: '', qty: '', batchId: '' }]);
    setTransferDate(() => new Date().toISOString().split('T')[0]);
    setDestination('Auckland 3PL');
    setTransferDistance('1500');
    onClose();
  };

  const handleDestinationChange = (val) => {
    setDestination(val);
    // Set sensible default distance per destination
    setTransferDistance(val === 'UK Bonded' ? '18000' : '1500');
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" /> Transfer to 3PL Warehouse
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1">
          <Label className="text-xs">Destination Warehouse</Label>
          <select value={destination} onChange={e => handleDestinationChange(e.target.value)} className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background">
            <option value="Auckland 3PL">Auckland 3PL (NZ domestic)</option>
            <option value="UK Bonded">UK Bonded Warehouse (under bond — no excise)</option>
          </select>
          {destination === 'UK Bonded' && (
            <p className="text-xs text-blue-600 mt-1">Stock transferred under bond — no NZ excise is payable. Excise reporting excludes UK warehouse stock.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Transfer Date</Label>
            <Input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} className="text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Distance (km)</Label>
            <Input type="number" value={transferDistance} onChange={e => setTransferDistance(e.target.value)} className="text-sm" placeholder="1500" />
          </div>
        </div>

        {transferCo2e > 0 && (
          <div className="text-xs text-muted-foreground bg-muted rounded px-3 py-2">
            Estimated CO2e: <span className="font-semibold text-foreground">{transferCo2e.toFixed(3)} kg</span>
          </div>
        )}

        {productOptions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No stock available at Bluff to transfer.</p>
        ) : (
          <>
            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              <div className="grid grid-cols-[1fr_24px_100px_36px] gap-2 items-end text-xs text-muted-foreground font-medium">
                <span>Product</span><span></span><span className="text-right">Bottles</span><span></span>
              </div>
              {rows.map((row, idx) => {
                const opt = productOptions.find(o => o.key === row.productKey);
                const selectedBatch = row.batchId ? opt?.batches.find(b => b.id === row.batchId) : null;
                const totalAllocated = rows.filter(x => x.productKey === row.productKey).reduce((s, x) => s + (parseInt(x.qty) || 0), 0);
                const available = selectedBatch
                  ? (selectedBatch.quantity_bottles || 0)
                  : (opt ? opt.totalAvailable - totalAllocated + (parseInt(row.qty) || 0) : 0);
                const isOver = opt && parseInt(row.qty) > available;
                const usedKeys = rows.map(r => r.productKey).filter(k => k && k !== row.productKey);

                return (
                  <div key={idx} className="grid grid-cols-[1fr_24px_100px_36px] gap-2 items-start">
                    <div className="space-y-1">
                      <select
                        value={row.productKey}
                        onChange={e => updateRow(idx, 'productKey', e.target.value)}
                        className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background"
                      >
                        <option value="">Select product…</option>
                        {productOptions.map(o => (
                          <option key={o.key} value={o.key} disabled={usedKeys.includes(o.key)}>
                            {o.product_name} {o.bottle_size_ml ? `${o.bottle_size_ml}ml` : ''} — {o.totalAvailable} available
                          </option>
                        ))}
                      </select>
                      {opt && (
                        opt.batches.length > 1 ? (
                          <select
                            value={row.batchId}
                            onChange={e => updateRow(idx, 'batchId', e.target.value)}
                            className="w-full border border-border rounded-md px-2 py-1 text-xs bg-background"
                          >
                            <option value="">FIFO — oldest batch first ({opt.batches.length} batches)</option>
                            {opt.batches.map(b => (
                              <option key={b.id} value={b.id}>Batch {b.batch_number} — {b.quantity_bottles} available</option>
                            ))}
                          </select>
                        ) : (
                          <p className="text-xs text-muted-foreground px-1">Batch {opt.batches[0]?.batch_number}</p>
                        )
                      )}
                    </div>
                    <div />
                    <div className="space-y-1">
                      <Input
                        type="number" min="0"
                        max={available || undefined}
                        value={row.qty}
                        onChange={e => updateRow(idx, 'qty', e.target.value)}
                        disabled={!row.productKey}
                        placeholder="0"
                        className={`text-right ${isOver ? 'border-destructive' : ''}`}
                      />
                      {isOver && <p className="text-xs text-destructive px-1">Max {available}</p>}
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeRow(idx)} disabled={rows.length === 1} className="h-9 w-9">
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <Button variant="ghost" size="sm" onClick={addRow} className="gap-1 text-xs">
                <Plus className="w-3 h-3" /> Add product
              </Button>
              <p className="text-xs text-muted-foreground">
                Total: <span className="font-semibold text-foreground">{totalBottles} bottles</span>
              </p>
            </div>

            {hasInvalid && <p className="text-xs text-destructive">One or more quantities exceed available stock.</p>}
          </>
        )}

        {productOptions.length > 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button
              onClick={() => transferMutation.mutate()}
              disabled={transferMutation.isPending || validRows.length === 0 || hasInvalid}
            >
              {transferMutation.isPending ? 'Transferring…' : `Transfer ${totalBottles} bottles`}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}