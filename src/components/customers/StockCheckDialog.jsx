import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';

// Deliberately no per-field save/validation ceremony — the spec calls for
// this to be the fastest form in the app ("walk in, stock check, done").
// Blank quantity fields are just skipped rather than rejected, since a
// quick in-store check often only covers a few products.
export default function StockCheckDialog({ customer, products, open, onOpenChange }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [quantities, setQuantities] = useState({});

  const sessionId = useMemo(() => (open ? crypto.randomUUID() : null), [open]);

  const reset = () => { setDate(new Date().toISOString().split('T')[0]); setQuantities({}); };

  const mutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(quantities).filter(([, v]) => v !== '' && v != null);
      if (entries.length === 0) throw new Error('Enter at least one quantity');
      const time = new Date().toTimeString().slice(0, 5);
      for (const [productId, qty] of entries) {
        await db.CustomerStockCheck.create({
          customer_id: customer.id,
          product_id: productId,
          quantity_bottles: parseInt(qty) || 0,
          check_date: date,
          check_time: time,
          session_id: sessionId,
          recorded_by: user?.full_name || null,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customerStockChecks'] });
      toast.success('Stock check saved');
      onOpenChange(false);
      reset();
    },
    onError: (e) => toast.error(e.message || 'Failed to save stock check'),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><ClipboardCheck className="w-4 h-4" /> Stock Check</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }} className="space-y-4 mt-2">
          <div>
            <Label className="text-xs text-muted-foreground">Customer</Label>
            <p className="text-sm font-semibold">{customer.business_name}</p>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>

          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No active products to check</p>
          ) : (
            <div className="space-y-2">
              {products.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.name}</p>
                    {p.bottle_size_ml && <p className="text-xs text-muted-foreground">{p.bottle_size_ml}ml{p.sku ? ` · ${p.sku}` : ''}</p>}
                  </div>
                  <Input
                    type="number" min="0" placeholder="0" autoComplete="off"
                    value={quantities[p.id] ?? ''}
                    onChange={(e) => setQuantities((q) => ({ ...q, [p.id]: e.target.value }))}
                    className="w-20 text-center shrink-0"
                  />
                </div>
              ))}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Stock Check'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
