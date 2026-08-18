import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Truck, PackageCheck, MapPin, Trash2, Search, Map, Pencil, RotateCcw, ArrowRightLeft, Plus, Store, FileCheck } from 'lucide-react';
import MobileCard, { MobileCardGrid, MobileDetailRow } from '@/components/shared/MobileCard';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import Pagination from '@/components/ui/Pagination';
import DispatchForm from '@/components/dispatch/DispatchForm.jsx';
import BatchPicker from '@/components/dispatch/BatchPicker.jsx';
import DirectSalesForm from '@/components/dispatch/DirectSalesForm.jsx';
import StockLocationDialog from '@/components/dispatch/StockLocationDialog.jsx';
import TransferTo3PLDialog from '@/components/dispatch/TransferTo3PLDialog.jsx';
import ExciseFlags from '@/components/dispatch/ExciseFlags.jsx';
import DeliveryMap from '@/components/sales/DeliveryMap';
import { buildBluffProductOptions, allocateBluffLineItems } from '@/lib/dispatchAllocation';

const DISTILLERY_ORIGIN = '250 Ocean Beach Road, Bluff, New Zealand';
const WAREHOUSE_ADDRESS = '27 Pavillion Drive, Māngere, Auckland 2015, New Zealand';
const CHANNEL_LABELS = { wholesale: 'Wholesale', cellar_door: 'Cellar Door', shopify: 'Shopify', airpoints: 'Airpoints', website: 'Website', other: 'Other' };
// Physical stock is only ever committed (deducted) once a dispatch reaches
// one of these statuses; Pending/Picking/Ready reserve the line item (see
// useProductStock) without touching finished_good/warehouse_stock. A
// dispatch transitioning INTO this set deducts stock for the first time;
// transitioning OUT of it restores what was deducted.
const DEDUCTED_STATUSES = new Set(['dispatched', 'delivered']);
// Cancelling only makes sense before stock has actually gone out — once a
// dispatch is Dispatched/Delivered, "Return stock" is the correct undo path.
const CANCELLABLE_STATUSES = new Set(['pending', 'picking', 'ready']);

const calcCO2e = (distanceKm, weightKg, method) => {
  if (!distanceKm || !weightKg || !method) return 0;
  const factors = { road: 0.12, courier: 0.12, air: 0.9, sea: 0.01, pickup: 0 };
  return parseFloat(((distanceKm * weightKg / 1000) * (factors[method] || 0)).toFixed(3));
};

