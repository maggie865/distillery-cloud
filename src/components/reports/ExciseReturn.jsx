import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, CheckCircle2, AlertTriangle, FileText } from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { toast } from 'sonner';
import { getExciseRate } from '@/lib/exciseRates';

function ExciseRow({ label, value, sub, highlight, indent, displayValue }) {
  return (
    <div className={`flex items-center justify-between px-4 py-3 ${highlight ? 'bg-accent/30' : ''} ${indent ? 'pl-8' : ''}`}>
      <div>
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
      <p className={`font-bold font-mono ${highlight ? 'text-primary text-lg' : 'text-base'}`}>
        {displayValue !== undefined ? displayValue : value.toFixed(3)}
      </p>
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div className="px-4 py-2 bg-muted/20">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

export default function ExciseReturn({
  finishedGoods,
  warehouseStock,
  tanks,
  dispatches,
  distillationRuns,
  bottlingRuns,
  wastage,
  tankMovements,
}) {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [selectedMonth, setSelectedMonth] = useState(`${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`);

  const monthDate = parseISO(selectedMonth + '-01');
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);
  const monthLabel = format(monthDate, 'MMMM yyyy');

  const inMonth = (dateStr) => {
    if (!dateStr) return false;
    try {
      return isWithinInterval(parseISO(dateStr), { start: monthStart, end: monthEnd });
    } catch { return false; }
  };

  // Fetch WarehouseStock for transfer LALs
  const { data: warehouseStockAll = [] } = useQuery({
    queryKey: ['warehouseStock'],
    queryFn: () => base44.entities.WarehouseStock.list('-transfer_date', 5000),
  });

  // Fetch Receiving for LALs received (ethanol inbound)
  const { data: receivingsAll = [] } = useQuery({
    queryKey: ['receiving'],
    queryFn: () => base44.entities.Receiving.list('-date_received', 5000),
  });

  // Fetch AppSettings for excise rate
  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list('-created_at', 5000),
  });

  const companyName = appSettings.find(s => s.key === 'company_name')?.value || '';

  // Excise rate is date-aware: uses the NZ Customs rate applicable to the selected month
  const [selectedYear, selectedMonthNum] = selectedMonth.split('-').map(Number);
  const monthStartDate = new Date(selectedYear, selectedMonthNum - 1, 1);
  const rateInfo = getExciseRate(monthStartDate);
  const exciseRate = rateInfo.rate;
  const rateLabel = rateInfo.label;

  // --- Current total LALs (all stock locations) ---
  const currentFinishedLALs = finishedGoods.reduce((s, g) => s + (g.total_lals || 0), 0);
  const currentWarehouseLALs = warehouseStock.reduce((s, w) => s + (w.total_lals || 0), 0);
  const currentTankLALs = tanks.reduce((s, t) => s + ((t.current_volume || 0) * (t.current_abv || 0) / 100), 0);
  const currentTotalLALs = currentFinishedLALs + currentWarehouseLALs + currentTankLALs;

  // --- LALs Produced (hearts from distillation runs in month) ---
  const monthDistillations = distillationRuns.filter(r => inMonth(r.date));
  const lalsProduced = monthDistillations.reduce((s, r) => s + (r.hearts_lals || 0), 0);

  // --- LALs Received (ethanol inbound) ---
  const monthReceivings = receivingsAll.filter(r => inMonth(r.date_received) && r.material_type === 'Ethanol');
  const lalsReceived = monthReceivings.reduce((s, r) => s + (r.lals || 0), 0);

  // --- LALs Bottled (input_lals from bottling runs in month) ---
  const monthBottlings = bottlingRuns.filter(r => inMonth(r.date));
  const lalsBottled = monthBottlings.reduce((s, r) => s + (r.input_lals || 0), 0);

  // --- LALs Wasted ---
  const monthWastage = wastage.filter(w => inMonth(w.date));
  const lalsWasted = monthWastage.reduce((s, w) => s + (w.lals || 0), 0);

  // --- Dispatches in month ---
  const monthDispatches = dispatches.filter(d => inMonth(d.dispatch_date));

  // === EXCISE CALCULATION ===

  // 1. Taxable distillery dispatches — must be explicitly from Bluff (not 3PL, not UK, not unknown)
  // Duty free and export dispatches from Bluff are excise exempt
  // UK Bonded dispatches are entirely excluded from excise (stock is under bond, no NZ excise)
  const isBluffDispatch = (d) => {
    const from = (d.dispatched_from || '').toLowerCase().trim();
    // Exclude anything from a 3PL warehouse (Auckland or UK Bonded) — everything else is Bluff
    // This correctly handles null/blank dispatched_from (older records = Bluff)
    return !from.includes('auckland') && !from.includes('3pl') && !from.includes('uk') && !from.includes('bonded');
  };

  const isUKBonded = (d) => {
    const from = (d.dispatched_from || '').toLowerCase().trim();
    return from.includes('uk') || from.includes('bonded');
  };

  const bluffDispatchLals = monthDispatches
    .filter(d =>
      isBluffDispatch(d) &&
      d.duty_free !== true &&
      d.is_export !== true
    )
    .reduce((s, d) => s + (d.total_lals || 0), 0);

  // Exempt distillery dispatches — duty free and export from Bluff
  const dutyFreeFromBluff = monthDispatches
    .filter(d => isBluffDispatch(d) && d.duty_free === true)
    .reduce((s, d) => s + (d.total_lals || 0), 0);
  const exportFromBluff = monthDispatches
    .filter(d => isBluffDispatch(d) && d.is_export === true)
    .reduce((s, d) => s + (d.total_lals || 0), 0);
  const bluffExemptLals = dutyFreeFromBluff + exportFromBluff;

  // 2. LALs transferred to Auckland 3PL this month — taxable at point of transfer.
  const transfersToWarehouse = warehouseStockAll.filter(ws => {
    const d = ws.transfer_date || ws.date_transferred_in;
    return d && inMonth(d) && (ws.warehouse_location || 'Auckland 3PL') === 'Auckland 3PL';
  });
  const transferLals = transfersToWarehouse.reduce((s, ws) => s + (ws.total_lals || 0), 0);

  // 2b. LALs transferred to UK Bonded warehouse this month — treated as overseas exports (excise exempt).
  const transfersToUKBonded = warehouseStockAll.filter(ws => {
    const d = ws.transfer_date || ws.date_transferred_in;
    return d && inMonth(d) && (ws.warehouse_location || '') === 'UK Bonded';
  });
  const ukBondedExportLals = transfersToUKBonded.reduce((s, ws) => s + (ws.total_lals || 0), 0);

  // 3. Duty free OR export dispatches from 3PL this month — both are excise exempt
  const dutyFreeFrom3PL = monthDispatches
    .filter(d => (d.dispatched_from || '').includes('Auckland') && d.duty_free === true)
    .reduce((s, d) => s + (d.total_lals || 0), 0);
  const exportFrom3PL = monthDispatches
    .filter(d => (d.dispatched_from || '').includes('Auckland') && d.is_export === true)
    .reduce((s, d) => s + (d.total_lals || 0), 0);
  const exemptFrom3PL = dutyFreeFrom3PL + exportFrom3PL;

  // 4. Net taxable 3PL LALs
  // If there was a transfer this month: taxable = transfer LALs minus exempt dispatches from 3PL
  // If there was NO transfer this month: the exempt dispatches are still a deduction (excise
  // was pre-paid when stock was originally transferred — duty free/export dispatches get a credit)
  const net3PLTaxableLals = transferLals - exemptFrom3PL;
  // Note: net3PLTaxableLals can be negative (credit) when exempt dispatches exceed transfers

  // 5. Bottle size breakdowns for each category
  const breakdownBySize = (dispatchList) => {
    const sizes = {};
    dispatchList.forEach(d => {
      const size = d.bottle_size_ml ? `${d.bottle_size_ml}ml` : 'Unknown';
      if (!sizes[size]) sizes[size] = { bottles: 0, lals: 0 };
      sizes[size].bottles += d.quantity_bottles || 0;
      sizes[size].lals += d.total_lals || 0;
    });
    return Object.entries(sizes).sort(([a],[b]) => parseInt(b) - parseInt(a));
  };

  const bluffTaxableDispatches = monthDispatches.filter(d => isBluffDispatch(d) && d.duty_free !== true && d.is_export !== true);
  const bluffDutyFreeDispatches = monthDispatches.filter(d => isBluffDispatch(d) && d.duty_free === true);
  const bluffExportDispatches = monthDispatches.filter(d => isBluffDispatch(d) && d.is_export === true);
  const threePLDutyFreeDispatches = monthDispatches.filter(d => (d.dispatched_from||'').includes('Auckland') && d.duty_free === true);
  const threePLExportDispatches = monthDispatches.filter(d => (d.dispatched_from||'').includes('Auckland') && d.is_export === true);

  const bluffTaxableBreakdown = breakdownBySize(bluffTaxableDispatches);
  const bluffDutyFreeBreakdown = breakdownBySize(bluffDutyFreeDispatches);
  const bluffExportBreakdown = breakdownBySize(bluffExportDispatches);
  const threePLTransferBreakdown = breakdownBySize(transfersToWarehouse.map(ws => ({ bottle_size_ml: ws.bottle_size_ml, quantity_bottles: ws.quantity_bottles, total_lals: ws.total_lals })));
  const threePLDutyFreeBreakdown = breakdownBySize(threePLDutyFreeDispatches);
  const threePLExportBreakdown = breakdownBySize(threePLExportDispatches);
  const ukBondedTransferBreakdown = breakdownBySize(transfersToUKBonded.map(ws => ({ bottle_size_ml: ws.bottle_size_ml, quantity_bottles: ws.quantity_bottles, total_lals: ws.total_lals })));

  // Debug — log exempt records to find what's being incorrectly flagged
  const exportRecords = monthDispatches.filter(d => isBluffDispatch(d) && d.is_export === true);
  const dutyFreeRecords = monthDispatches.filter(d => isBluffDispatch(d) && d.duty_free === true);
  const df3PLRecords = monthDispatches.filter(d => (d.dispatched_from||'').includes('Auckland') && d.duty_free === true);



  // Debug — log all dispatch records contributing to bluffDispatchLals

  const bluffDispatches = monthDispatches.filter(d => isBluffDispatch(d) && d.duty_free !== true && d.is_export !== true);
  console.log('[ExciseReturn] Bluff taxable dispatches:', bluffDispatches.map(d => ({
    date: d.dispatch_date,
    customer: d.customer_name,
    product: d.product_name,
    bottles: d.quantity_bottles,
    lals: d.total_lals,
    from: d.dispatched_from,
  })));


  // 5. Total excise payable LALs
  // Total taxable = bluff taxable + net 3PL (net3PL can be negative = credit when no transfer this month)
  const totalTaxableLals = Math.max(0, bluffDispatchLals + net3PLTaxableLals);

  // Excise due (GST exclusive + GST inclusive at 15%)
  const exciseDueGSTExcl = totalTaxableLals * exciseRate;
  const gstAmount = exciseDueGSTExcl * 0.15;
  const exciseDueGSTIncl = exciseDueGSTExcl + gstAmount;

  // --- Non-taxable categories (for info only) ---
  const standard3PLDispatchLals = monthDispatches
    .filter(d => (d.dispatched_from || '').includes('Auckland') && !d.duty_free && !d.is_export && !d.sample_dispatch)
    .reduce((s, d) => s + (d.total_lals || 0), 0);

  const lalsSamples = monthDispatches
    .filter(d => d.sample_dispatch && isBluffDispatch(d))
    .reduce((s, d) => s + (d.total_lals || 0), 0);

  const lals3PLSamples = monthDispatches
    .filter(d => d.sample_dispatch && (d.dispatched_from || '').includes('Auckland'))
    .reduce((s, d) => s + (d.total_lals || 0), 0);

  // Bottle size breakdowns for information section
  const sampleBluffBreakdown = breakdownBySize(
    monthDispatches.filter(d => d.sample_dispatch && isBluffDispatch(d))
  );
  const standard3PLBreakdown = breakdownBySize(
    monthDispatches.filter(d => (d.dispatched_from || '').includes('Auckland') && !d.duty_free && !d.is_export && !d.sample_dispatch)
  );
  const sample3PLBreakdown = breakdownBySize(
    monthDispatches.filter(d => d.sample_dispatch && (d.dispatched_from || '').includes('Auckland'))
  );

  // --- All dispatched LALs (for mass balance) ---
  const allDispatchedLals = monthDispatches.reduce((s, d) => s + (d.total_lals || 0), 0);

  // --- Opening / Closing LALs ---
  const openingLALs = currentTotalLALs + allDispatchedLals + lalsWasted - lalsProduced;
  const closingLALs = openingLALs + lalsProduced - allDispatchedLals - lalsWasted;

  // --- Mass balance check ---
  const discrepancy = Math.abs(closingLALs - currentTotalLALs);
  const isBalanced = discrepancy < 0.5;

  // --- Breakdown: LALs dispatched by customer ---
  const dispatchByCustomer = useMemo(() => {
    const map = {};
    monthDispatches.forEach(d => {
      const name = d.customer_name || 'Unknown';
      if (!map[name]) map[name] = { name, lals: 0, hasSamples: false };
      map[name].lals += d.total_lals || 0;
      if (d.sample_dispatch) map[name].hasSamples = true;
    });
    return Object.values(map).sort((a, b) => b.lals - a.lals);
  }, [monthDispatches]);

  // --- Breakdown: LALs produced by batch ---
  const producedByBatch = useMemo(() => {
    const map = {};
    monthDistillations.forEach(r => {
      const batch = r.batch_number || 'Unknown';
      map[batch] = (map[batch] || 0) + (r.hearts_lals || 0);
    });
    return Object.entries(map).map(([batch, lals]) => ({ batch, lals })).sort((a, b) => b.lals - a.lals);
  }, [monthDistillations]);

  const handleCopy = () => {
    const text = [
      `EXCISE RETURN — ${monthLabel.toUpperCase()}`,
      `Company: ${companyName}`,
      `Category: Spirits containing more than 23% vol.`,
      ``,
      `Distillery Dispatches:`,
      `  Gross dispatches:              ${(bluffDispatchLals + bluffExemptLals).toFixed(3)} LALs`,
      `  Less duty free:               (${dutyFreeFromBluff.toFixed(3)} LALs)`,
      `  Less export/overseas:         (${exportFromBluff.toFixed(3)} LALs)`,
      `  Net taxable (distillery):      ${bluffDispatchLals.toFixed(3)} LALs`,
      ``,
      `Overseas Export (UK Bonded Warehouse):`,
      `  Transferred to UK Bonded:      ${ukBondedExportLals.toFixed(3)} LALs`,
      `  (excise exempt — exported under bond)`,
      ``,
      `3PL Transfers:`,
      `  Transferred to 3PL:            ${transferLals.toFixed(3)} LALs`,
      `  Less duty free from 3PL:      (${dutyFreeFrom3PL.toFixed(3)} LALs)`,
      `  Less export from 3PL:         (${exportFrom3PL.toFixed(3)} LALs)`,
      `  Net taxable (3PL):             ${net3PLTaxableLals.toFixed(3)} LALs`,
      ``,
      `TOTAL TAXABLE LALs:              ${totalTaxableLals.toFixed(3)} LALs`,
      `Excise Rate:                     $${exciseRate.toFixed(3)} per LAL (GST excl.)`,
      `Excise Due (GST excl.):          $${exciseDueGSTExcl.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `GST (15%):                       $${gstAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `Total Excise (GST incl.):        $${exciseDueGSTIncl.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      ``,
      `Wastage:                         ${lalsWasted.toFixed(3)} LALs`,
      `Closing Stock:                   ${closingLALs.toFixed(3)}`,
    ].join('\n');

    navigator.clipboard.writeText(text).then(() => {
      toast.success('Copied to clipboard — ready for TSW');
    }).catch(() => {
      toast.error('Failed to copy');
    });
  };

  return (
    <div className="space-y-6">
      {/* Month selector + Copy */}
      <Card className="p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">Excise Return — Monthly Summary</h3>
              <p className="text-xs text-muted-foreground">Suitable for NZ Trade Single Window submission</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div>
              <Label className="text-xs">Month / Year</Label>
              <Input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="w-40 text-sm"
              />
            </div>
            <Button onClick={handleCopy} className="gap-2 mt-5">
              <Copy className="w-4 h-4" /> Copy for TSW
            </Button>
          </div>
        </div>
      </Card>

      {/* Excise Summary */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/30">
          <h4 className="text-sm font-semibold">{monthLabel} — Excise Return Summary</h4>
        </div>
        <div className="divide-y divide-border">
          <ExciseRow label="LALs Produced (hearts)" value={lalsProduced} sub={`${monthDistillations.length} distillation run(s)`} />
          <ExciseRow label="LALs Received (ethanol inbound)" value={lalsReceived} sub={`${monthReceivings.length} ethanol receiving(s)`} />

          {/* Taxable Dispatches section */}
          <SectionHeader label="Taxable Dispatches" />
          <ExciseRow label="Gross Distillery Dispatches" value={bluffDispatchLals + bluffExemptLals} sub="all dispatches incl. exempt" indent />
          {bluffTaxableBreakdown.length > 0 && (
            <div className="px-8 py-1.5 bg-muted/30 space-y-0.5">
              {bluffTaxableBreakdown.map(([size, d]) => (
                <div key={size} className="flex justify-between text-xs text-muted-foreground">
                  <span>{size} — {d.bottles} bottles</span>
                  <span className="font-mono">{d.lals.toFixed(4)} LALs</span>
                </div>
              ))}
            </div>
          )}
          <ExciseRow label="Less: Duty Free from Distillery" value={dutyFreeFromBluff} displayValue={dutyFreeFromBluff > 0 ? `(${dutyFreeFromBluff.toFixed(3)})` : '0.000'} sub="exempt" indent />
          {bluffDutyFreeBreakdown.length > 0 && (
            <div className="px-8 py-1 bg-amber-50 space-y-0.5">
              {bluffDutyFreeBreakdown.map(([size, d]) => (
                <div key={size} className="flex justify-between text-xs text-amber-600">
                  <span>{size} — {d.bottles} bottles</span>
                  <span className="font-mono">({d.lals.toFixed(4)} LALs)</span>
                </div>
              ))}
            </div>
          )}
          <ExciseRow label="Less: Export from Distillery" value={exportFromBluff} displayValue={exportFromBluff > 0 ? `(${exportFromBluff.toFixed(3)})` : '0.000'} sub="exempt" indent />
          {bluffExportBreakdown.length > 0 && (
            <div className="px-8 py-1 bg-green-50 space-y-0.5">
              {bluffExportBreakdown.map(([size, d]) => (
                <div key={size} className="flex justify-between text-xs text-green-600">
                  <span>{size} — {d.bottles} bottles</span>
                  <span className="font-mono">({d.lals.toFixed(4)} LALs)</span>
                </div>
              ))}
            </div>
          )}
          <ExciseRow label="Net Distillery Taxable LALs" value={bluffDispatchLals} sub="gross minus duty free and export" indent />
          <ExciseRow label="Export / Overseas: UK Bonded Transfers" value={ukBondedExportLals} displayValue={ukBondedExportLals > 0 ? `(${ukBondedExportLals.toFixed(3)})` : '0.000'} sub="excise exempt — exported under bond" indent />
          {ukBondedTransferBreakdown.length > 0 && (
            <div className="px-8 py-1 bg-green-50 space-y-0.5">
              {ukBondedTransferBreakdown.map(([size, d]) => (
                <div key={size} className="flex justify-between text-xs text-green-600">
                  <span>{size} — {d.bottles} bottles</span>
                  <span className="font-mono">({d.lals.toFixed(4)} LALs)</span>
                </div>
              ))}
            </div>
          )}
          <ExciseRow label="Transferred to 3PL" value={transferLals} sub={transferLals === 0 ? "no transfer this month" : "taxable at point of transfer"} indent />
          {threePLTransferBreakdown.length > 0 && (
            <div className="px-8 py-1.5 bg-muted/30 space-y-0.5">
              {threePLTransferBreakdown.map(([size, d]) => (
                <div key={size} className="flex justify-between text-xs text-muted-foreground">
                  <span>{size} — {d.bottles} bottles</span>
                  <span className="font-mono">{d.lals.toFixed(4)} LALs</span>
                </div>
              ))}
            </div>
          )}
          <ExciseRow label="Less: Duty Free from 3PL" value={dutyFreeFrom3PL} displayValue={dutyFreeFrom3PL > 0 ? `(${dutyFreeFrom3PL.toFixed(3)})` : '0.000'} sub="exempt — deducted from payable" indent />
          {threePLDutyFreeBreakdown.length > 0 && (
            <div className="px-8 py-1 bg-amber-50 space-y-0.5">
              {threePLDutyFreeBreakdown.map(([size, d]) => (
                <div key={size} className="flex justify-between text-xs text-amber-600">
                  <span>{size} — {d.bottles} bottles</span>
                  <span className="font-mono">({d.lals.toFixed(4)} LALs)</span>
                </div>
              ))}
            </div>
          )}
          <ExciseRow label="Less: Export / Overseas from 3PL" value={exportFrom3PL} displayValue={exportFrom3PL > 0 ? `(${exportFrom3PL.toFixed(3)})` : '0.000'} sub="exempt — deducted from payable" indent />
          {threePLExportBreakdown.length > 0 && (
            <div className="px-8 py-1 bg-green-50 space-y-0.5">
              {threePLExportBreakdown.map(([size, d]) => (
                <div key={size} className="flex justify-between text-xs text-green-600">
                  <span>{size} — {d.bottles} bottles</span>
                  <span className="font-mono">({d.lals.toFixed(4)} LALs)</span>
                </div>
              ))}
            </div>
          )}
          {net3PLTaxableLals < 0 && (
            <div className="px-6 py-2 bg-blue-50 border-l-4 border-blue-400">
              <p className="text-xs text-blue-700">ℹ No 3PL transfer this month — duty free/export dispatches ({exemptFrom3PL.toFixed(3)} LALs) are deducted from total payable as a credit against prior transfer excise.</p>
            </div>
          )}
          <ExciseRow label="Net 3PL Taxable LALs" value={net3PLTaxableLals} displayValue={net3PLTaxableLals < 0 ? `(${Math.abs(net3PLTaxableLals).toFixed(3)}) credit` : net3PLTaxableLals.toFixed(3)} sub={transferLals === 0 && exemptFrom3PL > 0 ? "credit — exempt dispatches exceed transfers" : "transfers minus exempt dispatches"} indent />

          {/* Total */}
          <ExciseRow label="TOTAL EXCISE PAYABLE LALs" value={totalTaxableLals} sub="Net distillery + Net 3PL taxable" highlight />
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-sm font-medium">Excise Rate</p>
            <p className="text-sm font-mono">${exciseRate.toFixed(3)} per LAL <span className="text-muted-foreground">({rateLabel})</span></p>
          </div>
          <div className="px-4 py-3 bg-primary/5 space-y-1.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">EXCISE DUE</p>
                <p className="text-xs text-muted-foreground">GST excl.</p>
              </div>
              <p className="text-xl font-bold font-mono text-primary">${exciseDueGSTExcl.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">GST (15%)</p>
              <p className="text-sm font-mono">${gstAmount.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
            <div className="flex items-center justify-between border-t border-primary/10 pt-1.5">
              <p className="text-sm font-medium">Total (GST incl.)</p>
              <p className="text-base font-bold font-mono">${exciseDueGSTIncl.toLocaleString('en-NZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>

          {/* For information only section */}
          <SectionHeader label="For Information Only (not deducted)" />
          <ExciseRow label="Samples (Bluff)" value={lalsSamples} sub="taxable — included in distillery total above" indent />
          {sampleBluffBreakdown.length > 0 && (
            <div className="px-8 py-1 bg-blue-50 space-y-0.5">
              {sampleBluffBreakdown.map(([size, d]) => (
                <div key={size} className="flex justify-between text-xs text-blue-700">
                  <span>{size} — {d.bottles} bottles</span>
                  <span className="font-mono">{d.lals.toFixed(4)} LALs</span>
                </div>
              ))}
            </div>
          )}
          <ExciseRow label="Samples (3PL)" value={lals3PLSamples} sub="duty paid at transfer — shown for reference" indent />
          {sample3PLBreakdown.length > 0 && (
            <div className="px-8 py-1 bg-blue-50 space-y-0.5">
              {sample3PLBreakdown.map(([size, d]) => (
                <div key={size} className="flex justify-between text-xs text-blue-700">
                  <span>{size} — {d.bottles} bottles</span>
                  <span className="font-mono">{d.lals.toFixed(4)} LALs</span>
                </div>
              ))}
            </div>
          )}
          <ExciseRow label="Standard 3PL dispatches" value={standard3PLDispatchLals} sub="duty already paid at transfer" indent />
          {standard3PLBreakdown.length > 0 && (
            <div className="px-8 py-1 bg-muted/30 space-y-0.5">
              {standard3PLBreakdown.map(([size, d]) => (
                <div key={size} className="flex justify-between text-xs text-muted-foreground">
                  <span>{size} — {d.bottles} bottles</span>
                  <span className="font-mono">{d.lals.toFixed(4)} LALs</span>
                </div>
              ))}
            </div>
          )}

          {/* Wastage and closing */}
          <ExciseRow label="LALs Wasted" value={lalsWasted} sub={`${monthWastage.length} wastage record(s)`} />
          <ExciseRow label="Opening Stock LALs" value={openingLALs} sub={`Total stock at start of ${monthLabel}`} />
          <ExciseRow label="Closing Stock LALs" value={closingLALs} sub="Opening + Produced - Dispatched - Wasted" highlight />
        </div>
        <div className="px-4 py-3 border-t border-border bg-muted/20 space-y-1">
          <p className="text-xs text-muted-foreground">Current system stock (for reference): {currentTotalLALs.toFixed(3)} LALs</p>
          <p className="text-xs text-muted-foreground">LALs Bottled (no net LAL change): {lalsBottled.toFixed(3)} LALs across {monthBottlings.length} run(s)</p>
          <p className="text-xs text-amber-600">Distillery standard sales and samples are taxable. Duty free and export from Bluff are exempt. Duty free and export from 3PL are deducted from transfer LALs.</p>
        </div>
      </Card>

      {/* Mass Balance Check */}
      <Card className={`p-5 border-2 ${isBalanced ? 'border-emerald-300 bg-emerald-50' : 'border-red-300 bg-red-50'}`}>
        <div className="flex items-center gap-3">
          {isBalanced ? (
            <CheckCircle2 className="w-8 h-8 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-8 h-8 text-red-600 flex-shrink-0" />
          )}
          <div>
            <p className={`font-semibold ${isBalanced ? 'text-emerald-800' : 'text-red-800'}`}>
              {isBalanced ? 'Mass Balance: Balanced ✓' : 'Mass Balance: Discrepancy Detected'}
            </p>
            <p className={`text-sm ${isBalanced ? 'text-emerald-700' : 'text-red-700'}`}>
              {isBalanced
                ? `Closing LALs (${closingLALs.toFixed(3)}) matches current stock (${currentTotalLALs.toFixed(3)}) within 0.5 LAL tolerance.`
                : `Closing LALs (${closingLALs.toFixed(3)}) differs from current stock (${currentTotalLALs.toFixed(3)}) by ${discrepancy.toFixed(3)} LALs. Check for missing or unrecorded movements.`
              }
            </p>
          </div>
        </div>
      </Card>

      {/* Breakdown tables */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-sm font-semibold">LALs Dispatched by Customer — {monthLabel}</h4>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">LALs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispatchByCustomer.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-6 text-muted-foreground">No dispatches in this period</TableCell></TableRow>
                ) : dispatchByCustomer.map(c => (
                  <TableRow key={c.name}>
                    <TableCell className="text-sm font-medium">
                      <div className="flex items-center gap-1.5">
                        {c.name}
                        {c.hasSamples && <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-300">S</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-mono font-semibold text-right">{c.lals.toFixed(3)}</TableCell>
                  </TableRow>
                ))}
                {dispatchByCustomer.length > 0 && (
                  <TableRow className="border-t-2 bg-muted/30">
                    <TableCell className="font-bold text-sm">Total</TableCell>
                    <TableCell className="font-bold text-sm font-mono text-right">{allDispatchedLals.toFixed(3)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h4 className="text-sm font-semibold">LALs Produced by Batch — {monthLabel}</h4>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-right">LALs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {producedByBatch.length === 0 ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-6 text-muted-foreground">No distillation runs in this period</TableCell></TableRow>
                ) : producedByBatch.map(b => (
                  <TableRow key={b.batch}>
                    <TableCell className="text-sm font-mono">{b.batch}</TableCell>
                    <TableCell className="text-sm font-mono font-semibold text-right">{b.lals.toFixed(3)}</TableCell>
                  </TableRow>
                ))}
                {producedByBatch.length > 0 && (
                  <TableRow className="border-t-2 bg-muted/30">
                    <TableCell className="font-bold text-sm">Total</TableCell>
                    <TableCell className="font-bold text-sm font-mono text-right">{lalsProduced.toFixed(3)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}