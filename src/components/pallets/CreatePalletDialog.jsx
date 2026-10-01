import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { generatePalletCode } from '@/lib/palletCode';
import PalletItemPicker, { groupFinishedGoods } from './PalletItemPicker';

const LOCATIONS = ['Distillery', 'Auckland 3PL', 'UK Bonded', 'Shop'];

export default function CreatePalletDialog({ open, onClose, finishedGoods = [], onCreated }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [location, setLocation] = useState('Distillery');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState([{ productKey: '', qty: '', batchId: '' }]);
  const [items, setItems] = useState({}); // rowIndex -> resolved pallet_item

  const productOptions = groupFinishedGoods(finishedGoods);

  const addRow = () => setRows(prev => [...prev, { productKey: '', qty: '', batchId: '' }]);
  const removeRow = (idx) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
    setItems(prev => { const next = { ...prev }; delete next[idx]; return next; });
  };
  const updateRow = (idx, nextRow, resolved) => {
    setRows(prev => prev.map((r, i) => (i === idx ? nextRow : r)));
    setItems(prev => ({ ...prev, [idx]: resolved }));
  };

  const validItems = Object.values(items).filter(it => it?.product_name && (it.quantity_bottles || 0) > 0);
  const hasInvalid = rows.some((row, idx) => {
    const it = items[idx];
    if (!row.productKey || !(parseInt(row.qty) > 0)) return false;
    const opt = productOptions.find(o => o.key === row.productKey);
    const batch = opt?.batches.find(b => b.id === row.batchId);
    const available = batch ? (batch.quantity_bottles || 0) : (opt?.totalAvailable || 0);
    return (it?.quantity_bottles || 0) > available;
  });

  const reset = () => {
    setLocation('Distillery');
    setNotes('');
    setRows([{ productKey: '', qty: '', batchId: '' }]);
    setItems({});
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      // Items are optional — a pallet can be created empty, pre-labelled
      // and ready to scan, with stock added later via "Add Item" on its
      // detail page once something is actually bottled or allocated to it.
      if (hasInvalid) throw new Error('Fix quantity errors before creating the pallet');

      const pallet_code = await generatePalletCode();
      const pallet = await base44.entities.Pallet.create({
        pallet_code,
        location,
        notes: notes || null,
        created_by_user_id: user?.id || null,
        created_by_name: user?.full_name || user?.email || null,
      });

      for (const it of validItems) {
        await base44.entities.PalletItem.create({
          pallet_id: pallet.id,
          product_name: it.product_name,
          batch_number: it.batch_number,
          bottle_size_ml: it.bottle_size_ml,
          quantity_bottles: it.quantity_bottles,
          total_lals: it.total_lals,
          source: 'manual',
          added_by_user_id: user?.id || null,
          added_by_name: user?.full_name || user?.email || null,
        });
      }

      return pallet;
    },
    onSuccess: (pallet) => {
      qc.invalidateQueries({ queryKey: ['pallets'] });
      toast.success(`Pallet ${pallet.pallet_code} created`);
      reset();
      onCreated?.(pallet);
    },
    onError: (e) => toast.error('Failed to create pallet: ' + e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Create Pallet</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Location</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATIONS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" className="mt-1" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>What's on this pallet?</Label>
            <p className="text-xs text-muted-foreground -mt-1.5">Optional — leave empty to pre-label this pallet and add stock to it later.</p>
            {rows.map((row, idx) => (
              <PalletItemPicker
                key={idx}
                row={row}
                productOptions={productOptions}
                onChange={(nextRow, resolved) => updateRow(idx, nextRow, resolved)}
                onRemove={rows.length > 1 ? () => removeRow(idx) : undefined}
              />
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addRow} className="gap-1">
              <Plus className="w-3.5 h-3.5" /> Add another item
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creating…' : 'Create Pallet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
