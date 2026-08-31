import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db, supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { X, Plus, PackageCheck, MapPin } from 'lucide-react';
import { toast } from 'sonner';

const DISTILLERY_ORIGIN = '250 Ocean Beach Road, Bluff, New Zealand';

const calcWeightKg = (bottleSizeMl, numBottles) => {
  if (!numBottles) return 0;
  const kgPerBottle = bottleSizeMl <= 250 ? (6 / 12) : (10 / 6);
  return parseFloat((kgPerBottle * numBottles).toFixed(2));
};

const EMISSION_FACTORS = { road: 0.12, courier: 0.12, air: 0.9, sea: 0.01, pickup: 0 };

const calcCO2e = (distanceKm, weightKg, method) => {
  if (!distanceKm || !weightKg || !method) return 0;
  return parseFloat(((distanceKm * weightKg / 1000) * (EMISSION_FACTORS[method] || 0)).toFixed(3));
};

const CHANNEL_LABELS = {
  cellar_door: 'Cellar Door',
  shopify: 'Shopify',
  airpoints: 'Airpoints',
  website: 'Website',
  other: 'Other',
};

const EMPTY_FORM = {
  dispatch_date: new Date().toISOString().split('T')[0],
  sales_channel: 'cellar_door',
  order_reference: '',
  delivery_postcode: '',
  transport_distance_km: '',
  transport_method: 'pickup',
  status: 'dispatched',
  notes: '',
};

