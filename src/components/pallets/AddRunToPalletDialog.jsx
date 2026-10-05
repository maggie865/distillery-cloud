import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { generatePalletCode } from '@/lib/palletCode';
import { reactivatePalletIfEmptied } from '@/lib/palletStock';

const NEW_PALLET = '__new__';

// Quick action from a just-completed bottling run: stack its output straight
// onto an existing open pallet, or start a fresh one, without leaving the
// Bottling Floor page.
export default function AddRunToPalletDialog({ open, onClose, run }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [palletChoice, setPalletChoice] = useState(NEW_PALLET);
  const [qty, setQty] = useState('');
  const [newLocation, setNewLocation] = useState('Distillery');
  const [createdCode, setCreatedCode] = useState(null);

  const { data: pallets = [] } = useQuery({
    queryKey: ['pallets'],
    queryFn: () => base44.entities.Pallet.list('-created_at', 5000),
    enabled: open,
  });
  // Emptied pallets (everything dispatched off them) are offered alongside
  // active ones so the bottling team can reuse the physical pallet instead
  // of only ever being able to start a fresh one.
  const choosablePallets = pallets.filter(p => p.status === 'active' || p.status === 'emptied');

  const effectiveQty = qty === '' ? (run?.bottles_produced || 0) : parseInt(qty) || 0;
  const isValid = effectiveQty > 0 && effectiveQty <= (run?.bottles_produced || 0);

  const reset = () => {
    setPalletChoice(NEW_PALLET);
    setQty('');
    setNewLocation('Distillery');
    setCreatedCode(null);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!isValid) throw new Error(`Enter a quantity up to ${run.bottles_produced} bottles`);

      let palletId = palletChoice;
      let palletCode = choosablePallets.find(p => p.id === palletChoice)?.pallet_code;

      if (palletChoice === NEW_PALLET) {
        const pallet_code = await generatePalletCode();
        const pallet = await base44.entities.Pallet.create({
          pallet_code,
          location: newLocation,
          created_by_user_id: user?.id || null,
          created_by_name: user?.full_name || user?.email || null,
        });
        palletId = pallet.id;
        palletCode = pallet.pallet_code;
      } else {
        await reactivatePalletIfEmptied(palletId);
      }

      const lalsPerBottle = run.lals_per_bottle || 0;
      await base44.entities.PalletItem.create({
        pallet_id: palletId,
        product_name: run.product_name,
        batch_number: run.batch_number,
        bottle_size_ml: run.bottle_size_ml,
        quantity_bottles: effectiveQty,
        total_lals: parseFloat((effectiveQty * lalsPerBottle).toFixed(4)),
        source: 'bottling_run',
        bottling_run_id: run.id,
        added_by_user_id: user?.id || null,
        added_by_name: user?.full_name || user?.email || null,
      });

      return palletCode;
    },
    onSuccess: (palletCode) => {
      qc.invalidateQueries({ queryKey: ['pallets'] });
      qc.invalidateQueries({ queryKey: ['palletItemsAll'] });
      qc.invalidateQueries({ queryKey: ['palletItems'] });
      toast.success(`Added to pallet ${palletCode}`);
      setCreatedCode(palletCode);
    },
    onError: (e) => toast.error('Failed to add to pallet: ' + e.message),
  });

  const handleClose = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="font-display">Add to Pallet</DialogTitle></DialogHeader>
        {run && (
          <div className="space-y-4 mt-2">
            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-semibold">{run.product_name}</p>
              <p className="text-muted-foreground text-xs">Batch {run.batch_number} · {run.bottles_produced} bottles · {run.bottle_size_ml}ml</p>
            </div>

            {createdCode ? (
              <p className="text-sm">
                Added to <Link to={`/pallets/${createdCode}`} className="font-mono font-semibold text-primary hover:underline">{createdCode}</Link>.
              </p>
            ) : (
              <>
                <div>
                  <Label>Pallet</Label>
                  <Select value={palletChoice} onValueChange={setPalletChoice}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NEW_PALLET}>+ New pallet</SelectItem>
                      {choosablePallets.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.pallet_code} — {p.location}{p.status === 'emptied' ? ' (emptied)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {palletChoice === NEW_PALLET && (
                  <div>
                    <Label>Location</Label>
                    <Select value={newLocation} onValueChange={setNewLocation}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Distillery">Distillery</SelectItem>
                        <SelectItem value="Auckland 3PL">Auckland 3PL</SelectItem>
                        <SelectItem value="UK Bonded">UK Bonded</SelectItem>
                        <SelectItem value="Shop">Shop</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label>Bottles</Label>
                  <Input
                    type="number"
                    min="1"
                    max={run.bottles_produced}
                    placeholder={String(run.bottles_produced || 0)}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="mt-1"
                  />
                  {!isValid && qty !== '' && <p className="text-xs text-destructive mt-1">Enter up to {run.bottles_produced} bottles</p>}
                </div>
              </>
            )}
          </div>
        )}
        <DialogFooter>
          {createdCode ? (
            <Button className="w-full" onClick={handleClose}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={() => mutation.mutate()} disabled={!isValid || mutation.isPending}>
                {mutation.isPending ? 'Adding…' : 'Add to Pallet'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
