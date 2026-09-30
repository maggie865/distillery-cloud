import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { generatePalletCode } from '@/lib/palletCode';

const NEW_PALLET = '__new__';

// Handles taking bottles off a pallet line item, whichever way it's leaving:
// dispatched/used up (just reduce it), a correction, or physically moved
// onto another pallet (a "split" — reduces here, adds there).
export default function TakeOffPalletDialog({ open, onClose, item, currentPalletId }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('dispatched');
  const [destChoice, setDestChoice] = useState(NEW_PALLET);
  const [newLocation, setNewLocation] = useState('Distillery');

  const { data: pallets = [] } = useQuery({
    queryKey: ['pallets'],
    queryFn: () => base44.entities.Pallet.list('-created_at', 5000),
    enabled: open,
  });
  const otherPallets = pallets.filter(p => p.status !== 'archived' && p.id !== currentPalletId);

  const max = item?.quantity_bottles || 0;
  const takeQty = qty === '' ? max : (parseInt(qty) || 0);
  const isValid = takeQty > 0 && takeQty <= max;

  const reset = () => {
    setQty('');
    setReason('dispatched');
    setDestChoice(NEW_PALLET);
    setNewLocation('Distillery');
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!isValid) throw new Error(`Enter a quantity between 1 and ${max}`);

      const lalsPerBottle = (item.quantity_bottles || 0) > 0 && item.total_lals ? item.total_lals / item.quantity_bottles : 0;
      const takeLals = parseFloat((takeQty * lalsPerBottle).toFixed(4));
      const remainingQty = item.quantity_bottles - takeQty;
      const remainingLals = parseFloat(((item.total_lals || 0) - takeLals).toFixed(4));

      if (remainingQty <= 0) {
        await base44.entities.PalletItem.delete(item.id);
      } else {
        await base44.entities.PalletItem.update(item.id, { quantity_bottles: remainingQty, total_lals: remainingLals });
      }

      if (reason === 'moved') {
        let destPalletId = destChoice;
        let destCode;
        if (destChoice === NEW_PALLET) {
          const pallet_code = await generatePalletCode();
          const pallet = await base44.entities.Pallet.create({ pallet_code, location: newLocation });
          destPalletId = pallet.id;
          destCode = pallet.pallet_code;
        } else {
          destCode = otherPallets.find(p => p.id === destChoice)?.pallet_code;
        }

        const destItems = await base44.entities.PalletItem.filter({ pallet_id: destPalletId });
        const existing = destItems.find(it =>
          it.product_name === item.product_name &&
          (it.batch_number || null) === (item.batch_number || null) &&
          Number(it.bottle_size_ml) === Number(item.bottle_size_ml)
        );
        if (existing) {
          await base44.entities.PalletItem.update(existing.id, {
            quantity_bottles: (existing.quantity_bottles || 0) + takeQty,
            total_lals: parseFloat(((existing.total_lals || 0) + takeLals).toFixed(4)),
          });
        } else {
          await base44.entities.PalletItem.create({
            pallet_id: destPalletId,
            product_name: item.product_name,
            batch_number: item.batch_number,
            bottle_size_ml: item.bottle_size_ml,
            quantity_bottles: takeQty,
            total_lals: takeLals,
            source: item.source,
            bottling_run_id: item.bottling_run_id || null,
          });
        }
        return { destCode };
      }
      return {};
    },
    onSuccess: ({ destCode } = {}) => {
      qc.invalidateQueries({ queryKey: ['pallets'] });
      qc.invalidateQueries({ queryKey: ['palletItemsAll'] });
      qc.invalidateQueries({ queryKey: ['palletItems'] });
      toast.success(destCode ? `Moved ${takeQty} bottles to ${destCode}` : `Removed ${takeQty} bottles from the pallet`);
      reset();
      onClose();
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-display">Take Off Pallet</DialogTitle></DialogHeader>
        {item && (
          <div className="space-y-4 mt-2">
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-semibold">{item.product_name}</p>
              <p className="text-muted-foreground text-xs">{item.batch_number ? `Batch ${item.batch_number} · ` : ''}{item.bottle_size_ml ? `${item.bottle_size_ml}ml · ` : ''}{max} bottles on pallet</p>
            </div>

            <div>
              <Label>Bottles to take off</Label>
              <Input
                type="number" min="1" max={max}
                placeholder={String(max)}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="mt-1"
              />
              {!isValid && qty !== '' && <p className="text-xs text-destructive mt-1">Enter a quantity between 1 and {max}</p>}
            </div>

            <div>
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dispatched">Shipped / dispatched to a customer</SelectItem>
                  <SelectItem value="moved">Moved to another pallet</SelectItem>
                  <SelectItem value="correction">Correction / other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {reason === 'moved' && (
              <div>
                <Label>Destination pallet</Label>
                <Select value={destChoice} onValueChange={setDestChoice}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NEW_PALLET}>+ New pallet</SelectItem>
                    {otherPallets.map(p => <SelectItem key={p.id} value={p.id}>{p.pallet_code} — {p.location}</SelectItem>)}
                  </SelectContent>
                </Select>
                {destChoice === NEW_PALLET && (
                  <div className="mt-2">
                    <Label>New pallet location</Label>
                    <Select value={newLocation} onValueChange={setNewLocation}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Distillery">Distillery</SelectItem>
                        <SelectItem value="Auckland 3PL">Auckland 3PL</SelectItem>
                        <SelectItem value="UK Bonded">UK Bonded</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!isValid || mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
