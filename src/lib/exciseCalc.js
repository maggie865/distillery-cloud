import { startOfMonth, endOfMonth, parseISO, isWithinInterval, isAfter } from 'date-fns';
import { getExciseRate } from './exciseRates';

// A dispatch is "from Bluff" unless its dispatched_from names a 3PL/UK/bonded
// location. Correctly treats a null/blank dispatched_from (older records) as
// Bluff. Exported so anywhere else that needs the same distinction (e.g. a
// CSV export) uses this exact rule rather than re-deriving its own.
export const isBluffDispatch = (d) => {
  const from = (d.dispatched_from || '').toLowerCase().trim();
  return !from.includes('auckland') && !from.includes('3pl') && !from.includes('uk') && !from.includes('bonded');
};

const breakdownBySize = (list) => {
  const sizes = {};
  list.forEach(d => {
    const size = d.bottle_size_ml ? `${d.bottle_size_ml}ml` : 'Unknown';
    if (!sizes[size]) sizes[size] = { bottles: 0, lals: 0 };
    sizes[size].bottles += d.quantity_bottles || 0;
    sizes[size].lals += d.total_lals || 0;
  });
  return Object.entries(sizes).sort(([a], [b]) => parseInt(b) - parseInt(a));
};

// Single source of truth for the monthly excise return — used by both the
// on-screen Excise Return report and the Reports page's "Export CSV" button,
// so the two can never show different numbers for the same month again.
// dispatches/distillationRuns/wastage/warehouseStockAll must be FULL,
// unfiltered history (not just the target month) — Opening/Closing stock
// needs everything up to today to correctly roll back to the month's actual
// end date. finishedGoods/warehouseStock/tanks are current live snapshots.
export function computeExciseReturn({
  monthDate,
  dispatches = [],
  warehouseStockAll = [],
  distillationRuns = [],
  wastage = [],
  finishedGoods = [],
  warehouseStock = [],
  tanks = [],
}) {
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);

  const inMonth = (dateStr) => {
    if (!dateStr) return false;
    try { return isWithinInterval(parseISO(dateStr), { start: monthStart, end: monthEnd }); } catch { return false; }
  };
  const isAfterMonth = (dateStr) => {
    if (!dateStr) return false;
    try { return isAfter(parseISO(dateStr), monthEnd); } catch { return false; }
  };

  const rateInfo = getExciseRate(monthStart);
  const exciseRate = rateInfo.rate;

  const monthDispatches = dispatches.filter(d => inMonth(d.dispatch_date));
  const monthDistillations = distillationRuns.filter(r => inMonth(r.date));
  const monthWastage = wastage.filter(w => inMonth(w.date));

  const lalsProduced = monthDistillations.reduce((s, r) => s + (r.hearts_lals || 0), 0);
  const lalsWasted = monthWastage.reduce((s, w) => s + (w.lals || 0), 0);

  // 1. Taxable distillery dispatches — must be explicitly from Bluff (not
  // 3PL, not UK, not unknown). Duty free and export dispatches from Bluff
  // are excise exempt.
  const bluffDispatchLals = monthDispatches
    .filter(d => isBluffDispatch(d) && d.duty_free !== true && d.is_export !== true)
    .reduce((s, d) => s + (d.total_lals || 0), 0);

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

  // 2b. LALs transferred to UK Bonded warehouse this month — overseas export (excise exempt).
  const transfersToUKBonded = warehouseStockAll.filter(ws => {
    const d = ws.transfer_date || ws.date_transferred_in;
    return d && inMonth(d) && (ws.warehouse_location || '') === 'UK Bonded';
  });
  const ukBondedExportLals = transfersToUKBonded.reduce((s, ws) => s + (ws.total_lals || 0), 0);

  // 3. Duty free OR export dispatches from 3PL this month — both excise exempt.
  const dutyFreeFrom3PL = monthDispatches
    .filter(d => (d.dispatched_from || '').includes('Auckland') && d.duty_free === true)
    .reduce((s, d) => s + (d.total_lals || 0), 0);
  const exportFrom3PL = monthDispatches
    .filter(d => (d.dispatched_from || '').includes('Auckland') && d.is_export === true)
    .reduce((s, d) => s + (d.total_lals || 0), 0);
  const exemptFrom3PL = dutyFreeFrom3PL + exportFrom3PL;

  // 4. Net taxable 3PL LALs — can be negative (a credit) when exempt
  // dispatches this month exceed transfers this month.
  const net3PLTaxableLals = transferLals - exemptFrom3PL;

  // 5. Bottle size breakdowns for each category
  const bluffTaxableDispatches = monthDispatches.filter(d => isBluffDispatch(d) && d.duty_free !== true && d.is_export !== true);
  const bluffDutyFreeDispatches = monthDispatches.filter(d => isBluffDispatch(d) && d.duty_free === true);
  const bluffExportDispatches = monthDispatches.filter(d => isBluffDispatch(d) && d.is_export === true);
  const threePLDutyFreeDispatches = monthDispatches.filter(d => (d.dispatched_from || '').includes('Auckland') && d.duty_free === true);
  const threePLExportDispatches = monthDispatches.filter(d => (d.dispatched_from || '').includes('Auckland') && d.is_export === true);

  const bluffTaxableBreakdown = breakdownBySize(bluffTaxableDispatches);
  const bluffDutyFreeBreakdown = breakdownBySize(bluffDutyFreeDispatches);
  const bluffExportBreakdown = breakdownBySize(bluffExportDispatches);
  const threePLTransferBreakdown = breakdownBySize(transfersToWarehouse.map(ws => ({ bottle_size_ml: ws.bottle_size_ml, quantity_bottles: ws.quantity_bottles, total_lals: ws.total_lals })));
  const threePLDutyFreeBreakdown = breakdownBySize(threePLDutyFreeDispatches);
  const threePLExportBreakdown = breakdownBySize(threePLExportDispatches);
  const ukBondedTransferBreakdown = breakdownBySize(transfersToUKBonded.map(ws => ({ bottle_size_ml: ws.bottle_size_ml, quantity_bottles: ws.quantity_bottles, total_lals: ws.total_lals })));

  // Total excise payable LALs — Bluff taxable + net 3PL (net3PL can be
  // negative = credit when no transfer this month).
  const totalTaxableLals = Math.max(0, bluffDispatchLals + net3PLTaxableLals);

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

  const sampleBluffBreakdown = breakdownBySize(monthDispatches.filter(d => d.sample_dispatch && isBluffDispatch(d)));
  const standard3PLBreakdown = breakdownBySize(monthDispatches.filter(d => (d.dispatched_from || '').includes('Auckland') && !d.duty_free && !d.is_export && !d.sample_dispatch));
  const sample3PLBreakdown = breakdownBySize(monthDispatches.filter(d => d.sample_dispatch && (d.dispatched_from || '').includes('Auckland')));

  // --- All dispatched LALs this month (for the customer breakdown / reconciliation) ---
  const allDispatchedLals = monthDispatches.reduce((s, d) => s + (d.total_lals || 0), 0);

  // --- Current live stock (finished goods + warehouse + tanks) ---
  const currentFinishedLALs = finishedGoods.reduce((s, g) => s + (g.total_lals || 0), 0);
  const currentWarehouseLALs = warehouseStock.reduce((s, w) => s + (w.total_lals || 0), 0);
  const currentTankLALs = tanks.reduce((s, t) => s + ((t.current_volume || 0) * (t.current_abv || 0) / 100), 0);
  const currentTotalLALs = currentFinishedLALs + currentWarehouseLALs + currentTankLALs;

  // --- Opening / Closing stock, correctly time-shifted to the selected month ---
  // currentTotalLALs is always "right now". For a past month, that live
  // figure has to be rolled back through everything recorded AFTER the
  // month ended too — not just the month's own activity — or Closing Stock
  // only ever comes out correct when reporting on the current, in-progress
  // month (which is not even the default view).
  const producedAfterMonth = distillationRuns.reduce((s, r) => s + (isAfterMonth(r.date) ? (r.hearts_lals || 0) : 0), 0);
  const dispatchedAfterMonth = dispatches.reduce((s, d) => s + (isAfterMonth(d.dispatch_date) ? (d.total_lals || 0) : 0), 0);
  const wastedAfterMonth = wastage.reduce((s, w) => s + (isAfterMonth(w.date) ? (w.lals || 0) : 0), 0);

  const closingLALs = currentTotalLALs - producedAfterMonth + dispatchedAfterMonth + wastedAfterMonth;
  const openingLALs = closingLALs - lalsProduced + allDispatchedLals + lalsWasted;

  return {
    monthStart, monthEnd, rateInfo, exciseRate,
    monthDispatches, monthDistillations, monthWastage,
    lalsProduced, lalsWasted, allDispatchedLals,
    bluffDispatchLals, dutyFreeFromBluff, exportFromBluff, bluffExemptLals,
    transfersToWarehouse, transferLals, transfersToUKBonded, ukBondedExportLals,
    dutyFreeFrom3PL, exportFrom3PL, exemptFrom3PL, net3PLTaxableLals,
    totalTaxableLals, exciseDueGSTExcl, gstAmount, exciseDueGSTIncl,
    standard3PLDispatchLals, lalsSamples, lals3PLSamples,
    bluffTaxableBreakdown, bluffDutyFreeBreakdown, bluffExportBreakdown,
    threePLTransferBreakdown, threePLDutyFreeBreakdown, threePLExportBreakdown, ukBondedTransferBreakdown,
    sampleBluffBreakdown, standard3PLBreakdown, sample3PLBreakdown,
    currentTotalLALs, closingLALs, openingLALs,
  };
}
