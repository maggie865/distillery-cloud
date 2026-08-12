import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PackageCheck, MapPin, Users, X, Plus, Building2, Gift } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import CustomerAutocomplete from '@/components/sales/CustomerAutocomplete.jsx';
import { calcWeightKg, calcCO2e, allocateBluffLineItems } from '@/lib/dispatchAllocation';
import { useProductStock } from '@/hooks/useProductStock';

const DEFAULT_DISTILLERY_ORIGIN = '250 Ocean Beach Road, Bluff, New Zealand';
const DEFAULT_WAREHOUSE_ADDRESS = '27 Pavillion Drive, Māngere, Auckland 2015, New Zealand';

const EMPTY_FORM = {
  dispatch_date: new Date().toISOString().split('T')[0],
  customer_name: '',
  customer_address: '',
  transport_distance_km: '',
  transport_method: 'road',
  status: 'dispatched',
  sample_dispatch: false,
  duty_free: false,
  is_export: false,
  notes: '',
};

export default function DispatchForm({ open, onClose, finishedGoods = [], warehouseStock = [], customers = [] }) {
  const [dispatchedFrom, setDispatchedFrom] = useState('Bluff');
  const [form, setForm] = useState(EMPTY_FORM);
  const [lineItems, setLineItems] = useState([]);
  const [newLineProductKey, setNewLineProductKey] = useState('');
  const [newLineWSId, setNewLineWSId] = useState('');
  const [newLineQty, setNewLineQty] = useState('');
  const [calcingDistance, setCalcingDistance] = useState(false);
  const [allocationMode, setAllocationMode] = useState('fifo');
  const [newLineBatchId, setNewLineBatchId] = useState('');

  const queryClient = useQueryClient();
  const { getStock } = useProductStock();

  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list('key', 100),
  });
  const distilleryAddress = appSettings.find(s => s.key === 'distillery_address')?.value || DEFAULT_DISTILLERY_ORIGIN;
  const warehouseAddress = appSettings.find(s => s.key === 'warehouse_address')?.value || DEFAULT_WAREHOUSE_ADDRESS;

  const ukWarehouseAddress = appSettings.find(s => s.key === 'uk_warehouse_address')?.value || '';
  const originAddress = dispatchedFrom === 'Bluff' ? distilleryAddress : (dispatchedFrom === 'UK Bonded' ? (ukWarehouseAddress || 'United Kingdom') : warehouseAddress);

  const sellableGoods = useMemo(
    () => finishedGoods.filter(fg => (fg.quantity_bottles || 0) > 0),
    [finishedGoods]
  );

  // Bluff: grouped by product+size, FIFO sorted batches
  const bluffProductOptions = useMemo(() => {
    const map = {};
    for (const fg of sellableGoods) {
      const key = `${fg.product_name}||${fg.bottle_size_ml || ''}`;
      const isTasting = fg.is_tasting === true || (fg.product_name || '').includes('Tasting');
      if (!map[key]) map[key] = { product_name: fg.product_name, bottle_size_ml: fg.bottle_size_ml || '', batches: [], isTasting };
      map[key].batches.push(fg);
    }
    return Object.values(map).map(opt => {
      let batchesWithAvail = opt.batches.map(fg => {
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
      // Other pending/picking/ready dispatches (e.g. an open Quick Order)
      // have already reserved some of this stock even though it hasn't
      // been physically deducted yet — consume it FIFO-first here too, so
      // this form can't oversell what's already spoken for.
      let reserved = getStock(opt.product_name, opt.bottle_size_ml, 'Bluff').reserved;
      if (reserved > 0) {
        batchesWithAvail = batchesWithAvail
          .map(b => {
            if (reserved <= 0) return b;
            const take = Math.min(b.available, reserved);
            reserved -= take;
            return { ...b, available: b.available - take };
          })
          .filter(b => b.available > 0);
      }
      return { ...opt, batches: batchesWithAvail, totalAvailable: batchesWithAvail.reduce((s, b) => s + b.available, 0) };
    }).filter(opt => opt.totalAvailable > 0);
  }, [sellableGoods, getStock]);

  const bluffBatches = useMemo(() => {
    const list = [];
    for (const opt of bluffProductOptions) {
      for (const b of opt.batches) {
        list.push({ ...b, productKey: `${opt.product_name}||${opt.bottle_size_ml}` });
      }
    }
    return list;
  }, [bluffProductOptions]);

  // 3PL: individual WarehouseStock records, filtered by the selected source location
  const threePLProductOptions = useMemo(() => {
    const loc = dispatchedFrom === 'UK Bonded' ? 'UK Bonded' : 'Auckland 3PL';
    const rows = warehouseStock
      .filter(ws => ws.status !== 'in_transit')
      .filter(ws => (ws.warehouse_location || 'Auckland 3PL') === loc)
      .map(ws => ({ ...ws, available: ws.quantity_bottles || 0 }))
      .filter(ws => ws.available > 0);

    // Same reservation-aware trim as Bluff, grouped by product+size since
    // reservations aren't tied to a specific warehouse_stock row.
    const reservedByProduct = {};
    return rows
      .map(ws => {
        const key = `${ws.product_name}||${ws.bottle_size_ml || ''}`;
        if (!(key in reservedByProduct)) reservedByProduct[key] = getStock(ws.product_name, ws.bottle_size_ml, loc).reserved;
        let reserved = reservedByProduct[key];
        if (reserved <= 0) return ws;
        const take = Math.min(ws.available, reserved);
        reservedByProduct[key] = reserved - take;
        return { ...ws, available: ws.available - take };
      })
      .filter(ws => ws.available > 0);
  }, [warehouseStock, dispatchedFrom, getStock]);

  const committedByProduct = useMemo(() => {
    const map = {};
    for (const li of lineItems) {
      const key = dispatchedFrom === 'Bluff' ? li.productKey : li.wsId;
      map[key] = (map[key] || 0) + (parseInt(li.quantity) || 0);
    }
    return map;
  }, [lineItems, dispatchedFrom]);

  const getRemainingAvail = (key) => {
    if (dispatchedFrom === 'Bluff') {
      const product = bluffProductOptions.find(p => `${p.product_name}||${p.bottle_size_ml}` === key);
      return product ? Math.max(0, product.totalAvailable - (committedByProduct[key] || 0)) : 0;
    }
    const ws = threePLProductOptions.find(w => w.id === key);
    return ws ? Math.max(0, ws.available - (committedByProduct[key] || 0)) : 0;
  };

  const committedByBatch = useMemo(() => {
    const map = {};
    for (const li of lineItems) {
      if (li.batchId) map[li.batchId] = (map[li.batchId] || 0) + (parseInt(li.quantity) || 0);
    }
    return map;
  }, [lineItems]);

  const getRemainingBatchAvail = (batchId) => {
    const batch = bluffBatches.find(b => b.id === batchId);
    return batch ? Math.max(0, batch.available - (committedByBatch[batchId] || 0)) : 0;
  };

  const totalBottles = lineItems.reduce((s, li) => s + (parseInt(li.quantity) || 0), 0);
  const totalWeightKg = lineItems.reduce((s, li) => {
    if (dispatchedFrom === 'Bluff') {
      const product = bluffProductOptions.find(p => `${p.product_name}||${p.bottle_size_ml}` === li.productKey);
      return s + (product ? calcWeightKg(product.bottle_size_ml, parseInt(li.quantity) || 0) : 0);
    }
    const ws = threePLProductOptions.find(w => w.id === li.wsId);
    return s + (ws ? calcWeightKg(ws.bottle_size_ml, parseInt(li.quantity) || 0) : 0);
  }, 0);
  const hasOverStock = lineItems.some(li => {
    if (dispatchedFrom === 'Bluff' && li.batchId) {
      return (committedByBatch[li.batchId] || 0) > (bluffBatches.find(b => b.id === li.batchId)?.available || 0);
    }
    const key = dispatchedFrom === 'Bluff' ? li.productKey : li.wsId;
    const totalAvail = dispatchedFrom === 'Bluff'
      ? (bluffProductOptions.find(p => `${p.product_name}||${p.bottle_size_ml}` === key)?.totalAvailable || 0)
      : (threePLProductOptions.find(w => w.id === key)?.available || 0);
    return (committedByProduct[key] || 0) > totalAvail;
  });
  const canSubmit = lineItems.length > 0 && !hasOverStock && totalBottles > 0 && !!form.customer_name;

  const handleSourceChange = (value) => {
    setDispatchedFrom(value);
    setLineItems([]);
    setNewLineProductKey('');
    setNewLineWSId('');
    setNewLineBatchId('');
    setAllocationMode('fifo');
    setNewLineQty('');
    setForm(f => ({ ...f, transport_distance_km: '' }));
  };

  const addLineItem = () => {
    if (!newLineQty) return;
    const qty = parseInt(newLineQty) || 0;
    if (qty <= 0) return;
    if (dispatchedFrom === 'Bluff') {
      if (allocationMode === 'manual') {
        if (!newLineBatchId) return;
        const batch = bluffBatches.find(b => b.id === newLineBatchId);
        setLineItems(prev => [...prev, { id: Date.now() + Math.random(), productKey: batch.productKey, batchId: newLineBatchId, quantity: String(qty) }]);
        setNewLineBatchId('');
      } else {
        if (!newLineProductKey) return;
        setLineItems(prev => [...prev, { id: Date.now() + Math.random(), productKey: newLineProductKey, quantity: String(qty) }]);
        setNewLineProductKey('');
      }
    } else {
      if (!newLineWSId) return;
      setLineItems(prev => [...prev, { id: Date.now() + Math.random(), wsId: newLineWSId, quantity: String(qty) }]);
      setNewLineWSId('');
    }
    setNewLineQty('');
  };

  const updateLineItem = (id, field, value) => setLineItems(prev => prev.map(li => li.id === id ? { ...li, [field]: value } : li));
  const removeLineItem = (id) => setLineItems(prev => prev.filter(li => li.id !== id));

  const calculateDistance = async (customerAddress) => {
    if (!customerAddress) return;
    setCalcingDistance(true);
    try {
      const res = await base44.functions.invoke('getDistanceMatrix', { origin: originAddress, destination: customerAddress });
      if (res.data?.distance_km) {
        setForm(f => ({ ...f, transport_distance_km: String(res.data.distance_km) }));
        toast.success(`Distance: ${res.data.distance_km} km (${res.data.duration_text})`);
      }
    } catch {
      toast.error('Could not calculate distance — enter manually');
    } finally {
      setCalcingDistance(false);
    }
  };

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setLineItems([]);
    setNewLineProductKey('');
    setNewLineWSId('');
    setNewLineBatchId('');
    setAllocationMode('fifo');
    setNewLineQty('');
    setDispatchedFrom('Bluff');
    onClose();
  };

  const dispatchMutation = useMutation({
    mutationFn: async () => {
      const distanceKm = parseFloat(form.transport_distance_km) || 0;
      const transportMethod = form.transport_method;
      // Physical stock only ever moves once a dispatch is actually
      // 'dispatched' — Pending/Picking/Ready reserve the line items (they
      // already count against availability via useProductStock) without
      // touching finished_good/warehouse_stock yet. See DispatchHub's
      // status-transition handling for the deduct-on-dispatched /
      // restore-on-leaving-dispatched logic that mirrors this.
      const deductsStock = form.status === 'dispatched';

      if (dispatchedFrom === 'Bluff') {
        const allAllocations = allocateBluffLineItems(lineItems, bluffProductOptions, { distanceKm, transportMethod });

        for (const a of allAllocations) {
          await db.Dispatch.create({
            ...form,
            product_name: a.batch.product_name,
            batch_number: a.batch.batch_number,
            bottle_size_ml: a.batch.bottle_size_ml || null,
            quantity_bottles: a.take,
            transport_distance_km: distanceKm,
            total_lals: parseFloat(a.lals.toFixed(4)),
            parcel_weight_kg: a.weightKg,
            co2e_kg: a.co2e,
            dispatched_from: 'Bluff',
            sample_dispatch: form.sample_dispatch === true,
            duty_free: form.duty_free === true,
            is_export: form.is_export === true,
          });
          if (!deductsStock) continue;
          const newQty = (a.batch.quantity_bottles || 0) - a.take;
          const newLals = Math.max(0, (a.batch.total_lals || 0) - parseFloat(a.lals.toFixed(4)));
          if (newQty <= 0) await db.FinishedGood.delete(a.batch.id);
          else await db.FinishedGood.update(a.batch.id, { quantity_bottles: newQty, total_lals: parseFloat(newLals.toFixed(4)) });
        }
      } else {
        // Auckland 3PL or UK Bonded — dispatched_from reflects the chosen source
        for (const li of lineItems) {
          const ws = warehouseStock.find(w => w.id === li.wsId);
          if (!ws) continue;
          const qty = parseInt(li.quantity) || 0;
          const lals = ((qty * (ws.bottle_size_ml || 700)) / 1000) * (ws.abv_percent || 0) / 100;
          const weight = calcWeightKg(ws.bottle_size_ml, qty);
          const co2e = calcCO2e(distanceKm, weight, transportMethod);
          await db.Dispatch.create({
            dispatch_date: form.dispatch_date, customer_name: form.customer_name, customer_address: form.customer_address,
            product_name: ws.product_name, batch_number: ws.batch_number, bottle_size_ml: ws.bottle_size_ml,
            quantity_bottles: qty, total_lals: parseFloat(lals.toFixed(4)), parcel_weight_kg: weight,
            transport_distance_km: distanceKm || undefined, transport_method: transportMethod,
            co2e_kg: co2e > 0 ? parseFloat(co2e.toFixed(3)) : undefined, status: form.status || 'dispatched',
            sample_dispatch: form.sample_dispatch === true, duty_free: form.duty_free === true, is_export: form.is_export === true, notes: form.notes || undefined, dispatched_from: dispatchedFrom,
          });
          if (!deductsStock) continue;
          const newQty = Math.max(0, ws.quantity_bottles - qty);
          const newLals = Math.max(0, (ws.total_lals || 0) - lals);
          await db.WarehouseStock.update(ws.id, { quantity_bottles: newQty, total_lals: parseFloat(newLals.toFixed(4)) });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({ queryKey: ['dispatches-all'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      queryClient.invalidateQueries({ queryKey: ['warehouseStock'] });
      handleClose();
      toast.success(`${lineItems.length} product(s) dispatched from ${dispatchedFrom === 'Bluff' ? 'Bluff Distillery' : dispatchedFrom}`);
    },
    onError: (err) => toast.error(err.message || 'Failed to record dispatch'),
  });

  const hasStock = dispatchedFrom === 'Bluff' ? bluffProductOptions.length > 0 : threePLProductOptions.length > 0;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Record Dispatch</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>Dispatching From</Label>
            <Select value={dispatchedFrom} onValueChange={handleSourceChange}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Bluff"><span className="flex items-center gap-2"><Building2 className="w-4 h-4" /> Bluff Distillery</span></SelectItem>
                <SelectItem value="Auckland 3PL"><span className="flex items-center gap-2"><Building2 className="w-4 h-4" /> Auckland 3PL Warehouse</span></SelectItem>
                <SelectItem value="UK Bonded"><span className="flex items-center gap-2"><Building2 className="w-4 h-4" /> UK Bonded Warehouse</span></SelectItem>
              </SelectContent>
            </Select>
            {dispatchedFrom === 'UK Bonded' && (
              <p className="text-xs text-blue-600 mt-1">Stock dispatched from the UK is under bond — no NZ excise applies. Dispatches are automatically excluded from excise reporting.</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Products</Label>
              {lineItems.length > 0 && <span className="text-xs text-muted-foreground">{totalBottles} bottles • {totalWeightKg} kg</span>}
            </div>
            {lineItems.length > 0 && (
              <div className="space-y-2 mb-3">
                {lineItems.map((li) => {
                  let remaining, label, sublabel;
                  if (dispatchedFrom === 'Bluff') {
                    const product = bluffProductOptions.find(p => `${p.product_name}||${p.bottle_size_ml}` === li.productKey);
                    label = product?.product_name || 'Unknown';
                    if (li.batchId) {
                      const batch = bluffBatches.find(b => b.id === li.batchId);
                      remaining = getRemainingBatchAvail(li.batchId);
                      sublabel = `${product?.bottle_size_ml}ml • Batch ${batch?.batch_number} • ${remaining} available`;
                    } else {
                      remaining = getRemainingAvail(li.productKey);
                      sublabel = `${product?.bottle_size_ml}ml • ${remaining} available`;
                    }
                  } else {
                    const ws = threePLProductOptions.find(w => w.id === li.wsId);
                    label = ws?.product_name || 'Unknown';
                    remaining = getRemainingAvail(li.wsId);
                    sublabel = `${ws?.bottle_size_ml}ml • Batch ${ws?.batch_number} • ${remaining} available`;
                  }
                  const liQty = parseInt(li.quantity) || 0;
                  const over = liQty > remaining;
                  return (
                    <div key={li.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{label}</p>
                        <p className="text-xs text-muted-foreground">{sublabel}</p>
                      </div>
                      <Input type="number" min="1" max={remaining} value={li.quantity} onChange={e => updateLineItem(li.id, 'quantity', e.target.value)} className={`w-20 ${over ? 'border-destructive' : ''}`} />
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeLineItem(li.id)}><X className="w-4 h-4" /></Button>
                    </div>
                  );
                })}
              </div>
            )}
            {hasStock && (
              <div className="space-y-2">
                {dispatchedFrom === 'Bluff' && (
                  <div className="flex gap-1 rounded-md bg-muted p-1">
                    <button type="button" className={`flex-1 text-xs font-medium py-1 rounded ${allocationMode === 'fifo' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`} onClick={() => setAllocationMode('fifo')}>FIFO (auto)</button>
                    <button type="button" className={`flex-1 text-xs font-medium py-1 rounded ${allocationMode === 'manual' ? 'bg-background shadow-sm' : 'text-muted-foreground'}`} onClick={() => setAllocationMode('manual')}>Choose batch</button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    {dispatchedFrom === 'Bluff' ? (
                      allocationMode === 'manual' ? (
                        <Select value={newLineBatchId} onValueChange={setNewLineBatchId}>
                          <SelectTrigger><SelectValue placeholder="Select batch…" /></SelectTrigger>
                          <SelectContent>
                            {bluffBatches.map(b => (
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
                            {bluffProductOptions.map(opt => (
                              <SelectItem key={`${opt.product_name}||${opt.bottle_size_ml}`} value={`${opt.product_name}||${opt.bottle_size_ml}`}>
                                {opt.product_name}{opt.isTasting ? ' 🧪 Tasting' : ''} ({opt.bottle_size_ml}ml) — {getRemainingAvail(`${opt.product_name}||${opt.bottle_size_ml}`)} btls
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )
                    ) : (
                      <Select value={newLineWSId} onValueChange={setNewLineWSId}>
                        <SelectTrigger><SelectValue placeholder="Add product…" /></SelectTrigger>
                        <SelectContent>
                          {threePLProductOptions.map(ws => (
                            <SelectItem key={ws.id} value={ws.id}>
                              {ws.product_name} — Batch {ws.batch_number} ({getRemainingAvail(ws.id)} btls)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <Input type="number" min="1" value={newLineQty} onChange={e => setNewLineQty(e.target.value)} className="w-20" placeholder="Qty" />
                  <Button variant="outline" size="icon" onClick={addLineItem} disabled={dispatchedFrom === 'Bluff' ? (allocationMode === 'manual' ? !newLineBatchId || !newLineQty : !newLineProductKey || !newLineQty) : !newLineWSId || !newLineQty}><Plus className="w-4 h-4" /></Button>
                </div>
              </div>
            )}
            {!hasStock && <p className="text-sm text-muted-foreground text-center py-4">No stock available at this location</p>}
            {hasOverStock && <p className="text-xs text-destructive mt-1">One or more items exceed available stock</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Customer</Label>
              <Link to="/customers" className="text-xs text-primary hover:underline flex items-center gap-1"><Users className="w-3 h-3" /> Manage customers</Link>
            </div>
            <CustomerAutocomplete
              customers={customers} value={form.customer_name}
              onSelect={v => setForm(f => ({ ...f, customer_name: v }))}
              onAddressChange={addr => { setForm(f => ({ ...f, customer_address: addr })); if (addr) calculateDistance(addr); }}
            />
            {form.customer_address && <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1"><MapPin className="w-3 h-3" /> {form.customer_address}</p>}
          </div>

          <div><Label>Dispatch Date</Label><Input type="date" value={form.dispatch_date} onChange={e => setForm(f => ({ ...f, dispatch_date: e.target.value }))} className="mt-1" /></div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Transport Method</Label>
              <Select value={form.transport_method} onValueChange={v => setForm(f => ({ ...f, transport_method: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="road">Road</SelectItem><SelectItem value="courier">Courier</SelectItem>
                  <SelectItem value="air">Air</SelectItem><SelectItem value="sea">Sea</SelectItem><SelectItem value="pickup">Pickup</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Distance (km)</Label>
              <div className="relative mt-1">
                <Input type="number" min="0" value={form.transport_distance_km} onChange={e => setForm(f => ({ ...f, transport_distance_km: e.target.value }))} placeholder={calcingDistance ? 'Calculating…' : '0'} disabled={calcingDistance || form.transport_method === 'pickup'} />
                {calcingDistance && <div className="absolute right-2.5 top-2.5"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}
              </div>
              {form.customer_address && !calcingDistance && form.transport_method !== 'pickup' && (
                <button type="button" className="text-xs text-primary hover:underline mt-1" onClick={() => calculateDistance(form.customer_address)}>Auto-calculate from address</button>
              )}
            </div>
          </div>

          <Button type="button" variant={form.transport_method === 'pickup' ? 'default' : 'outline'} className="w-full gap-2"
            onClick={() => setForm(f => ({ ...f, transport_method: f.transport_method === 'pickup' ? 'road' : 'pickup', transport_distance_km: f.transport_method === 'pickup' ? '' : '0' }))}>
            <PackageCheck className="w-4 h-4" />
            {form.transport_method === 'pickup' ? 'Picked Up — No Shipping CO2' : 'Mark as Picked Up (No Shipping)'}
          </Button>

          <div>
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="picking">Picking</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="dispatched">Dispatched</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div><Label>Notes</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any additional notes" className="mt-1" /></div>

          <div className="flex items-start gap-2 rounded-lg border border-border p-3">
            <Checkbox
              checked={form.sample_dispatch || false}
              onCheckedChange={v => setForm(f => ({ ...f, sample_dispatch: v === true }))}
              className="mt-0.5"
            />
            <div>
              <Label className="flex items-center gap-1.5 cursor-pointer"><Gift className="w-3.5 h-3.5" /> Mark as sample / promotional</Label>
              {form.sample_dispatch && <p className="text-xs text-amber-600 mt-0.5">Samples are taxable at standard rates — shown for reference in the excise return.</p>}
            </div>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Checkbox
                checked={form.duty_free || false}
                onCheckedChange={v => setForm(f => ({ ...f, duty_free: v === true, is_export: v === true ? false : f.is_export }))}
                className="mt-0.5"
              />
              <Label className="cursor-pointer">Duty Free dispatch</Label>
            </div>
            <div className="flex items-start gap-2">
              <Checkbox
                checked={form.is_export || false}
                onCheckedChange={v => setForm(f => ({ ...f, is_export: v === true, duty_free: v === true ? false : f.duty_free }))}
                className="mt-0.5"
              />
              <Label className="cursor-pointer">Export / Overseas dispatch</Label>
            </div>
            {form.duty_free && <p className="text-xs text-blue-600">Duty free — excise exempt. Will be excluded from excise return.</p>}
            {form.is_export && <p className="text-xs text-blue-600">Export dispatch — excise exempt. Will be excluded from excise return.</p>}
          </div>

          <Button onClick={() => dispatchMutation.mutate()} disabled={dispatchMutation.isPending || !canSubmit} className="w-full h-12 text-base font-semibold">
            {dispatchMutation.isPending ? 'Saving…' : `Record Dispatch (${totalBottles} bottles${dispatchedFrom === 'Bluff' ? allocationMode === 'fifo' ? ', FIFO' : ', Manual' : ''})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}