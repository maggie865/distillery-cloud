import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { buildBluffProductOptions } from '@/lib/dispatchAllocation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

const todayStr = () => new Date().toISOString().split('T')[0];
const BLANK_FORM = { productKey: '', quantity: '', recipient: '', dispatch_date: todayStr(), notes: '' };

// Quick log for stock handed out for tasting/promo (cellar door pours,
// media samples, distributor tastings, etc.) - deliberately minimal
// compared to the full Direct Sale / Wholesale forms, since this isn't a
// sale: no batch picker, no transport/CO2e. Creates a 'pending' dispatch
// with no batch_number assigned yet - the same shape as an unmatched Xero
// line or a Quick-Order dispatch - so the existing "approve into a real
// batch" flow in DispatchHub's edit dialog (allocateBluffBatchForDispatch)
// handles FIFO allocation for real once someone actually pulls the stock,
// rather than duplicating that logic here.
export default function TastingDispatchDialog({ open, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState(BLANK_FORM);

  const { data: finishedGoods = [] } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => db.FinishedGood.list('-created_at', 5000),
    enabled: open,
  });
  const productOptions = useMemo(() => buildBluffProductOptions(finishedGoods), [finishedGoods]);
  const selectedProduct = productOptions.find(p => `${p.product_name}||${p.bottle_size_ml}` === form.productKey);

  const handleClose = () => {
    setForm(BLANK_FORM);
    onClose();
  };

  const createMutation = useMutation({
    mutationFn: () => db.Dispatch.create({
      dispatch_date: form.dispatch_date,
      customer_name: form.recipient.trim(),
      product_name: selectedProduct.product_name,
      bottle_size_ml: selectedProduct.bottle_size_ml || null,
      quantity_bottles: parseInt(form.quantity, 10),
      total_lals: 0,
      status: 'pending',
      dispatched_from: 'Bluff',
      sample_dispatch: true,
      notes: form.notes.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatches'] });
      qc.invalidateQueries({ queryKey: ['dispatches-all'] });
      toast.success(`Tasting dispatch logged for ${form.recipient.trim()} — pending in the dispatch log`);
      handleClose();
    },
    onError: (err) => toast.error(err.message || 'Failed to log tasting dispatch'),
  });

  const qty = parseInt(form.quantity, 10) || 0;
  const canSubmit = form.productKey && qty > 0 && form.recipient.trim() && form.dispatch_date;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-display">Tasting / Promo Dispatch</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-xs text-muted-foreground">
            Logs stock taken for tasting or promotional purposes as a pending dispatch, flagged as a sample. Pick the real batch when it's later marked dispatched.
          </p>
          <div>
            <Label>Product</Label>
            <Select value={form.productKey} onValueChange={v => setForm(f => ({ ...f, productKey: v }))}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Select product…" /></SelectTrigger>
              <SelectContent>
                {productOptions.map(opt => (
                  <SelectItem key={`${opt.product_name}||${opt.bottle_size_ml}`} value={`${opt.product_name}||${opt.bottle_size_ml}`}>
                    {opt.product_name} ({opt.bottle_size_ml}ml) — {opt.totalAvailable} in stock
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {productOptions.length === 0 && <p className="text-xs text-muted-foreground mt-1">No finished goods stock available.</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantity (bottles)</Label>
              <Input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.dispatch_date} onChange={e => setForm(f => ({ ...f, dispatch_date: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <div>
            <Label>Who it went to</Label>
            <Input value={form.recipient} onChange={e => setForm(f => ({ ...f, recipient: e.target.value }))} placeholder="e.g. Cellar door visitor, media, distributor rep" className="mt-1" />
          </div>
          <div>
            <Label>Notes (optional)</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" />
          </div>
          <Button onClick={() => createMutation.mutate()} disabled={!canSubmit || createMutation.isPending} className="w-full h-11 font-semibold">
            {createMutation.isPending ? 'Logging…' : 'Log Tasting Dispatch'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
