import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, Info, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { computeExciseReturn } from '@/lib/exciseCalc';

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

// selectedMonth/onMonthChange are normally owned by the Reports page (so the
// "Export CSV" button uses exactly the same period shown here) — the local
// fallback below only kicks in if this is ever rendered without that prop.
export default function ExciseReturn({
  finishedGoods,
  warehouseStock,
  tanks,
  dispatches,
  distillationRuns,
  bottlingRuns,
  wastage,
  selectedMonth: selectedMonthProp,
  onMonthChange,
}) {
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [localMonth, setLocalMonth] = useState(`${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`);
  const selectedMonth = selectedMonthProp ?? localMonth;
  const setSelectedMonth = onMonthChange ?? setLocalMonth;

  const monthDate = parseISO(selectedMonth + '-01');
  const monthLabel = format(monthDate, 'MMMM yyyy');
  const isCurrentMonth = selectedMonth === format(now, 'yyyy-MM');

  const inMonth = (dateStr) => {
    if (!dateStr) return false;
    try { return format(parseISO(dateStr), 'yyyy-MM') === selectedMonth; } catch { return false; }
  };

  // Fetch WarehouseStock for transfer LALs (full history — needed to find
  // every transfer in the selected month, not just current holdings)
  const { data: warehouseStockAll = [] } = useQuery({
    queryKey: ['warehouseStock'],
    queryFn: () => base44.entities.WarehouseStock.list('-transfer_date', 5000),
  });

  // Fetch Receiving for LALs received (ethanol inbound) — informational only,
  // not part of the excise calculation (raw ethanol not yet distilled is not
  // counted toward reportable LAL stock).
  const { data: receivingsAll = [] } = useQuery({
    queryKey: ['receiving'],
    queryFn: () => base44.entities.Receiving.list('-date_received', 5000),
  });

  // Fetch AppSettings for company name
  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list('-created_at', 5000),
  });

  const companyName = appSettings.find(s => s.key === 'company_name')?.value || '';

  const monthReceivings = receivingsAll.filter(r => inMonth(r.date_received) && r.material_type === 'Ethanol');
  const lalsReceived = monthReceivings.reduce((s, r) => s + (r.lals || 0), 0);

  const monthBottlings = (bottlingRuns || []).filter(r => inMonth(r.date));
  const lalsBottled = monthBottlings.reduce((s, r) => s + (r.input_lals || 0), 0);

  // Everything else — same calculation the Reports page's CSV export uses,
  // so the two can never diverge for the same month again.
  const calc = useMemo(() => computeExciseReturn({
    monthDate,
    dispatches,
    warehouseStockAll,
    distillationRuns,
    wastage,
    finishedGoods,
    warehouseStock,
    tanks,
  }), [monthDate, dispatches, warehouseStockAll, distillationRuns, wastage, finishedGoods, warehouseStock, tanks]);

  const {
    rateInfo, exciseRate,
    monthDistillations, monthDispatches, monthWastage,
    lalsProduced, lalsWasted, allDispatchedLals,
    bluffDispatchLals, dutyFreeFromBluff, exportFromBluff, bluffExemptLals,
    transferLals, ukBondedExportLals, dutyFreeFrom3PL, exportFrom3PL, exemptFrom3PL, net3PLTaxableLals,
    totalTaxableLals, exciseDueGSTExcl, gstAmount, exciseDueGSTIncl,
    standard3PLDispatchLals, lalsSamples, lals3PLSamples,
    bluffTaxableBreakdown, bluffDutyFreeBreakdown, bluffExportBreakdown,
    threePLTransferBreakdown, threePLDutyFreeBreakdown, threePLExportBreakdown, ukBondedTransferBreakdown,
    sampleBluffBreakdown, standard3PLBreakdown, sample3PLBreakdown,
    currentTotalLALs, closingLALs, openingLALs,
  } = calc;
  const rateLabel = rateInfo.label;

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
          <ExciseRow label="LALs Received (ethanol inbound)" value={lalsReceived} sub={`${monthReceivings.length} ethanol receiving(s) — informational, not yet distilled so not counted in stock below`} />

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
          <ExciseRow label="Opening Stock LALs" value={openingLALs} sub={`Calculated stock at start of ${monthLabel}`} />
          <ExciseRow label="Closing Stock LALs" value={closingLALs} sub="Opening + Produced - Dispatched - Wasted" highlight />
        </div>
        <div className="px-4 py-3 border-t border-border bg-muted/20 space-y-1">
          <p className="text-xs text-muted-foreground">Current system stock (right now): {currentTotalLALs.toFixed(3)} LALs</p>
          <p className="text-xs text-muted-foreground">LALs Bottled (no net LAL change): {lalsBottled.toFixed(3)} LALs across {monthBottlings.length} run(s)</p>
          <p className="text-xs text-amber-600">Distillery standard sales and samples are taxable. Duty free and export from Bluff are exempt. Duty free and export from 3PL are deducted from transfer LALs.</p>
        </div>
      </Card>

      {/* Stock Reconciliation — Opening/Closing are derived from today's live
          system stock by undoing every recorded movement back to the end of
          the selected month, so they're correct for whichever month is
          selected — but they aren't an independent physical check (there's
          no stored stock-take reading from that date to compare against),
          so this is deliberately informational rather than a pass/fail badge. */}
      <Card className="p-5 border-2 border-border bg-muted/20">
        <div className="flex items-center gap-3">
          <Info className="w-6 h-6 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="font-semibold text-foreground">Stock Reconciliation</p>
            <p className="text-sm text-muted-foreground">
              {isCurrentMonth
                ? `Closing stock for ${monthLabel} (in progress) is today's live system stock: ${closingLALs.toFixed(3)} LALs.`
                : `Closing stock for ${monthLabel} is calculated by working back from today's live system stock (${currentTotalLALs.toFixed(3)} LALs) through every recorded movement since — not an independent stock-take reading from that date.`}
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
