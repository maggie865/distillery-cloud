import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import Pagination from '@/components/ui/Pagination';
import StatCard from '@/components/shared/StatCard';
import { ArrowDownToLine, ArrowUpFromLine, Activity, PackageCheck, CheckCircle2, AlertTriangle } from 'lucide-react';
import { format, startOfMonth, parseISO } from 'date-fns';

function usePagination() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  return { page, pageSize, setPage, setPageSize };
}

const ACTION_LABELS = {
  transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out',
  dilution: 'Dilution',
  cleaning: 'Cleaning',
  adjustment: 'Adjustment',
  disposal: 'Disposal',
  dilution_reversed: 'Dilution Reversed',
  sns_run_reversed: 'SNS Run Reversed',
};

export default function MovementsReport({
  receiving, dispatches, distillationRuns, bottlingRuns, tankMovements, tanks, wastage,
  finishedGoods, warehouseStock, startDate, endDate,
}) {
  const rangeStart = startDate ? parseISO(startDate) : startOfMonth(new Date());
  const rangeEnd = endDate ? parseISO(endDate) : new Date();
  const rangeEndInclusive = new Date(rangeEnd);
  rangeEndInclusive.setHours(23, 59, 59, 999);

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    try {
      const d = parseISO(dateStr);
      return d >= rangeStart && d <= rangeEndInclusive;
    } catch { return false; }
  };

  const monthLabel = `${format(rangeStart, 'dd MMM yyyy')} – ${format(rangeEnd, 'dd MMM yyyy')}`;

  // Filtered data for the selected period
  const monthReceiving = receiving.filter(r => inRange(r.date_received));
  const monthDistillations = distillationRuns.filter(r => inRange(r.date));
  const monthBottlings = bottlingRuns.filter(r => inRange(r.date));
  const monthTankMovements = tankMovements.filter(tm =>
    inRange(tm.date) && tm.action !== 'distillation_fill' && tm.action !== 'bottling_draw'
  );
  const monthDispatches = dispatches.filter(d => inRange(d.dispatch_date));
  const monthWastage = wastage.filter(w => inRange(w.date));

  // Summary calculations
  const lalsReceived = monthReceiving.reduce((s, r) => s + (r.lals || 0), 0);
  const lalsProduced = monthDistillations.reduce((s, r) => s + (r.hearts_lals || 0), 0);
  const lalsDispatched = monthDispatches.reduce((s, d) => s + (d.total_lals || 0), 0);
  const lalsWasted = monthWastage.reduce((s, w) => s + (w.lals || 0), 0);
  const totalBottlesDispatched = monthDispatches.reduce((s, d) => s + (d.quantity_bottles || 0), 0);

  const totalLALsIn = lalsReceived + lalsProduced;
  const totalLALsOut = lalsDispatched + lalsWasted;
  const netLALs = totalLALsIn - totalLALsOut;

  // Current stock LALs (all locations)
  const currentFGLALs = finishedGoods.reduce((s, g) => s + (g.total_lals || 0), 0);
  const currentWHLALs = warehouseStock.reduce((s, w) => s + (w.total_lals || 0), 0);
  const currentTankLALs = tanks.reduce((s, t) => s + ((t.current_volume || 0) * (t.current_abv || 0) / 100), 0);
  const currentTotalLALs = currentFGLALs + currentWHLALs + currentTankLALs;

  // LAL reconciliation — opening derived by working backwards from current stock
  const openingLALs = currentTotalLALs - lalsProduced - lalsReceived + lalsDispatched + lalsWasted;
  const calculatedClosing = openingLALs + lalsProduced + lalsReceived - lalsDispatched - lalsWasted;
  const variance = Math.abs(calculatedClosing - currentTotalLALs);
  const isBalanced = variance < 0.5;

  // Pagination for each table
  const recv = usePagination();
  const dist = usePagination();
  const bott = usePagination();
  const tank = usePagination();
  const disp = usePagination();

  const pagedReceiving = monthReceiving.slice((recv.page - 1) * recv.pageSize, recv.page * recv.pageSize);
  const pagedDistillations = monthDistillations.slice((dist.page - 1) * dist.pageSize, dist.page * dist.pageSize);
  const pagedBottlings = monthBottlings.slice((bott.page - 1) * bott.pageSize, bott.page * bott.pageSize);
  const pagedTankMovements = monthTankMovements.slice((tank.page - 1) * tank.pageSize, tank.page * tank.pageSize);
  const pagedDispatches = monthDispatches.slice((disp.page - 1) * disp.pageSize, disp.page * disp.pageSize);

  const tankName = (id) => tanks.find(t => t.id === id)?.name || '—';

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{monthLabel} — Stock Movements</h3>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total LALs In" value={totalLALsIn.toFixed(3)} sub="received + distillation hearts" icon={ArrowDownToLine} color="text-green-600" bg="bg-green-50 border-green-200" />
        <StatCard label="Total LALs Out" value={totalLALsOut.toFixed(3)} sub="dispatched + wasted" icon={ArrowUpFromLine} color="text-red-600" bg="bg-red-50 border-red-200" />
        <StatCard label="Net LAL Movement" value={`${netLALs >= 0 ? '+' : ''}${netLALs.toFixed(3)}`} sub="in − out for period" icon={Activity} color={netLALs >= 0 ? 'text-green-600' : 'text-red-600'} bg={netLALs >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} />
        <StatCard label="Total Bottles Dispatched" value={totalBottlesDispatched.toLocaleString()} sub={`${monthDispatches.length} dispatches`} icon={PackageCheck} color="text-primary" bg="bg-accent border-accent-foreground/10" />
      </div>

      {/* 1. Inbound Receiving */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4">1. Inbound Receiving ({monthLabel})</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Packing Slip</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">LALs</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedReceiving.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No receipts this period</TableCell></TableRow>
              ) : pagedReceiving.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.date_received ? format(parseISO(r.date_received), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-sm font-mono">{r.packing_slip_number || '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{r.material_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.supplier_name || '—'}</TableCell>
                  <TableCell className="text-sm text-right">{r.quantity}</TableCell>
                  <TableCell className="text-sm">{r.unit}</TableCell>
                  <TableCell className="text-sm text-right font-mono">{r.lals ? r.lals.toFixed(3) : '—'}</TableCell>
                  <TableCell className="text-sm text-right">{r.cost_per_unit ? `$${r.cost_per_unit.toFixed(2)}` : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pagination total={monthReceiving.length} page={recv.page} pageSize={recv.pageSize} onPageChange={recv.setPage} onPageSizeChange={(s) => { recv.setPageSize(s); recv.setPage(1); }} />
      </Card>

      {/* 2. Distillation Runs */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4">2. Distillation Runs ({monthLabel})</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Sub-batch</TableHead>
                <TableHead className="text-right">Input Vol (L)</TableHead>
                <TableHead className="text-right">Input LALs</TableHead>
                <TableHead className="text-right">Hearts LALs</TableHead>
                <TableHead className="text-right">Tails LALs</TableHead>
                <TableHead className="text-right">Dumped LALs</TableHead>
                <TableHead>Dest. Tank</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedDistillations.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">No distillation runs this period</TableCell></TableRow>
              ) : pagedDistillations.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.date ? format(parseISO(r.date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-sm font-mono font-semibold">{r.batch_number}</TableCell>
                  <TableCell className="text-sm font-mono">{r.sub_batch_code || '—'}</TableCell>
                  <TableCell className="text-sm text-right">{r.input_volume?.toFixed(2) || '—'}</TableCell>
                  <TableCell className="text-sm text-right font-mono">{r.input_lals?.toFixed(3) || '—'}</TableCell>
                  <TableCell className="text-sm text-right font-mono font-semibold text-green-600">{r.hearts_lals?.toFixed(3) || '—'}</TableCell>
                  <TableCell className="text-sm text-right font-mono">{r.tails_lals?.toFixed(3) || '—'}</TableCell>
                  <TableCell className="text-sm text-right font-mono text-red-600">{r.dumped_lals?.toFixed(3) || '—'}</TableCell>
                  <TableCell className="text-sm">{tankName(r.destination_tank_id)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pagination total={monthDistillations.length} page={dist.page} pageSize={dist.pageSize} onPageChange={dist.setPage} onPageSizeChange={(s) => { dist.setPageSize(s); dist.setPage(1); }} />
      </Card>

      {/* 3. Bottling Runs */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4">3. Bottling Runs ({monthLabel})</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Bottle Size</TableHead>
                <TableHead className="text-right">Bottles Produced</TableHead>
                <TableHead className="text-right">Input LALs</TableHead>
                <TableHead>Tank Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedBottlings.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No bottling runs this period</TableCell></TableRow>
              ) : pagedBottlings.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.date ? format(parseISO(r.date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-sm font-mono font-semibold">{r.batch_number}</TableCell>
                  <TableCell className="text-sm font-medium">{r.product_name}</TableCell>
                  <TableCell className="text-sm">{r.bottle_size_ml}ml</TableCell>
                  <TableCell className="text-sm text-right font-semibold">{r.bottles_produced}</TableCell>
                  <TableCell className="text-sm text-right font-mono">{r.input_lals?.toFixed(3) || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">—</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Pagination total={monthBottlings.length} page={bott.page} pageSize={bott.pageSize} onPageChange={bott.setPage} onPageSizeChange={(s) => { bott.setPageSize(s); bott.setPage(1); }} />
      </Card>

      {/* 4. Tank Transfers & Dilutions */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4">4. Tank Transfers & Dilutions ({monthLabel})</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>From Tank</TableHead>
                <TableHead>To Tank</TableHead>
                <TableHead className="text-right">Volume (L)</TableHead>
                <TableHead className="text-right">LALs</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedTankMovements.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No tank transfers this period</TableCell></TableRow>
              ) : pagedTankMovements.map(tm => {
                const isOut = tm.action === 'transfer_out';
                const isIn = tm.action === 'transfer_in';
                return (
                  <TableRow key={tm.id}>
                    <TableCell className="text-sm">{tm.date ? format(parseISO(tm.date), 'dd MMM yyyy') : '—'}</TableCell>
                    <TableCell className="text-sm">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent">{ACTION_LABELS[tm.action] || tm.action}</span>
                    </TableCell>
                    <TableCell className="text-sm">{isIn ? '—' : tm.tank_name}</TableCell>
                    <TableCell className="text-sm">{isIn ? tm.tank_name : (isOut ? '—' : tm.tank_name)}</TableCell>
                    <TableCell className="text-sm text-right">{tm.volume_litres?.toFixed(2) || '—'}</TableCell>
                    <TableCell className="text-sm text-right font-mono">{tm.lals?.toFixed(3) || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{tm.notes || '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <Pagination total={monthTankMovements.length} page={tank.page} pageSize={tank.pageSize} onPageChange={tank.setPage} onPageSizeChange={(s) => { tank.setPageSize(s); tank.setPage(1); }} />
      </Card>

      {/* 5. Outbound Dispatches */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4">5. Outbound Dispatches ({monthLabel})</h4>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead className="text-right">Bottle Size</TableHead>
                <TableHead className="text-right">Bottles</TableHead>
                <TableHead className="text-right">LALs</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Sales Channel</TableHead>
                <TableHead>Order Ref</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedDispatches.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">No dispatches this period</TableCell></TableRow>
              ) : (
                <>
                  {pagedDispatches.map((d, i) => (
                    <TableRow key={d.id || i}>
                      <TableCell className="text-sm">{d.dispatch_date ? format(parseISO(d.dispatch_date), 'dd MMM yyyy') : '—'}</TableCell>
                      <TableCell className="text-sm font-medium">{d.customer_name}</TableCell>
                      <TableCell className="text-sm">{d.product_name}</TableCell>
                      <TableCell className="text-sm font-mono">{d.batch_number}</TableCell>
                      <TableCell className="text-sm text-right">{d.bottle_size_ml}ml</TableCell>
                      <TableCell className="text-sm text-right font-semibold">{d.quantity_bottles}</TableCell>
                      <TableCell className="text-sm text-right font-mono">{d.total_lals?.toFixed(3) || '—'}</TableCell>
                      <TableCell className="text-sm">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${d.dispatched_from === 'Auckland 3PL' ? 'bg-blue-100 text-blue-700' : 'bg-accent text-accent-foreground'}`}>
                          {d.dispatched_from || '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm capitalize">{d.sales_channel || '—'}</TableCell>
                      <TableCell className="text-sm font-mono">{d.order_reference || '—'}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 bg-muted/30 font-bold">
                    <TableCell colSpan={5}>Totals ({monthDispatches.length} dispatches)</TableCell>
                    <TableCell className="text-right">{totalBottlesDispatched.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{lalsDispatched.toFixed(3)}</TableCell>
                    <TableCell colSpan={3}></TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
        <Pagination total={monthDispatches.length} page={disp.page} pageSize={disp.pageSize} onPageChange={disp.setPage} onPageSizeChange={(s) => { disp.setPageSize(s); disp.setPage(1); }} />
      </Card>

      {/* LAL Reconciliation */}
      <Card className={`p-5 border-2 ${isBalanced ? 'border-emerald-300' : 'border-red-300'}`}>
        <div className="flex items-center gap-2 mb-4">
          {isBalanced ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-red-600" />}
          <h4 className="text-sm font-semibold">LAL Reconciliation — {monthLabel}</h4>
        </div>
        <div className="divide-y divide-border">
          <div className="flex justify-between py-2"><span className="text-sm">Opening LALs (stock at start of period)</span><span className="font-mono font-semibold">{openingLALs.toFixed(3)}</span></div>
          <div className="flex justify-between py-2 text-green-600"><span className="text-sm">+ LALs Produced (distillation hearts)</span><span className="font-mono">+{lalsProduced.toFixed(3)}</span></div>
          <div className="flex justify-between py-2 text-green-600"><span className="text-sm">+ LALs Received (ethanol inbound)</span><span className="font-mono">+{lalsReceived.toFixed(3)}</span></div>
          <div className="flex justify-between py-2 text-red-600"><span className="text-sm">− LALs Dispatched</span><span className="font-mono">−{lalsDispatched.toFixed(3)}</span></div>
          <div className="flex justify-between py-2 text-red-600"><span className="text-sm">− LALs Wasted</span><span className="font-mono">−{lalsWasted.toFixed(3)}</span></div>
          <div className="flex justify-between py-2 font-bold"><span className="text-sm">= Calculated Closing LALs</span><span className="font-mono">{calculatedClosing.toFixed(3)}</span></div>
          <div className="flex justify-between py-2"><span className="text-sm text-muted-foreground">Actual Closing LALs (current stock)</span><span className="font-mono text-muted-foreground">{currentTotalLALs.toFixed(3)}</span></div>
          <div className={`flex justify-between py-2 font-bold ${isBalanced ? 'text-emerald-600' : 'text-red-600'}`}>
            <span className="text-sm">Variance</span>
            <span className="font-mono">{variance.toFixed(3)} {isBalanced ? '✓' : '⚠'}</span>
          </div>
        </div>
        {!isBalanced && (
          <p className="mt-3 text-xs text-red-600">Variance exceeds 0.5 LAL tolerance — check for unrecorded movements or stock adjustments.</p>
        )}
      </Card>
    </div>
  );
}