export default function DispatchHub() {
  const [showForm, setShowForm] = useState(false);
  const [showDirectSalesForm, setShowDirectSalesForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterChannel, setFilterChannel] = useState('all');
  const [showMap, setShowMap] = useState(false);
  const [showTransfer3PL, setShowTransfer3PL] = useState(false);
  const [stockLocation, setStockLocation] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [editingDispatch, setEditingDispatch] = useState(null);
  const [editForm, setEditForm] = useState({});
  const editFormRef = useRef({});
  // Keep ref in sync with state so Save button always uses latest values
  useEffect(() => { editFormRef.current = editForm; }, [editForm]);
  const [editCalcingDistance, setEditCalcingDistance] = useState(false);
  const [returningDispatch, setReturningDispatch] = useState(null);
  const [deletingDispatch, setDeletingDispatch] = useState(null);

  const queryClient = useQueryClient();

  const { data: finishedGoods = [] } = useQuery({ queryKey: ['finishedGoods'], queryFn: () => db.FinishedGood.list('-created_at', 5000) });
  const { data: warehouseStock = [] } = useQuery({ queryKey: ['warehouseStock'], queryFn: () => db.WarehouseStock.list('-date_transferred_in', 5000) });
  const { data: allDispatches = [] } = useQuery({ queryKey: ['dispatches-all'], queryFn: () => db.Dispatch.list('-dispatch_date', 5000) });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => db.Customer.list('business_name', 5000) });
  // Client-side pagination — allDispatches already loaded above

  const totalBottlesDispatched = allDispatches.reduce((s, d) => s + (d.quantity_bottles || 0), 0);
  const totalLalsDispatched = allDispatches.reduce((s, d) => s + (d.total_lals || 0), 0);
  const totalCO2e = allDispatches.reduce((s, d) => s + (d.co2e_kg || 0), 0);
  const bluffBottles = finishedGoods.reduce((s, fg) => s + (fg.quantity_bottles || 0), 0);
  const warehouseBottles = warehouseStock.reduce((s, w) => s + (w.quantity_bottles || 0), 0);

  const filtered = allDispatches
    .filter(d => { if (!search) return true; const s = search.toLowerCase(); return d.customer_name?.toLowerCase().includes(s) || d.product_name?.toLowerCase().includes(s) || d.batch_number?.toLowerCase().includes(s); })
    .filter(d => filterSource === 'all' || (d.dispatched_from || 'Bluff') === filterSource)
    .filter(d => filterStatus === 'all' || d.status === filterStatus)
    .filter(d => {
      if (filterChannel === 'all') return true;
      if (filterChannel === 'wholesale') return !d.sales_channel || d.sales_channel === 'wholesale';
      return d.sales_channel === filterChannel;
    })
    .sort((a, b) => new Date(b.dispatch_date) - new Date(a.dispatch_date));

  const handleSearch = (val) => { setSearch(val); setPage(1); };

  const pagedFiltered = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Exact-match deduction/restore — for a dispatch row that already has a
  // batch_number assigned (the normal case: DispatchForm always assigns a
  // batch at creation, whether FIFO or manually chosen, regardless of the
  // status picked). This only ever runs when a dispatch is transitioning
  // into or out of {dispatched, delivered} (see DEDUCTED_STATUSES) — not on
  // every edit — so "Pending" no longer silently moves physical stock.
  const depleteStock = async (dispatch) => {
    const from = dispatch.dispatched_from || 'Bluff';
    const is3PL = from === 'Auckland 3PL' || from === 'UK Bonded';
    const qty = dispatch.quantity_bottles || 0;
    const lals = dispatch.total_lals || 0;
    if (is3PL) {
      const loc = from === 'UK Bonded' ? 'UK Bonded' : 'Auckland 3PL';
      // .find() returns a single row (or undefined), not an array — was
      // being checked with .length/[0] as if it were one, which threw
      // whenever no matching row existed (e.g. a freshly-approved Xero
      // dispatch whose manually-typed product/batch doesn't exactly match
      // any real warehouse_stock row) and crashed the whole save silently.
      const existing = (await db.WarehouseStock.filter({ product_name: dispatch.product_name, batch_number: dispatch.batch_number }))
        .find(w => (w.warehouse_location || 'Auckland 3PL') === loc);
      if (existing) {
        const newQty = Math.max(0, (existing.quantity_bottles || 0) - qty);
        const newLals = parseFloat(((existing.total_lals || 0) - lals).toFixed(4));
        await db.WarehouseStock.update(existing.id, { quantity_bottles: newQty, total_lals: newLals });
      } else {
        toast.warning(`No matching 3PL stock found for ${dispatch.product_name} batch ${dispatch.batch_number} at ${loc} — dispatch saved, but no warehouse quantity was decremented.`);
      }
    } else {
      const allFG = await db.FinishedGood.list('product_name', 5000);
      const fg = allFG.find(g => g.product_name === dispatch.product_name && g.batch_number === dispatch.batch_number && Number(g.bottle_size_ml) === Number(dispatch.bottle_size_ml));
      if (fg) {
        const newQty = (fg.quantity_bottles || 0) - qty;
        const newLals = parseFloat(((fg.total_lals || 0) - lals).toFixed(4));
        if (newQty <= 0) await db.FinishedGood.delete(fg.id);
        else await db.FinishedGood.update(fg.id, { quantity_bottles: newQty, total_lals: newLals });
      }
    }
  };

  // A Quick-Order-created dispatch has no batch_number yet (Quick Order is
  // product/quantity, not batch-level — it just reserves against the
  // product as a whole). The first time such a row transitions into
  // 'dispatched', a real batch has to be picked for the first time, using
  // the same FIFO allocator DispatchForm itself uses. If the quantity spans
  // more than one batch, the extra portion becomes additional dispatch rows
  // (order_id preserved) — mirroring how DispatchForm already creates one
  // row per batch allocation for a manually-entered multi-batch dispatch.
  // Returns the fields to merge into THIS row's update payload; the caller
  // is responsible for actually saving them (so it happens in the same
  // update as the rest of the edited form, not a second racing write).
  const allocateBluffBatchForDispatch = async (dispatch) => {
    const productOptions = buildBluffProductOptions(finishedGoods);
    const [first, ...rest] = allocateBluffLineItems(
      [{ productKey: `${dispatch.product_name}||${dispatch.bottle_size_ml || ''}`, quantity: dispatch.quantity_bottles }],
      productOptions,
      { distanceKm: dispatch.transport_distance_km || 0, transportMethod: dispatch.transport_method }
    );
    if (!first) throw new Error(`No stock available for ${dispatch.product_name}`);

    const depleteBatch = async (batch, take, lals) => {
      const newQty = (batch.quantity_bottles || 0) - take;
      const newLals = Math.max(0, (batch.total_lals || 0) - parseFloat(lals.toFixed(4)));
      if (newQty <= 0) await db.FinishedGood.delete(batch.id);
      else await db.FinishedGood.update(batch.id, { quantity_bottles: newQty, total_lals: parseFloat(newLals.toFixed(4)) });
    };

    await depleteBatch(first.batch, first.take, first.lals);
    for (const a of rest) {
      const { id, created_at, ...rowRest } = dispatch;
      await db.Dispatch.create({
        ...rowRest,
        batch_number: a.batch.batch_number,
        quantity_bottles: a.take,
        total_lals: parseFloat(a.lals.toFixed(4)),
        parcel_weight_kg: a.weightKg,
        co2e_kg: a.co2e,
        status: 'dispatched',
      });
      await depleteBatch(a.batch, a.take, a.lals);
    }

    return {
      batch_number: first.batch.batch_number,
      quantity_bottles: first.take,
      total_lals: parseFloat(first.lals.toFixed(4)),
      parcel_weight_kg: first.weightKg,
      co2e_kg: first.co2e,
    };
  };

  const stockFieldsChanged = (orig, data) => {
    return orig.batch_number !== data.batch_number ||
      orig.product_name !== data.product_name ||
      Number(orig.bottle_size_ml) !== Number(data.bottle_size_ml) ||
      Number(orig.quantity_bottles) !== Number(data.quantity_bottles) ||
      (orig.dispatched_from || 'Bluff') !== (data.dispatched_from || 'Bluff');
  };

  const editMutation = useMutation({
    mutationFn: async (data) => {
      let co2e = data.co2e_kg || editingDispatch.co2e_kg || 0;
      const distance = data.transport_distance_km || editingDispatch.transport_distance_km || 0;
      const weight = data.parcel_weight_kg || editingDispatch.parcel_weight_kg || 0;
      const method = data.transport_method || editingDispatch.transport_method;
      if (distance && weight && method) co2e = calcCO2e(distance, weight, method);
      const cleanData = Object.fromEntries(Object.entries({ ...data, co2e_kg: co2e }).filter(([, v]) => v !== ''));
      // Ensure boolean flags are always saved as explicit booleans, not undefined/null
      // Force explicit boolean save — Base44 SDK may skip false values
      // so we explicitly include them in the update payload
      const flagPayload = {
        sample_dispatch: data.sample_dispatch === true,
        duty_free: data.duty_free === true,
        is_export: data.is_export === true,
      };
      Object.assign(cleanData, flagPayload);

      // Physical stock moves only on transition into/out of {dispatched,
      // delivered} — not on every edit, and not based on which fields
      // changed (that old rule is exactly what let a 'pending' dispatch
      // silently deduct stock at creation).
      const oldStatus = editingDispatch.status || 'pending';
      const newStatus = data.status || oldStatus;
      const wasDeducted = DEDUCTED_STATUSES.has(oldStatus);
      const willDeduct = DEDUCTED_STATUSES.has(newStatus);
      const merged = { ...editingDispatch, ...data };

      if (wasDeducted && !willDeduct) {
        // Leaving Dispatched/Delivered (e.g. reverting to Pending) — release
        // what was actually deducted, using the OLD row's known batch.
        await restoreStock(editingDispatch);
      } else if (!wasDeducted && willDeduct) {
        // Entering Dispatched/Delivered for the first time — deduct now.
        const isBluff = (merged.dispatched_from || 'Bluff') === 'Bluff';
        if (isBluff && !merged.batch_number) {
          Object.assign(cleanData, await allocateBluffBatchForDispatch(merged));
        } else {
          await depleteStock(merged);
        }
      } else if (wasDeducted && willDeduct && stockFieldsChanged(editingDispatch, data)) {
        // Already deducted on both sides, but which batch/product/qty
        // changed — undo the old deduction and redo it against the new one.
        await restoreStock(editingDispatch);
        await depleteStock(merged);
      }

      // Merge flags separately to guarantee they are always sent
      const finalPayload = { ...cleanData, ...flagPayload };
      // Save main fields first
      await db.Dispatch.update(editingDispatch.id, finalPayload);
      // Then force boolean flags in a separate update call to ensure they are not skipped
      const flagResult = await db.Dispatch.update(editingDispatch.id, {
        sample_dispatch: flagPayload.sample_dispatch,
        duty_free: flagPayload.duty_free,
        is_export: flagPayload.is_export,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches'] });
      queryClient.invalidateQueries({ queryKey: ['dispatches-all'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      queryClient.invalidateQueries({ queryKey: ['warehouseStock'] });
      // Force refetch to ensure we see the saved values not stale cache
      queryClient.refetchQueries({ queryKey: ['dispatches'] });
      queryClient.refetchQueries({ queryKey: ['dispatches-all'] });
      setEditingDispatch(null);
      toast.success('Dispatch updated');
    },
    onError: () => toast.error('Failed to save changes'),
  });

  const calculateEditDistance = async (address) => {
    if (!address) return;
    setEditCalcingDistance(true);
    try {
      const origin = editForm.dispatched_from === 'Auckland 3PL' ? WAREHOUSE_ADDRESS : (editForm.dispatched_from === 'UK Bonded' ? 'United Kingdom' : DISTILLERY_ORIGIN);
      const res = await base44.functions.invoke('getDistanceMatrix', { origin, destination: address });
      if (res.data?.distance_km) setEditForm(f => ({ ...f, transport_distance_km: String(res.data.distance_km) }));
    } catch { toast.error('Could not calculate distance'); } finally { setEditCalcingDistance(false); }
  };

  const restoreStock = async (dispatch) => {
    const from = dispatch.dispatched_from || 'Bluff';
    const is3PL = from === 'Auckland 3PL' || from === 'UK Bonded';
    if (is3PL) {
      const loc = from === 'UK Bonded' ? 'UK Bonded' : 'Auckland 3PL';
      const existing = (await db.WarehouseStock.filter({ product_name: dispatch.product_name, batch_number: dispatch.batch_number }))
        .find(w => (w.warehouse_location || 'Auckland 3PL') === loc);
      if (existing) {
        await db.WarehouseStock.update(existing.id, { quantity_bottles: (existing.quantity_bottles || 0) + (dispatch.quantity_bottles || 0), total_lals: parseFloat(((existing.total_lals || 0) + (dispatch.total_lals || 0)).toFixed(4)) });
      } else {
        await db.WarehouseStock.create({ product_name: dispatch.product_name, batch_number: dispatch.batch_number, bottle_size_ml: dispatch.bottle_size_ml, quantity_bottles: dispatch.quantity_bottles, total_lals: dispatch.total_lals, warehouse_location: loc });
      }
    } else {
      const allFG = await db.FinishedGood.list('product_name', 5000);
      const fg = allFG.find(g => g.product_name === dispatch.product_name && g.batch_number === dispatch.batch_number && Number(g.bottle_size_ml) === Number(dispatch.bottle_size_ml));
      if (fg) {
        await db.FinishedGood.update(fg.id, { quantity_bottles: (fg.quantity_bottles || 0) + (dispatch.quantity_bottles || 0), total_lals: parseFloat(((fg.total_lals || 0) + (dispatch.total_lals || 0)).toFixed(4)) });
      } else {
        await db.FinishedGood.create({ product_name: dispatch.product_name, batch_number: dispatch.batch_number, bottle_size_ml: dispatch.bottle_size_ml, quantity_bottles: dispatch.quantity_bottles, total_lals: dispatch.total_lals });
      }
    }
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['dispatches'] });
    queryClient.invalidateQueries({ queryKey: ['dispatches-all'] });
    queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
    queryClient.invalidateQueries({ queryKey: ['warehouseStock'] });
  };

  const returnMutation = useMutation({
    mutationFn: async (dispatch) => {
      // Only restore physical stock if this row actually had any deducted —
      // a still-Pending/Picking/Ready row was only ever reserved.
      if (DEDUCTED_STATUSES.has(dispatch.status)) await restoreStock(dispatch);
      await db.Dispatch.update(dispatch.id, { status: 'pending', notes: (dispatch.notes ? dispatch.notes + ' [RETURNED]' : '[RETURNED]') });
    },
    onSuccess: () => { invalidateAll(); setReturningDispatch(null); toast.success('Stock returned'); },
    onError: (err) => toast.error(err.message || 'Failed to return stock'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (dispatch) => {
      if (DEDUCTED_STATUSES.has(dispatch.status)) await restoreStock(dispatch);
      await db.Dispatch.delete(dispatch.id);
    },
    onSuccess: () => { invalidateAll(); setDeletingDispatch(null); toast.success('Dispatch deleted and stock restored'); },
    onError: (err) => toast.error(err.message || 'Failed to delete dispatch'),
  });

  const recalcMutation = useMutation({
    mutationFn: async () => { return await base44.functions.invoke('recalculateFinishedGoodStock', {}); },
    onSuccess: (res) => {
      invalidateAll();
      const d = res?.data || res;
      toast.success(`Stock recalculated: ${d.records_updated} updated, ${d.records_deleted} removed`);
    },
    onError: () => toast.error('Failed to recalculate stock'),
  });

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Sales & Dispatch" subtitle="Record dispatches, track stock by location, and manage deliveries">
        <Button variant="outline" onClick={() => setShowMap(v => !v)} className="gap-2 hidden md:inline-flex"><Map className="w-4 h-4" />{showMap ? 'Hide Map' : 'Delivery Map'}</Button>
        <Button onClick={() => setShowTransfer3PL(true)} className="gap-2"><ArrowRightLeft className="w-4 h-4" />Transfer to 3PL</Button>
        <Button variant="outline" onClick={() => setShowForm(true)} className="gap-2"><Truck className="w-4 h-4" />Wholesale</Button>
        <Button onClick={() => setShowDirectSalesForm(true)} className="gap-2"><Store className="w-4 h-4" />Direct Sale</Button>
        <Button variant="outline" onClick={() => recalcMutation.mutate()} disabled={recalcMutation.isPending} className="gap-2"><RotateCcw className="w-4 h-4" />{recalcMutation.isPending ? 'Recalculating...' : 'Recalc Stock'}</Button>
      </PageHeader>

      {showMap && <div className="mb-6"><DeliveryMap dispatches={allDispatches} customers={customers} distilleryOrigin={DISTILLERY_ORIGIN} /></div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total Dispatched', value: totalBottlesDispatched.toLocaleString(), sub: 'bottles', icon: PackageCheck, color: 'text-primary', bg: 'bg-accent border-accent-foreground/10' },
          { label: 'Total LALs Sold', value: totalLalsDispatched.toFixed(2), sub: 'litres abs. alcohol', icon: Truck, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
          { label: 'Total CO2e', value: totalCO2e.toFixed(1), sub: 'kg emissions', icon: Truck, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
        ].map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className={`rounded-xl border p-4 flex flex-col gap-1 ${bg}`}>
            <div className="flex items-center gap-2"><Icon className={`w-4 h-4 ${color}`} /><span className="text-xs font-medium text-muted-foreground">{label}</span></div>
            <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
        ))}
        <button
          onClick={() => setStockLocation('Bluff')}
          className="rounded-xl border p-4 flex flex-col gap-1 text-left bg-amber-50 border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2"><PackageCheck className="w-4 h-4 text-amber-600" /><span className="text-xs font-medium text-muted-foreground">Bluff Stock</span></div>
          <p className="text-2xl font-bold font-display text-amber-600">{bluffBottles.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">bottles at distillery — click to view</p>
        </button>
        <button
          onClick={() => setStockLocation('3PL')}
          className="rounded-xl border p-4 flex flex-col gap-1 text-left bg-purple-50 border-purple-200 hover:bg-purple-100 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2"><PackageCheck className="w-4 h-4 text-purple-600" /><span className="text-xs font-medium text-muted-foreground">3PL Stock</span></div>
          <p className="text-2xl font-bold font-display text-purple-600">{warehouseStock.filter(w => (w.warehouse_location || 'Auckland 3PL') === 'Auckland 3PL').reduce((s, w) => s + (w.quantity_bottles || 0), 0).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">bottles at Auckland — click to view</p>
        </button>
        <button
          onClick={() => setStockLocation('UK Bonded')}
          className="rounded-xl border p-4 flex flex-col gap-1 text-left bg-indigo-50 border-indigo-200 hover:bg-indigo-100 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2"><PackageCheck className="w-4 h-4 text-indigo-600" /><span className="text-xs font-medium text-muted-foreground">UK Bonded Stock</span></div>
          <p className="text-2xl font-bold font-display text-indigo-600">{warehouseStock.filter(w => w.warehouse_location === 'UK Bonded').reduce((s, w) => s + (w.quantity_bottles || 0), 0).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">under bond — no excise</p>
        </button>
      </div>

      {stockLocation && (
        <StockLocationDialog
          location={stockLocation}
          finishedGoods={finishedGoods}
          warehouseStock={warehouseStock}
          onClose={() => setStockLocation(null)}
          onTransfer={(batch) => { setStockLocation(null); setShowTransfer3PL(true); }}
        />
      )}

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3">
          <h2 className="text-lg font-semibold">Dispatch History</h2>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search customer, product, batch…" value={search} onChange={e => handleSearch(e.target.value)} className="pl-8 text-sm" />
            </div>
            <Select value={filterSource} onValueChange={v => { setFilterSource(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All sources" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Sources</SelectItem><SelectItem value="Bluff">Bluff Distillery</SelectItem><SelectItem value="Auckland 3PL">Auckland 3PL</SelectItem><SelectItem value="UK Bonded">UK Bonded</SelectItem></SelectContent>
            </Select>
            <Select value={filterChannel} onValueChange={v => { setFilterChannel(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent><SelectItem value="all">All Types</SelectItem><SelectItem value="wholesale">Wholesale</SelectItem><SelectItem value="cellar_door">Cellar Door</SelectItem><SelectItem value="shopify">Shopify</SelectItem><SelectItem value="airpoints">Airpoints</SelectItem><SelectItem value="website">Website</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="picking">Picking</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="dispatched">Dispatched</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <Table className="text-sm">
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead><TableHead>Source</TableHead><TableHead>Customer</TableHead><TableHead>Product</TableHead>
                <TableHead>Batch</TableHead><TableHead>Bottles</TableHead><TableHead>LALs</TableHead><TableHead>Distance</TableHead>
                <TableHead>Method</TableHead><TableHead>CO2e</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={12} className="text-center py-10 text-muted-foreground">No dispatches found</TableCell></TableRow>
              ) : pagedFiltered.map((d, i) => (
                <TableRow key={d.id || i}>
                  <TableCell>{(() => { try { const dt = new Date(d.dispatch_date?.replace(/-/g, '/')); return isNaN(dt) ? d.dispatch_date || '—' : format(dt, 'dd MMM yyyy'); } catch { return d.dispatch_date || '—'; } })()}</TableCell>
                  <TableCell><Badge variant={d.dispatched_from === 'Auckland 3PL' ? 'secondary' : 'outline'} className="text-xs">{d.dispatched_from || 'Bluff'}</Badge></TableCell>
                  <TableCell className="font-semibold">
                    <div className="flex items-center gap-1.5">
                      {d.sales_channel && d.sales_channel !== 'wholesale' ? (
                        <Badge variant="secondary" className="text-xs">{CHANNEL_LABELS[d.sales_channel] || d.sales_channel}</Badge>
                      ) : d.customer_name}
                      {d.xero_invoice_id && (
                        <button onClick={() => toast.info(`Xero Invoice ID: ${d.xero_invoice_id}`)} title={`Xero Invoice: ${d.xero_invoice_id}`}>
                          <FileCheck className="w-3.5 h-3.5 text-sky-600" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{d.product_name}</TableCell>
                  <TableCell className="font-mono text-xs">{d.batch_number}</TableCell>
                  <TableCell className="font-semibold">{d.quantity_bottles}</TableCell>
                  <TableCell>{typeof d.total_lals === 'number' ? d.total_lals.toFixed(3) : d.total_lals || '—'}</TableCell>
                  <TableCell>{d.transport_distance_km ? `${d.transport_distance_km} km` : '—'}</TableCell>
                  <TableCell className="capitalize">{d.transport_method || '—'}</TableCell>
                  <TableCell className="font-semibold text-green-600">{d.co2e_kg ? `${parseFloat(d.co2e_kg).toFixed(2)} kg` : '—'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 flex-wrap">
                      <StatusBadge status={d.status} />
                      {d.sample_dispatch === true && <span className="px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 font-medium">Sample</span>}
                      {d.duty_free === true && <span className="px-1.5 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700 font-medium">Duty Free</span>}
                      {d.is_export === true && <span className="px-1.5 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-medium">Export</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    {d.id && (
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => {
                          setEditingDispatch(d);
                          setEditForm({
                            status: d.status, notes: d.notes || '', dispatch_date: d.dispatch_date, product_name: d.product_name || '',
                            batch_number: d.batch_number || '', quantity_bottles: d.quantity_bottles || '', bottle_size_ml: d.bottle_size_ml || '',
                            total_lals: d.total_lals || '', parcel_weight_kg: d.parcel_weight_kg || '', transport_distance_km: d.transport_distance_km || '',
                            transport_method: d.transport_method || 'road', customer_name: d.customer_name || '', customer_address: d.customer_address || '',
                            dispatched_from: d.dispatched_from || 'Bluff',
                            sample_dispatch: d.sample_dispatch || false, duty_free: d.duty_free || false, is_export: d.is_export || false,
                            });
                            }}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:text-amber-700" title="Return stock" onClick={() => setReturningDispatch(d)}><RotateCcw className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" onClick={() => setDeletingDispatch(d)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <MobileCardGrid>
          {filtered.length === 0 ? (
            <p className="text-center py-10 text-muted-foreground text-sm">No dispatches found</p>
          ) : pagedFiltered.map((d, i) => (
            <MobileCard
              key={d.id || i}
              title={d.sales_channel && d.sales_channel !== 'wholesale' ? (CHANNEL_LABELS[d.sales_channel] || d.sales_channel) : (d.customer_name || '—')}
              subtitle={`${d.product_name} • ${(() => { try { const dt = new Date(d.dispatch_date?.replace(/-/g, '/')); return isNaN(dt) ? d.dispatch_date || '—' : format(dt, 'dd MMM yyyy'); } catch { return d.dispatch_date || '—'; } })()}`}
              badge={
                <>
                  <Badge variant={d.dispatched_from === 'Auckland 3PL' ? 'secondary' : 'outline'} className="text-xs">{d.dispatched_from || 'Bluff'}</Badge>
                  <StatusBadge status={d.status} />
                  {d.sample_dispatch === true && <span className="px-1.5 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 font-medium">Sample</span>}
                  {d.duty_free === true && <span className="px-1.5 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700 font-medium">Duty Free</span>}
                  {d.is_export === true && <span className="px-1.5 py-0.5 text-xs rounded-full bg-green-100 text-green-700 font-medium">Export</span>}
                  {d.xero_invoice_id && (
                    <button onClick={() => toast.info(`Xero Invoice ID: ${d.xero_invoice_id}`)}>
                      <FileCheck className="w-3.5 h-3.5 text-sky-600" />
                    </button>
                  )}
                </>
              }
              accent={<span className="text-lg font-bold text-primary">{d.quantity_bottles}</span>}
              actions={
                <>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => {
                    setEditingDispatch(d);
                    setEditForm({
                      status: d.status, notes: d.notes || '', dispatch_date: d.dispatch_date, product_name: d.product_name || '',
                      batch_number: d.batch_number || '', quantity_bottles: d.quantity_bottles || '', bottle_size_ml: d.bottle_size_ml || '',
                      total_lals: d.total_lals || '', parcel_weight_kg: d.parcel_weight_kg || '', transport_distance_km: d.transport_distance_km || '',
                      transport_method: d.transport_method || 'road', customer_name: d.customer_name || '', customer_address: d.customer_address || '',
                      dispatched_from: d.dispatched_from || 'Bluff',
                      sample_dispatch: d.sample_dispatch || false, duty_free: d.duty_free || false, is_export: d.is_export || false,
                      });
                      }}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-amber-600" onClick={() => setReturningDispatch(d)}><RotateCcw className="w-3.5 h-3.5" /> Return</Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-destructive" onClick={() => setDeletingDispatch(d)}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
                </>
              }
            >
              <MobileDetailRow label="Product" value={d.product_name} />
              <MobileDetailRow label="Batch" value={d.batch_number} />
              <MobileDetailRow label="Bottles" value={d.quantity_bottles} highlight />
              <MobileDetailRow label="LALs" value={typeof d.total_lals === 'number' ? d.total_lals.toFixed(3) : d.total_lals} />
              <MobileDetailRow label="Distance" value={d.transport_distance_km ? `${d.transport_distance_km} km` : '—'} />
              <MobileDetailRow label="Method" value={d.transport_method || '—'} />
              <MobileDetailRow label="CO2e" value={d.co2e_kg ? `${parseFloat(d.co2e_kg).toFixed(2)} kg` : '—'} highlight />
            </MobileCard>
          ))}
        </MobileCardGrid>
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      </Card>

      <DispatchForm open={showForm} onClose={() => setShowForm(false)} finishedGoods={finishedGoods} warehouseStock={warehouseStock} customers={customers} />
      <DirectSalesForm open={showDirectSalesForm} onClose={() => setShowDirectSalesForm(false)} finishedGoods={finishedGoods} allDispatches={allDispatches} />
      <TransferTo3PLDialog open={showTransfer3PL} onClose={() => setShowTransfer3PL(false)} finishedGoods={finishedGoods} allDispatches={allDispatches} />

      <Dialog open={!!editingDispatch} onOpenChange={v => !v && setEditingDispatch(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">Edit Dispatch</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Dispatched From</Label>
              <Select value={editForm.dispatched_from || 'Bluff'} onValueChange={v => setEditForm(f => (
                // A previously-picked batch was sourced from a completely
                // different stock pool (Bluff finished_good vs. one 3PL
                // warehouse's warehouse_stock) — clearing it forces
                // BatchPicker to re-resolve against the newly-selected
                // location instead of showing a stale batch as "settled".
                { ...f, dispatched_from: v, batch_number: '' }
              ))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Bluff">Bluff Distillery</SelectItem>
                  <SelectItem value="Auckland 3PL">Auckland 3PL Warehouse</SelectItem>
                  <SelectItem value="UK Bonded">UK Bonded Warehouse</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Xero invoices don't say which warehouse fulfilled the sale — correct this before approving if it wasn't dispatched from Bluff.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <BatchPicker
                finishedGoods={finishedGoods}
                warehouseStock={warehouseStock}
                dispatchedFrom={editForm.dispatched_from || 'Bluff'}
                productName={editForm.product_name}
                bottleSizeMl={editForm.bottle_size_ml}
                batchNumber={editForm.batch_number}
                quantityBottles={parseInt(editForm.quantity_bottles) || 0}
                distanceKm={parseFloat(editForm.transport_distance_km) || 0}
                transportMethod={editForm.transport_method}
                onAllocate={(result) => setEditForm(f => ({ ...f, ...result }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Quantity (bottles)</Label><Input type="number" min="0" value={editForm.quantity_bottles || ''} onChange={e => {
                const newQty = parseInt(e.target.value) || '';
                const lalsPerBottle = editingDispatch?.total_lals && editingDispatch?.quantity_bottles ? editingDispatch.total_lals / editingDispatch.quantity_bottles : 0;
                const newLals = newQty && lalsPerBottle ? parseFloat((newQty * lalsPerBottle).toFixed(3)) : '';
                setEditForm(f => ({ ...f, quantity_bottles: newQty, total_lals: newLals }));
              }} className="mt-1" /></div>
              <div><Label>Bottle Size (ml)</Label><Input type="number" min="0" value={editForm.bottle_size_ml || ''} onChange={e => setEditForm(f => ({ ...f, bottle_size_ml: parseInt(e.target.value) || '' }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Total LALs</Label><Input type="number" min="0" step="0.001" value={editForm.total_lals || ''} onChange={e => setEditForm(f => ({ ...f, total_lals: parseFloat(e.target.value) || '' }))} className="mt-1" /></div>
              <div><Label>Parcel Weight (kg)</Label><Input type="number" min="0" step="0.1" value={editForm.parcel_weight_kg || ''} onChange={e => setEditForm(f => ({ ...f, parcel_weight_kg: parseFloat(e.target.value) || '' }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Customer Name</Label><Input value={editForm.customer_name || ''} onChange={e => setEditForm(f => ({ ...f, customer_name: e.target.value }))} className="mt-1" /></div>
              <div><Label>Delivery Address</Label><Input value={editForm.customer_address || ''} onChange={e => setEditForm(f => ({ ...f, customer_address: e.target.value }))} className="mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Transport Method</Label><Select value={editForm.transport_method || 'road'} onValueChange={v => setEditForm(f => ({ ...f, transport_method: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="road">Road</SelectItem><SelectItem value="courier">Courier</SelectItem><SelectItem value="air">Air</SelectItem><SelectItem value="sea">Sea</SelectItem><SelectItem value="pickup">Pickup</SelectItem></SelectContent>
              </Select></div>
              <div><Label>Distance (km)</Label>
                <div className="relative mt-1">
                  <Input type="number" min="0" value={editForm.transport_distance_km || ''} onChange={e => setEditForm(f => ({ ...f, transport_distance_km: parseInt(e.target.value) || '' }))} disabled={editCalcingDistance} />
                  {editCalcingDistance && <div className="absolute right-2.5 top-2.5"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}
                </div>
                {editForm.customer_address && !editCalcingDistance && <button type="button" className="text-xs text-primary hover:underline mt-1" onClick={() => calculateEditDistance(editForm.customer_address)}>Auto-calculate from address</button>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Dispatch Date</Label><Input type="date" value={editForm.dispatch_date || ''} onChange={e => setEditForm(f => ({ ...f, dispatch_date: e.target.value }))} className="mt-1" /></div>
              <div><Label>Status</Label><Select value={editForm.status || 'dispatched'} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="picking">Picking</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="dispatched">Dispatched</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  {/* Cancelling only makes sense before stock has gone out — once
                      Dispatched/Delivered, "Return stock" is the correct undo path. */}
                  {CANCELLABLE_STATUSES.has(editingDispatch?.status) && <SelectItem value="cancelled">Cancelled</SelectItem>}
                </SelectContent>
              </Select></div>
            </div>
            <div><Label>Notes</Label><Input value={editForm.notes || ''} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" /></div>
            <ExciseFlags form={editForm} setForm={setEditForm} dispatchedFrom={editForm.dispatched_from || 'Bluff'} />
            <Button onClick={() => editMutation.mutate(editFormRef.current)} disabled={editMutation.isPending} className="w-full">{editMutation.isPending ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!returningDispatch} onOpenChange={v => !v && setReturningDispatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return Stock?</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore <strong>{returningDispatch?.quantity_bottles} bottles</strong> of <strong>{returningDispatch?.product_name}</strong> back to {(returningDispatch?.dispatched_from === 'Auckland 3PL' || returningDispatch?.dispatched_from === 'UK Bonded') ? 'warehouse' : 'distillery'} stock. The dispatch record will be kept and marked as returned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-amber-600 hover:bg-amber-700" onClick={() => returnMutation.mutate(returningDispatch)} disabled={returnMutation.isPending}>{returnMutation.isPending ? 'Returning…' : 'Return Stock'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletingDispatch} onOpenChange={v => !v && setDeletingDispatch(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dispatch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the dispatch to <strong>{deletingDispatch?.customer_name}</strong> and restore <strong>{deletingDispatch?.quantity_bottles} bottles</strong> of <strong>{deletingDispatch?.product_name}</strong> back to stock.
              <p className="mt-2 font-medium text-destructive">This cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMutation.mutate(deletingDispatch)} disabled={deleteMutation.isPending}>{deleteMutation.isPending ? 'Deleting…' : 'Delete & Restore Stock'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}