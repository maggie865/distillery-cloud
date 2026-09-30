import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import PalletItemPicker, { groupFinishedGoods } from './PalletItemPicker';

export default function AddPalletItemDialog({ open, onClose, pallet, finishedGoods = [] }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [row, setRow] = useState({ productKey: '', qty: '', batchId: '' });
  const [resolved, setResolved] = useState(null);

  const productOptions = groupFinishedGoods(finishedGoods);
  const opt = productOptions.find(o => o.key === row.productKey);
  const batch = opt?.batches.find(b => b.id === row.batchId);
  const available = batch ? (batch.quantity_bottles || 0) : (opt?.totalAvailable || 0);
  const isValid = resolved?.product_name && (resolved.quantity_bottles || 0) > 0 && resolved.quantity_bottles <= available;

  const addMutation = useMutation({
    mutationFn: () => base44.entities.PalletItem.create({
      pallet_id: pallet.id,
      product_name: resolved.product_name,
      batch_number: resolved.batch_number,
      bottle_size_ml: resolved.bottle_size_ml,
      quantity_bottles: resolved.quantity_bottles,
      total_lals: resolved.total_lals,
      source: 'manual',
      added_by_user_id: user?.id || null,
      added_by_name: user?.full_name || user?.email || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['palletItems', pallet.id] });
      toast.success('Item added to pallet');
      setRow({ productKey: '', qty: '', batchId: '' });
      setResolved(null);
      onClose();
    },
    onError: (e) => toast.error('Failed to add item: ' + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="font-display">Add Item to {pallet?.pallet_code}</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <Label>Product</Label>
          <PalletItemPicker
            row={row}
            productOptions={productOptions}
            onChange={(nextRow, nextResolved) => { setRow(nextRow); setResolved(nextResolved); }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => addMutation.mutate()} disabled={!isValid || addMutation.isPending}>
            {addMutation.isPending ? 'Adding…' : 'Add to Pallet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
