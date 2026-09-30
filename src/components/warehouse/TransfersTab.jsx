import { useState, useMemo } from 'react';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Printer, ArrowRightLeft, Wine, Droplets, Truck, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import Pagination from '@/components/ui/Pagination';
import { toast } from 'sonner';

export default function TransfersTab({ warehouseStock, onPrintSlip, onCancel }) {
  const qc = useQueryClient();
  const now = new Date();
  const [monthFilter, setMonthFilter] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [editRecord, setEditRecord] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAll, setShowAll] = useState(false);

  const getOrigBottles = (w) => w.original_quantity_bottles ?? w.quantity_bottles ?? 0;
  const getOrigLals = (w) => w.original_total_lals ?? w.total_lals ?? 0;

  const filtered = useMemo(() => {
    let records = [...warehouseStock].filter(w => w.transfer_date || w.date_transferred_in);
    if (!showAll) {
      const [year, month] = monthFilter.split('-').map(Number);
      records = records.filter(w => {
        const d = new Date(w.transfer_date || w.date_transferred_in);
        return d.getFullYear() === year && (d.getMonth() + 1) === month;
      });
    }
    return records.sort((a, b) => new Date(b.transfer_date || b.date_transferred_in) - new Date(a.transfer_date || a.date_transferred_in));
  }, [warehouseStock, monthFilter, showAll]);

  const inTransit = filtered.filter(w => w.status === 'in_transit');
  const received = filtered.filter(w => !w.status || w.status === 'received');

  const totalBottles = filtered.reduce((s, w) => s + getOrigBottles(w), 0);
  const totalLALs = filtered.reduce((s, w) => s + getOrigLals(w), 0);
  const inTransitBottles = inTransit.reduce((s, w) => s + getOrigBottles(w), 0);

  // Mark as received
  const markReceivedMutation = useMutation({
    mutationFn: async ({ record, receivedDate }) => {
      await base44.entities.WarehouseStock.update(record.id, {
        status: 'received',
        received_date: receivedDate,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouseStock'] });
      toast.success('Stock marked as received at 3PL');
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  // Undo received — set back to in_transit
  const undoReceivedMutation = useMutation({
    mutationFn: async (record) => {
      await base44.entities.WarehouseStock.update(record.id, {
        status: 'in_transit',
        received_date: null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouseStock'] });
      toast.success('Transfer status reset to In Transit');
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  // Edit transfer — original_quantity_bottles is the immutable record of
  // what was actually transferred, but correcting it (e.g. a typo) has to
  // also move the same delta through everything that was computed from the
  // transfer at the time: this record's own live remaining balance at the
  // 3PL, and the Bluff Finished Goods it was deducted from — otherwise the
  // correction just changes what's on record without changing what's
  // actually short or long in the ledger, and excise reporting (which reads
  // original_quantity_bottles as the transferred total) silently goes wrong.
  const editMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const oldOriginalQty = editRecord.original_quantity_bottles ?? editRecord.quantity_bottles ?? 0;
      const oldOriginalLals = editRecord.original_total_lals ?? editRecord.total_lals ?? 0;
      const newOriginalQty = data.original_quantity_bottles;
      const qtyDelta = newOriginalQty - oldOriginalQty;
      const lalsPerBottle = oldOriginalQty > 0 ? oldOriginalLals / oldOriginalQty : 0;
      const newOriginalLals = parseFloat((newOriginalQty * lalsPerBottle).toFixed(4));
      const lalsDelta = newOriginalLals - oldOriginalLals;
      const warnings = [];

      if (qtyDelta !== 0) {
        // This transfer's own live remaining balance shifts by the same delta
        const newRemainingQty = (editRecord.quantity_bottles || 0) + qtyDelta;
        const remainingShortfall = newRemainingQty < 0 ? -newRemainingQty : 0;
        data.quantity_bottles = Math.max(0, newRemainingQty);
        data.total_lals = parseFloat(Math.max(0, (editRecord.total_lals || 0) + lalsDelta).toFixed(4));
        if (remainingShortfall > 0.0001) {
          warnings.push(`Correcting this transfer down by ${Math.abs(qtyDelta)} couldn't fully apply at the 3PL — ${remainingShortfall} of it has already been dispatched from there, so the remaining balance was only reduced to 0.`);
        }

        // Bluff Finished Goods moves by the inverse delta — more transferred
        // means less left at Bluff, and vice versa.
        const bluffDelta = -qtyDelta;
        const allFG = await base44.entities.FinishedGood.list('product_name', 5000);
        const fg = allFG.find(f =>
          f.product_name === editRecord.product_name &&
          f.batch_number === editRecord.batch_number &&
          Number(f.bottle_size_ml) === Number(editRecord.bottle_size_ml)
        );
        if (fg) {
          const newBluffQty = (fg.quantity_bottles || 0) + bluffDelta;
          const bluffShortfall = newBluffQty < 0 ? -newBluffQty : 0;
          const newBluffLals = Math.max(0, (fg.total_lals || 0) - lalsDelta);
          if (newBluffQty <= 0) {
            await base44.entities.FinishedGood.delete(fg.id);
          } else {
            await base44.entities.FinishedGood.update(fg.id, { quantity_bottles: newBluffQty, total_lals: parseFloat(newBluffLals.toFixed(4)) });
          }
          if (bluffShortfall > 0.0001) {
            warnings.push(`Correcting this transfer up by ${qtyDelta} couldn't fully come off Bluff stock — only part of it was available there.`);
          }
        } else if (bluffDelta > 0) {
          warnings.push(`Correcting this transfer up by ${qtyDelta} bottles couldn't be taken off Bluff stock — no matching Finished Goods record was found there.`);
        } else if (bluffDelta < 0) {
          await base44.entities.FinishedGood.create({
            product_name: editRecord.product_name,
            batch_number: editRecord.batch_number,
            bottle_size_ml: editRecord.bottle_size_ml,
            abv_percent: editRecord.abv_percent,
            quantity_bottles: -bluffDelta,
            total_lals: parseFloat((-lalsDelta).toFixed(4)),
          });
        }
      }

      await base44.entities.WarehouseStock.update(id, data);
      return { warnings };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['warehouseStock'] });
      qc.invalidateQueries({ queryKey: ['finishedGoods'] });
      toast.success('Transfer updated');
      (result?.warnings || []).forEach(w => toast.warning(w));
      setEditRecord(null);
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const openEdit = (record) => {
    setEditRecord(record);
    setEditForm({
      transfer_date: record.transfer_date || record.date_transferred_in || '',
      quantity_bottles: record.original_quantity_bottles ?? record.quantity_bottles ?? 0,
      transport_distance_km: record.transport_distance_km || '',
      notes: record.notes || '',
    });
  };

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Group paged records by date for display
  const renderRows = useMemo(() => {
    const rows = [];
    let prevDate = null;
    paged.forEach(w => {
      const date = w.transfer_date || w.date_transferred_in || '—';
      if (date !== prevDate) {
        const dayRecords = filtered.filter(x => (x.transfer_date || x.date_transferred_in) === date);
        const dayBottles = dayRecords.reduce((s, x) => s + getOrigBottles(x), 0);
        rows.push({ type: 'header', date, bottles: dayBottles, key: 'hdr-' + date });
        prevDate = date;
      }
      rows.push({ type: 'data', record: w, key: w.id });
    });
    return rows;
  }, [paged, filtered]);

  return (
    <div className="space-y-4">

      {/* In Transit Alert */}
      {inTransit.length > 0 && (
        <Card className="p-4 border-2 border-amber-300 bg-amber-50 space-y-3">
          <div className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-amber-800">In Transit — {inTransitBottles.toLocaleString()} bottles</h3>
          </div>
          <p className="text-xs text-amber-700">These transfers have not yet been received at the 3PL. Stock is not counted in 3PL inventory until marked as received.</p>
          <div className="space-y-2">
            {inTransit.map(w => (
              <div key={w.id} className="bg-white rounded-lg border border-amber-200 p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm">
                  <span className="font-medium">{w.product_name}</span>
                  <span className="text-muted-foreground ml-2">B-{w.batch_number} · {w.bottle_size_ml}ml · {getOrigBottles(w)} bottles</span>
                  <span className="text-muted-foreground ml-2">Sent {w.transfer_date ? format(parseISO(w.transfer_date), 'd MMM yyyy') : '—'}</span>
                  {w.packing_slip_number && <span className="text-muted-foreground ml-2">· {w.packing_slip_number}</span>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <MarkReceivedButton record={w} onMark={(receivedDate) => markReceivedMutation.mutate({ record: w, receivedDate })} saving={markReceivedMutation.isPending} />
                  <Button size="sm" variant="outline" onClick={() => openEdit(w)} className="gap-1">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Button>
                  {onPrintSlip && (
                    <Button size="sm" variant="ghost" onClick={() => onPrintSlip(w)} className="gap-1">
                      <Printer className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {onCancel && (
                    <Button size="sm" variant="ghost" className="gap-1 text-destructive hover:text-destructive" onClick={() => onCancel(w)}>
                      <Trash2 className="w-3.5 h-3.5" /> Cancel
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><ArrowRightLeft className="w-4 h-4 text-blue-600" /><p className="text-xs text-muted-foreground">Transfers this month</p></div>
          <p className="text-xl font-bold font-display">{filtered.length}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><Wine className="w-4 h-4 text-purple-600" /><p className="text-xs text-muted-foreground">Bottles transferred</p></div>
          <p className="text-xl font-bold font-display">{totalBottles.toLocaleString()}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1"><Droplets className="w-4 h-4 text-cyan-600" /><p className="text-xs text-muted-foreground">LALs transferred</p></div>
          <p className="text-xl font-bold font-display">{totalLALs.toFixed(2)}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {!showAll && <Input type="month" value={monthFilter} onChange={e => { setMonthFilter(e.target.value); setPage(1); }} className="w-40" />}
        <Button variant={showAll ? 'default' : 'outline'} size="sm" onClick={() => { setShowAll(v => !v); setPage(1); }}>
          {showAll ? 'Show current month' : 'Show all transfers'}
        </Button>
      </div>

      {/* Transfers table */}
      {filtered.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-muted-foreground">No transfers found for this period.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Bottles</TableHead>
                  <TableHead className="text-right">LALs</TableHead>
                  <TableHead>Packing Slip</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renderRows.map(row => {
                  if (row.type === 'header') {
                    return (
                      <TableRow key={row.key} className="bg-muted/50">
                        <TableCell colSpan={9} className="py-1.5 px-4">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {row.date ? format(parseISO(row.date), 'EEEE d MMMM yyyy') : '—'}
                            <span className="ml-2 font-normal">— {row.bottles.toLocaleString()} bottles</span>
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  const w = row.record;
                  const isInTransit = w.status === 'in_transit';
                  return (
                    <TableRow key={row.key} className={isInTransit ? 'bg-amber-50/50' : ''}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {w.transfer_date ? format(parseISO(w.transfer_date), 'd MMM yyyy') : '—'}
                      </TableCell>
                      <TableCell>
                        {isInTransit
                          ? <Badge className="bg-amber-100 text-amber-700 gap-1"><Truck className="w-3 h-3" /> In Transit</Badge>
                          : <Badge className="bg-emerald-100 text-emerald-700 gap-1"><CheckCircle2 className="w-3 h-3" /> Received {w.received_date ? format(parseISO(w.received_date), 'd MMM') : ''}</Badge>
                        }
                      </TableCell>
                      <TableCell className="text-sm font-medium">{w.product_name}</TableCell>
                      <TableCell className="text-sm font-mono">{w.batch_number}</TableCell>
                      <TableCell className="text-sm">{w.bottle_size_ml}ml</TableCell>
                      <TableCell className="text-sm text-right">{getOrigBottles(w).toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-right font-mono">{getOrigLals(w).toFixed(3)}</TableCell>
                      <TableCell className="text-sm font-mono text-muted-foreground">{w.packing_slip_number || '—'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {isInTransit ? (
                            <MarkReceivedButton
                              record={w}
                              compact
                              onMark={(receivedDate) => markReceivedMutation.mutate({ record: w, receivedDate })}
                              saving={markReceivedMutation.isPending}
                            />
                          ) : (
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 gap-1" onClick={() => undoReceivedMutation.mutate(w)} disabled={undoReceivedMutation.isPending}>
                              <Truck className="w-3 h-3" /> Undo
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(w)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          {onPrintSlip && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onPrintSlip(w)}>
                              <Printer className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {onCancel && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => onCancel(w)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="p-3 border-t">
            <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </div>
        </Card>
      )}

      {/* Edit Dialog */}
      {editRecord && (
        <Dialog open={!!editRecord} onOpenChange={(v) => !v && setEditRecord(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="font-display">Edit Transfer</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="rounded-lg bg-muted p-3 text-sm">
                <p className="font-medium">{editRecord.product_name}</p>
                <p className="text-muted-foreground">Batch {editRecord.batch_number} · {editRecord.bottle_size_ml}ml</p>
              </div>
              <div>
                <Label className="text-xs">Transfer Date</Label>
                <Input type="date" value={editForm.transfer_date} onChange={e => setEditForm(f => ({ ...f, transfer_date: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Bottles Transferred</Label>
                <Input type="number" value={editForm.quantity_bottles} onChange={e => setEditForm(f => ({ ...f, quantity_bottles: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Distance (km)</Label>
                <Input type="number" value={editForm.transport_distance_km} onChange={e => setEditForm(f => ({ ...f, transport_distance_km: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Input value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => editMutation.mutate({ id: editRecord.id, data: { transfer_date: editForm.transfer_date, date_transferred_in: editForm.transfer_date, original_quantity_bottles: parseInt(editForm.quantity_bottles) || editRecord.original_quantity_bottles, transport_distance_km: parseFloat(editForm.transport_distance_km) || null, notes: editForm.notes || undefined } })} disabled={editMutation.isPending}>
                  {editMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
                <Button variant="outline" onClick={() => setEditRecord(null)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// Mark as Received inline button with date picker
function MarkReceivedButton({ record, onMark, saving, compact }) {
  const [showPicker, setShowPicker] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  if (showPicker) {
    return (
      <div className="flex items-center gap-1">
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-7 text-xs w-32" />
        <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2" onClick={() => { onMark(date); setShowPicker(false); }} disabled={saving}>
          ✓
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs px-1" onClick={() => setShowPicker(false)}>✕</Button>
      </div>
    );
  }

  return compact ? (
    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50" onClick={() => setShowPicker(true)}>
      <CheckCircle2 className="w-3 h-3" /> Received
    </Button>
  ) : (
    <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setShowPicker(true)}>
      <CheckCircle2 className="w-4 h-4" /> Mark as Received
    </Button>
  );
}