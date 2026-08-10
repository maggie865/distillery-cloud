import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const ACTIONS = [
{ value: 'fill', label: 'Fill (incoming product)' },
{ value: 'transfer_out', label: 'Transfer out to another tank' },
{ value: 'bottling_draw', label: 'Bottling draw (removing for bottling)' },
{ value: 'adjust', label: 'Set exact volume (adjust)' },
{ value: 'empty', label: 'Empty (drain / discard)' },
{ value: 'cleaning', label: 'Mark as Cleaning' }];


export default function TransferDialog({ tank, allTanks, open, onOpenChange, initialAction = 'fill' }) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    action: initialAction,
    date: today,
    volume_litres: initialAction === 'empty' ? String(tank?.current_volume || 0) : '',
    abv: tank?.current_abv || '',
    product: tank?.current_product || '',
    batch_number: tank?.current_batch || '',
    ethanol_lot: '',
    botanical_lot: '',
    counterpart_tank: '',
    operator: '',
    notes: ''
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // When action changes, auto-populate volume for 'empty' (uses full tank volume)
  const handleActionChange = (v) => {
    if (v === 'empty') {
      setForm((p) => ({ ...p, action: v, volume_litres: String(tank?.current_volume || 0) }));
    } else if (form.action === 'empty' && v !== 'empty') {
      // Leaving empty mode — clear the auto-filled volume
      setForm((p) => ({ ...p, action: v, volume_litres: '' }));
    } else {
      set('action', v);
    }
  };

  const lals = form.volume_litres && form.abv ?
  (parseFloat(form.volume_litres) * parseFloat(form.abv) / 100).toFixed(3) :
  null;

  const mutation = useMutation({
    mutationFn: async (f) => {
      const vol = parseFloat(f.volume_litres) || 0;
      const abv = parseFloat(f.abv) || 0;
      const isFill = f.action === 'fill';
      const isTransferOut = f.action === 'transfer_out';
      const isBottling = f.action === 'bottling_draw';
      const isEmpty = f.action === 'empty';
      const isCleaning = f.action === 'cleaning';
      const isAdjust = f.action === 'adjust';

      // Log movement for this tank
      await db.TankMovement.create({
        date: f.date,
        action: f.action,
        tank_name: tank.name,
        counterpart_tank: f.counterpart_tank || null,
        volume_litres: isCleaning ? 0 : vol,
        abv: abv,
        lals: lals ? parseFloat(lals) : 0,
        product: f.product,
        batch_number: f.batch_number,
        ethanol_lot: f.ethanol_lot,
        botanical_lot: f.botanical_lot,
        operator: f.operator,
        notes: f.notes
      });

      // Update source tank
      let newVol = tank.current_volume || 0;
      let newStatus = tank.status;

      if (isFill) {
        newVol = Math.min(newVol + vol, tank.capacity_litres);
        newStatus = 'in_use';
      } else if (isAdjust) {
        newVol = Math.min(Math.max(0, vol), tank.capacity_litres);
        newStatus = newVol === 0 ? 'empty' : 'in_use';
      } else if (isTransferOut || isBottling || isEmpty) {
        newVol = Math.max(0, newVol - vol);
        newStatus = newVol === 0 ? 'empty' : 'in_use';
      } else if (isCleaning) {
        newStatus = 'cleaning';
      }

      const tankUpdates = {
        current_volume: newVol,
        status: newStatus,
        current_product: isFill && f.product ? f.product : tank.current_product,
        current_batch: isFill && f.batch_number ? f.batch_number : tank.current_batch,
        current_abv: isFill && abv ? abv : tank.current_abv,
      };
      // If tank is now empty, clear bottling-ready flag so it drops off the bottling dropdown
      if (newVol === 0 && (isTransferOut || isBottling || isEmpty || isAdjust)) {
        tankUpdates.is_ready_for_bottling = false;
      }
      await db.StorageTank.update(tank.id, tankUpdates);

      // If transferring out, also fill the destination tank
      if (isTransferOut && f.counterpart_tank) {
        const dest = allTanks.find((t) => t.name === f.counterpart_tank);
        if (dest) {
          await db.TankMovement.create({
            date: f.date,
            action: 'transfer_in',
            tank_name: dest.name,
            counterpart_tank: tank.name,
            volume_litres: vol,
            abv,
            lals: lals ? parseFloat(lals) : 0,
            product: f.product || tank.current_product,
            batch_number: f.batch_number || tank.current_batch,
            ethanol_lot: f.ethanol_lot,
            botanical_lot: f.botanical_lot,
            operator: f.operator,
            notes: f.notes
          });

          const destNewVol = Math.min((dest.current_volume || 0) + vol, dest.capacity_litres);
          await db.StorageTank.update(dest.id, {
            current_volume: destNewVol,
            status: 'in_use',
            current_product: f.product || tank.current_product,
            current_batch: f.batch_number || tank.current_batch,
            current_abv: abv || tank.current_abv
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['tankMovements'] });
      toast.success('Tank updated successfully');
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message)
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(form);
  };

  const otherTanks = allTanks.filter((t) => t.id !== tank?.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Tank {tank?.name} — Transfer / Update</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Action</Label>
              <Select value={form.action} onValueChange={handleActionChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required />
            </div>
            {form.action !== 'cleaning' &&
            <div>
                <Label>Volume (L)</Label>
                <Input type="number" step="0.1" value={form.volume_litres} onChange={(e) => set('volume_litres', e.target.value)} disabled={form.action === 'empty'} required />
                {form.action === 'empty' && <p className="text-xs text-muted-foreground mt-1">Auto-set to full tank volume — tank will be drained completely</p>}
              </div>
            }
          </div>

          {form.action === 'transfer_out' &&
          <div>
              <Label>Destination Tank</Label>
              <Select value={form.counterpart_tank} onValueChange={(v) => set('counterpart_tank', v)}>
                <SelectTrigger><SelectValue placeholder="Select destination..." /></SelectTrigger>
                <SelectContent>
                  {otherTanks.map((t) =>
                <SelectItem key={t.id} value={t.name}>Tank {t.name} ({t.capacity_litres}L)</SelectItem>
                )}
                </SelectContent>
              </Select>
            </div>
          }

          {form.action !== 'cleaning' &&
          <div className="rounded-lg border border-border p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Product Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Product Name</Label>
                  <Input value={form.product} onChange={(e) => set('product', e.target.value)} placeholder={tank?.current_product} />
                </div>
                <div>
                  <Label>ABV %</Label>
                  <Input type="number" step="0.1" value={form.abv} onChange={(e) => set('abv', e.target.value)} />
                </div>
                <div>
                  <Label>Batch Number</Label>
                  <Input value={form.batch_number} onChange={(e) => set('batch_number', e.target.value)} />
                </div>
                <div>
                  <Label>Ethanol Lot #</Label>
                  <Input value={form.ethanol_lot} onChange={(e) => set('ethanol_lot', e.target.value)} />
                </div>
                <div className="col-span-2">
                  
                  
                </div>
              </div>
              {lals &&
            <p className="text-xs text-primary font-medium">LALs moved: {lals}</p>
            }
            </div>
          }

          <div>
            <Label>Operator</Label>
            <Input value={form.operator} onChange={(e) => set('operator', e.target.value)} placeholder="Your name" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
          </div>

          {tank?.current_volume > 0 && form.action !== 'empty' && (
            <Button type="button" variant="outline" className="w-full text-destructive hover:text-destructive" disabled={mutation.isPending}
              onClick={() => { handleActionChange('empty'); }}>
              Drain Tank Completely
            </Button>
          )}
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Confirm'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>);

}