export default function DirectSalesForm({ open, onClose, finishedGoods = [], allDispatches = [] }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [lineItems, setLineItems] = useState([]);
  const [newLineProductKey, setNewLineProductKey] = useState('');
  const [newLineQty, setNewLineQty] = useState('');
  const [calcingDistance, setCalcingDistance] = useState(false);
  const [allocationMode, setAllocationMode] = useState('fifo');
  const [newLineBatchId, setNewLineBatchId] = useState('');

  const queryClient = useQueryClient();
  const isPickup = form.transport_method === 'pickup';

  const sellableGoods = useMemo(
    () => finishedGoods.filter(fg => !fg.product_name?.includes('Tasting')),
    [finishedGoods]
  );

  const productOptions = useMemo(() => {
    const map = {};
    for (const fg of sellableGoods) {
      const key = `${fg.product_name}||${fg.bottle_size_ml || ''}`;
      if (!map[key]) map[key] = { product_name: fg.product_name, bottle_size_ml: fg.bottle_size_ml || '', batches: [] };
      map[key].batches.push(fg);
    }
    return Object.values(map).map(opt => {
      const batchesWithAvail = opt.batches.map(fg => {
        return { ...fg, available: fg.quantity_bottles || 0 };
      }).filter(b => b.available > 0);
      batchesWithAvail.sort((a, b) => {
        const an = (a.batch_number || '').match(/\d+/g)?.join('.') || '';
        const bn = (b.batch_number || '').match(/\d+/g)?.join('.') || '';
        if (an && bn) return an.localeCompare(bn, undefined, { numeric: true });
        if (an) return -1;
        if (bn) return 1;
        return new Date(a.created_at) - new Date(b.created_at);
      });
      return { ...opt, batches: batchesWithAvail, totalAvailable: batchesWithAvail.reduce((s, b) => s + b.available, 0) };
    }).filter(opt => opt.totalAvailable > 0);
  }, [sellableGoods, allDispatches]);

  const flatBatches = useMemo(() => {
    const list = [];
    for (const opt of productOptions) {
      for (const b of opt.batches) {
        list.push({ ...b, productKey: `${opt.product_name}||${opt.bottle_size_ml}` });
      }
    }
    return list;
  }, [productOptions]);

  const committedByProduct = useMemo(() => {
    const map = {};
    for (const li of lineItems) {
      map[li.productKey] = (map[li.productKey] || 0) + (parseInt(li.quantity) || 0);
    }
    return map;
  }, [lineItems]);

  const getRemainingAvail = (key) => {
    const product = productOptions.find(p => `${p.product_name}||${p.bottle_size_ml}` === key);
    return product ? Math.max(0, product.totalAvailable - (committedByProduct[key] || 0)) : 0;
  };

  const committedByBatch = useMemo(() => {
    const map = {};
    for (const li of lineItems) {
      if (li.batchId) map[li.batchId] = (map[li.batchId] || 0) + (parseInt(li.quantity) || 0);
    }
    return map;
  }, [lineItems]);

  const getRemainingBatchAvail = (batchId) => {
    const batch = flatBatches.find(b => b.id === batchId);
    return batch ? Math.max(0, batch.available - (committedByBatch[batchId] || 0)) : 0;
  };

  const totalBottles = lineItems.reduce((s, li) => s + (parseInt(li.quantity) || 0), 0);
  const totalWeightKg = lineItems.reduce((s, li) => {
    const product = productOptions.find(p => `${p.product_name}||${p.bottle_size_ml}` === li.productKey);
    return s + (product ? calcWeightKg(product.bottle_size_ml, parseInt(li.quantity) || 0) : 0);
  }, 0);
  const hasOverStock = lineItems.some(li => {
    if (li.batchId) return (parseInt(li.quantity) || 0) > getRemainingBatchAvail(li.batchId);
    return (parseInt(li.quantity) || 0) > getRemainingAvail(li.productKey);
  });
  const canSubmit = lineItems.length > 0 && !hasOverStock && totalBottles > 0;

  const handleChannelChange = (value) => {
    if (value === 'cellar_door') {
      setForm(f => ({ ...f, sales_channel: value, transport_method: 'pickup', transport_distance_km: '0', delivery_postcode: '' }));
    } else {
      setForm(f => {
        const next = { ...f, sales_channel: value };
        if (f.transport_method === 'pickup') {
          next.transport_method = 'road';
          next.transport_distance_km = '';
        }
        return next;
      });
    }
  };

  const addLineItem = () => {
    if (!newLineQty) return;
    const qty = parseInt(newLineQty) || 0;
    if (qty <= 0) return;
    if (allocationMode === 'manual') {
      if (!newLineBatchId) return;
      const batch = flatBatches.find(b => b.id === newLineBatchId);
      setLineItems(prev => [...prev, { id: Date.now() + Math.random(), productKey: batch.productKey, batchId: newLineBatchId, quantity: String(qty) }]);
      setNewLineBatchId('');
    } else {
      if (!newLineProductKey) return;
      setLineItems(prev => [...prev, { id: Date.now() + Math.random(), productKey: newLineProductKey, quantity: String(qty) }]);
      setNewLineProductKey('');
    }
    setNewLineQty('');
  };

  const updateLineItem = (id, value) => setLineItems(prev => prev.map(li => li.id === id ? { ...li, quantity: value } : li));
  const removeLineItem = (id) => setLineItems(prev => prev.filter(li => li.id !== id));

  const calculateDistance = async (postcode) => {
    if (!postcode) return;
    setCalcingDistance(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-distance-matrix', { body: { origin: DISTILLERY_ORIGIN, destination: `${postcode}, New Zealand` } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to calculate distance');
      setForm(f => ({ ...f, transport_distance_km: String(data.distance_km) }));
      toast.success(`Distance: ${data.distance_km} km`);
    } catch (err) {
      toast.error(err.message || 'Could not calculate distance — enter manually');
    } finally {
      setCalcingDistance(false);
    }
  };

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setLineItems([]);
    setNewLineProductKey('');
    setNewLineBatchId('');
    setAllocationMode('fifo');
    setNewLineQty('');
    onClose();
  };

  const co2ePreview = isPickup ? 0 : calcCO2e(parseFloat(form.transport_distance_km) || 0, totalWeightKg, form.transport_method);

  const submitMutation = useMutation({
    mutationFn: async () => {
      const distanceKm = isPickup ? 0 : (parseFloat(form.transport_distance_km) || 0);
      const transportMethod = isPickup ? 'pickup' : form.transport_method;
      const channelLabel = CHANNEL_LABELS[form.sales_channel] || form.sales_channel;

      const batchAvailMap = {};
      for (const opt of productOptions) for (const b of opt.batches) batchAvailMap[b.id] = b.available;
      const allAllocations = [];

      for (const li of lineItems) {
        const product = productOptions.find(p => `${p.product_name}||${p.bottle_size_ml}` === li.productKey);
        if (!product) continue;
        let remaining = parseInt(li.quantity) || 0;
        if (li.batchId) {
          const batch = product.batches.find(b => b.id === li.batchId);
          if (!batch) throw new Error(`Batch not found for ${product.product_name}`);
          const avail = batchAvailMap[batch.id] || 0;
          if (avail < remaining) throw new Error(`Insufficient stock for ${product.product_name} batch ${batch.batch_number} (${avail} available)`);
          const bottleSize = batch.bottle_size_ml || 700;
          const lals = ((remaining * bottleSize) / 1000) * (batch.abv_percent || 0) / 100;
          const weightKg = calcWeightKg(bottleSize, remaining);
          allAllocations.push({ batch, take: remaining, lals, weightKg, co2e: calcCO2e(distanceKm, weightKg, transportMethod) });
          batchAvailMap[batch.id] = avail - remaining;
          remaining = 0;
        } else {
          for (const batch of product.batches) {
            if (remaining <= 0) break;
            const avail = batchAvailMap[batch.id] || 0;
            if (avail <= 0) continue;
            const take = Math.min(remaining, avail);
            const bottleSize = batch.bottle_size_ml || 700;
            const lals = ((take * bottleSize) / 1000) * (batch.abv_percent || 0) / 100;
            const weightKg = calcWeightKg(bottleSize, take);
            allAllocations.push({ batch, take, lals, weightKg, co2e: calcCO2e(distanceKm, weightKg, transportMethod) });
            batchAvailMap[batch.id] = avail - take;
            remaining -= take;
          }
        }
        if (remaining > 0) throw new Error(`Insufficient stock for ${product.product_name} (${product.bottle_size_ml}ml)`);
      }

      for (const a of allAllocations) {
        await db.Dispatch.create({
          dispatch_date: form.dispatch_date,
          customer_name: channelLabel,
          customer_address: form.delivery_postcode || undefined,
          product_name: a.batch.product_name,
          batch_number: a.batch.batch_number,
          bottle_size_ml: a.batch.bottle_size_ml || null,
          quantity_bottles: a.take,
          total_lals: parseFloat(a.lals.toFixed(4)),
          parcel_weight_kg: a.weightKg,
          transport_distance_km: distanceKm || undefined,
          transport_method: transportMethod,
          co2e_kg: a.co2e > 0 ? parseFloat(a.co2e.toFixed(3)) : undefined,
          status: form.status || 'dispatched',
          sales_channel: form.sales_channel,
          order_reference: form.order_reference || undefined,
          notes: form.notes || undefined,
          dispatched_from: 'Bluff',
        });
        const newQty = (a.batch.quantity_bottles || 0) - a.take;
        const newLals = Math.max(0, (a.batch.total_lals || 0) - parseFloat(a.lals.toFixed(4)));
        if (newQty <= 0) await db.FinishedGood.delete(a.batch.id);
        else await db.FinishedGood.update(a.batch.id, { quantity_bottles: newQty, total_lals: parseFloat(newLals.toFixed(4)) });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({ queryKey: ['dispatches-all'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      handleClose();
      toast.success(`${lineItems.length} product(s) sold via ${CHANNEL_LABELS[form.sales_channel]}`);
    },
    onError: (err) => toast.error(err.message || 'Failed to record sale'),
  });

  const hasStock = productOptions.length > 0;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Record Direct Sale</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Sales Channel</Label>
              <Select value={form.sales_channel} onValueChange={handleChannelChange}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cellar_door">Cellar Door</SelectItem>
                  <SelectItem value="shopify">Shopify</SelectItem>
                  <SelectItem value="airpoints">Airpoints</SelectItem>
                  <SelectItem value="website">Website</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Order Reference</Label>
              <Input value={form.order_reference} onChange={e => setForm(f => ({ ...f, order_reference: e.target.value }))} placeholder="Order #" className="mt-1" />
            </div>
          </div>

          <div><Label>Date</Label><Input type="date" value={form.dispatch_date} onChange={e => setForm(f => ({ ...f, dispatch_date: e.target.value }))} className="mt-1" /></div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Products</Label>
              {lineItems.length > 0 && <span className="text-xs text-muted-foreground">{totalBottles} bottles • {totalWeightKg} kg</span>}
            </div>
            {lineItems.length > 0 && (
              <div className="space-y-2 mb-3">
                {lineItems.map((li) => {
                  const product = productOptions.find(p => `${p.product_name}||${p.bottle_size_ml}` === li.productKey);
                  let remaining, sublabel;
                  if (li.batchId) {
                    const batch = flatBatches.find(b => b.id === li.batchId);
                    remaining = getRemainingBatchAvail(li.batchId);
                    sublabel = `${product?.bottle_size_ml}ml • Batch ${batch?.batch_number} • ${remaining} available`;
                  } else {
                    remaining = getRemainingAvail(li.productKey);
                    sublabel = `${product?.bottle_size_ml}ml • ${remaining} available`;
                  }
                  const liQty = parseInt(li.quantity) || 0;
                  const over = liQty > remaining;
                  return (
                    <div key={li.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{product?.product_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{sublabel}</p>
                      </div>
                      <Input type="number" min="1" max={remaining} value={li.quantity} onChange={e => updateLineItem(li.id, e.target.value)} className={`w-20 ${over ? 'border-destructive' : ''}`} />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeLineItem(li.id)}><X className="w-4 h-4" /></Button>
                    </div>
                  );
                })}
              </div>
            )}
            {hasStock && (
              <div className="space-y-2">
                <div className="flex gap-1 rounded-md bg-muted p-1">
                  <button type="button" className={`flex-1 text-xs font-medium py-1 rounded ${allocationMode === 'fifo' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`} onClick={() => setAllocationMode('fifo')}>FIFO (auto)</button>
                  <button type="button" className={`flex-1 text-xs font-medium py-1 rounded ${allocationMode === 'manual' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`} onClick={() => setAllocationMode('manual')}>Choose batch</button>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    {allocationMode === 'manual' ? (
                      <Select value={newLineBatchId} onValueChange={setNewLineBatchId}>
                        <SelectTrigger><SelectValue placeholder="Select batch…" /></SelectTrigger>
                        <SelectContent>
                          {flatBatches.map(b => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.product_name} ({b.bottle_size_ml}ml) — Batch {b.batch_number} — {getRemainingBatchAvail(b.id)} btls
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select value={newLineProductKey} onValueChange={setNewLineProductKey}>
                        <SelectTrigger><SelectValue placeholder="Add product…" /></SelectTrigger>
                        <SelectContent>
                          {productOptions.map(opt => (
                            <SelectItem key={`${opt.product_name}||${opt.bottle_size_ml}`} value={`${opt.product_name}||${opt.bottle_size_ml}`}>
                              {opt.product_name} ({opt.bottle_size_ml}ml) — {getRemainingAvail(`${opt.product_name}||${opt.bottle_size_ml}`)} btls
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Input type="number" min="1" value={newLineQty} onChange={e => setNewLineQty(e.target.value)} className="w-20" placeholder="Qty" />
                  <Button variant="outline" size="icon" onClick={addLineItem} disabled={allocationMode === 'manual' ? !newLineBatchId || !newLineQty : !newLineProductKey || !newLineQty}><Plus className="w-4 h-4" /></Button>
                </div>
              </div>
            )}
            {!hasStock && <p className="text-sm text-muted-foreground text-center py-4">No stock available</p>}
            {hasOverStock && <p className="text-xs text-destructive mt-1">One or more items exceed available stock</p>}
          </div>

          {!isPickup && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Delivery Postcode</Label>
                  <Input value={form.delivery_postcode} onChange={e => setForm(f => ({ ...f, delivery_postcode: e.target.value }))} placeholder="e.g. 1010" className="mt-1" />
                </div>
                <div>
                  <Label>Transport Method</Label>
                  <Select value={form.transport_method} onValueChange={v => setForm(f => ({ ...f, transport_method: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="road">Road</SelectItem>
                      <SelectItem value="courier">Courier</SelectItem>
                      <SelectItem value="air">Air</SelectItem>
                      <SelectItem value="sea">Sea</SelectItem>
                      <SelectItem value="pickup">Pickup</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Distance (km)</Label>
                <div className="relative mt-1">
                  <Input type="number" min="0" value={form.transport_distance_km} onChange={e => setForm(f => ({ ...f, transport_distance_km: e.target.value }))} placeholder={calcingDistance ? 'Calculating…' : '0'} disabled={calcingDistance} />
                  {calcingDistance && <div className="absolute right-2.5 top-2.5"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}
                </div>
                {form.delivery_postcode && !calcingDistance && (
                  <button type="button" className="text-xs text-primary hover:underline mt-1" onClick={() => calculateDistance(form.delivery_postcode)}>Auto-calculate from postcode</button>
                )}
              </div>
            </>
          )}

          {isPickup && (
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <PackageCheck className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Picked up — no shipping CO2</span>
            </div>
          )}

          {!isPickup && form.transport_distance_km && totalWeightKg > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span>CO2e: <strong className="text-green-600">{co2ePreview.toFixed(2)} kg</strong></span>
            </div>
          )}

          <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes" className="mt-1" /></div>

          <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending || !canSubmit} className="w-full h-12 text-base font-semibold">
            {submitMutation.isPending ? 'Saving…' : `Record Sale (${totalBottles} bottles)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}