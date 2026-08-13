import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db, orders, supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { useCustomerStock } from '@/hooks/useCustomerStock';
import { useProductStock } from '@/hooks/useProductStock';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ShoppingCart, X, Plus, AlertTriangle, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function QuickOrderModal({ customer, open, onOpenChange, prefill }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { rows, isLoading: stockLoading } = useCustomerStock(customer?.id);
  const { getStock } = useProductStock();

  const [step, setStep] = useState('build'); // 'build' | 'confirm'
  const [lines, setLines] = useState([]); // [{ productId, qty }]
  const [addProductId, setAddProductId] = useState('');
  const [notes, setNotes] = useState('');
  const [overrideAck, setOverrideAck] = useState(false);

  // Seed the line list once stock data is ready: from a Stock Alert's
  // prefill if given, otherwise every product with a suggested order > 0.
  useEffect(() => {
    if (!open || stockLoading || rows.length === 0) return;
    if (lines.length > 0) return;
    if (prefill?.productId) {
      setLines([{ productId: prefill.productId, qty: String(prefill.suggestedQty ?? '') }]);
    } else {
      const seeded = rows.filter((r) => r.suggestedOrderQty > 0).map((r) => ({ productId: r.product.id, qty: String(r.suggestedOrderQty) }));
      if (seeded.length > 0) setLines(seeded);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stockLoading, rows, prefill]);

  const reset = () => { setStep('build'); setLines([]); setAddProductId(''); setNotes(''); setOverrideAck(false); };

  const rowFor = (productId) => rows.find((r) => r.product.id === productId);
  const addableProducts = rows.filter((r) => !lines.some((l) => l.productId === r.product.id));

  const lineDetails = useMemo(() => lines.map((l) => {
    const row = rowFor(l.productId);
    if (!row) return null;
    const qty = parseInt(l.qty) || 0;
    const available = getStock(row.product.name, row.product.bottle_size_ml, 'Bluff').available;
    return { ...l, row, qty, available, overStock: qty > available };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }).filter(Boolean), [lines, rows, getStock]);

  const hasOverStock = lineDetails.some((l) => l.overStock);
  const totalUnits = lineDetails.reduce((s, l) => s + l.qty, 0);
  const canReview = lineDetails.length > 0 && totalUnits > 0 && (!hasOverStock || overrideAck);

  const setQty = (productId, qty) => setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, qty } : l)));
  const removeLine = (productId) => setLines((prev) => prev.filter((l) => l.productId !== productId));
  const addLine = () => {
    if (!addProductId) return;
    const row = rowFor(addProductId);
    setLines((prev) => [...prev, { productId: addProductId, qty: row?.suggestedOrderQty ? String(row.suggestedOrderQty) : '' }]);
    setAddProductId('');
  };

  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      const { data: orderNumber, error: numError } = await orders.generateOrderNumber();
      if (numError) throw numError;

      const order = await db.CustomerOrder.create({
        order_number: orderNumber,
        customer_id: customer.id,
        order_date: new Date().toISOString().split('T')[0],
        ordered_by: user?.full_name || null,
        notes: notes || null,
      });

      for (const l of lineDetails) {
        await db.Dispatch.create({
          dispatch_date: order.order_date,
          customer_name: customer.business_name,
          customer_address: customer.delivery_address || null,
          product_name: l.row.product.name,
          batch_number: null, // assigned by FIFO the moment this line is marked Dispatched
          bottle_size_ml: l.row.product.bottle_size_ml || null,
          quantity_bottles: l.qty,
          total_lals: 0, // unknown until a batch is assigned — corrected at dispatch time
          dispatched_from: 'Bluff',
          status: 'pending',
          sales_channel: 'wholesale',
          order_reference: orderNumber,
          order_id: order.id,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['dispatches-all'] });
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({ queryKey: ['customerOrders'] });

      // Email is best-effort and must never roll back an already-committed
      // order — a failure here is recorded on the order (email_status) and
      // surfaced with a resend option, never silently swallowed.
      try {
        const { error: emailError } = await supabase.functions.invoke('send-order-email', {
          body: {
            orderId: order.id,
            orderNumber,
            customerName: customer.business_name,
            orderDate: order.order_date,
            orderedBy: user?.full_name || null,
            lines: lineDetails.map((l) => ({ productName: l.row.product.name, sku: l.row.product.sku, qty: l.qty })),
            totalUnits,
            notes: notes || null,
          },
        });
        if (emailError) throw emailError;
        await db.CustomerOrder.update(order.id, { email_status: 'sent', email_sent_at: new Date().toISOString() });
      } catch (emailErr) {
        await db.CustomerOrder.update(order.id, { email_status: 'failed', email_error: emailErr.message || String(emailErr) });
        toast.error('Order placed, but the notification email failed to send — you can resend it from the order.');
      }

      return order;
    },
    onSuccess: (order) => {
      toast.success(`Order ${order.order_number} placed`);
      onOpenChange(false);
      reset();
      navigate(`/customers/${customer.id}/orders/${order.id}`);
    },
    onError: (e) => toast.error(e.message || 'Failed to place order'),
  });

  if (!customer) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Quick Order</DialogTitle>
        </DialogHeader>

        <div className="mb-1">
          <Label className="text-xs text-muted-foreground">Customer</Label>
          <p className="text-sm font-semibold">{customer.business_name}</p>
        </div>

        {step === 'build' ? (
          <div className="space-y-4 mt-2">
            {lineDetails.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Add a product to get started</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
                  <span>Product</span><span className="text-center w-16">Stock</span><span className="text-center w-16">Order</span><span className="w-7" />
                </div>
                {lineDetails.map((l) => (
                  <div key={l.productId} className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 rounded-lg border p-2 ${l.overStock ? 'border-destructive/50 bg-destructive/5' : 'border-border'}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{l.row.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.row.product.bottle_size_ml ? `${l.row.product.bottle_size_ml}ml · ` : ''}Par {l.row.parLevel} · {l.available} available
                      </p>
                    </div>
                    <span className="w-16 text-center text-sm">{l.row.currentStock ?? '—'}</span>
                    <Input type="number" min="0" value={l.qty || ''} onChange={(e) => setQty(l.productId, e.target.value)} className="w-16 text-center" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeLine(l.productId)}><X className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
            )}

            {addableProducts.length > 0 && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Select value={addProductId} onValueChange={setAddProductId}>
                    <SelectTrigger><SelectValue placeholder="Add product…" /></SelectTrigger>
                    <SelectContent>
                      {addableProducts.map((r) => <SelectItem key={r.product.id} value={r.product.id}>{r.product.name}{r.product.bottle_size_ml ? ` (${r.product.bottle_size_ml}ml)` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="outline" size="icon" onClick={addLine} disabled={!addProductId}><Plus className="w-4 h-4" /></Button>
              </div>
            )}

            {hasOverStock && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                <p className="text-sm font-medium text-destructive flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Insufficient Stock</p>
                {lineDetails.filter((l) => l.overStock).map((l) => (
                  <p key={l.productId} className="text-xs text-destructive/90">Only {l.available} {l.row.product.name} available — {l.qty} ordered.</p>
                ))}
                <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer pt-1">
                  <Checkbox checked={overrideAck} onCheckedChange={(v) => setOverrideAck(v === true)} className="mt-0.5" />
                  Place this order anyway, over available stock
                </label>
              </div>
            )}

            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional order notes" />
            </div>

            <Button className="w-full" disabled={!canReview} onClick={() => setStep('confirm')}>
              Review Order ({totalUnits} bottles)
            </Button>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <button onClick={() => setStep('build')} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to edit
            </button>
            <h3 className="text-sm font-semibold">Confirm Order</h3>
            <div className="rounded-lg border border-border divide-y divide-border">
              {lineDetails.map((l) => (
                <div key={l.productId} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{l.row.product.name}{l.row.product.bottle_size_ml ? ` (${l.row.product.bottle_size_ml}ml)` : ''}</span>
                  <span className="font-semibold">× {l.qty}</span>
                </div>
              ))}
              <div className="flex items-center justify-between px-3 py-2 text-sm font-semibold bg-muted/40">
                <span>Total Units</span><span>{totalUnits}</span>
              </div>
            </div>
            {notes && <p className="text-xs text-muted-foreground">Notes: {notes}</p>}
            {hasOverStock && (
              <p className="text-xs text-destructive flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Placing this order despite insufficient stock on one or more items.</p>
            )}
            <Button className="w-full h-12 text-base font-semibold" disabled={placeOrderMutation.isPending} onClick={() => placeOrderMutation.mutate()}>
              {placeOrderMutation.isPending ? 'Placing Order…' : 'Place Order'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
