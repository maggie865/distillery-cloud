import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Zap, Droplets, ChevronDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { distillationRunEnergy, snsRunEnergy, CONDENSER_LPH_MIN, CONDENSER_LPH_MAX } from '@/lib/stillEnergy';

// Calculated (not metered) still electricity/water use, built from each
// run's own timing fields — see src/lib/stillEnergy.js for the full
// reasoning. This is a breakdown of what's already inside the metered
// electricity total logged above, not an additional emissions source, so
// it deliberately isn't added into any CO2e total — it's here to show
// which part of the bill the stills account for, and how much water the
// closed-loop condenser avoids drawing from mains over time.
export default function StillEnergyReport({ totalMeteredKwh = 0, startDate = '', endDate = '' }) {
  const [open, setOpen] = useState(true);
  const { data: allDistillationRuns = [] } = useQuery({ queryKey: ['distillationRuns'], queryFn: () => db.DistillationRun.list('-date', 5000) });
  const { data: allSnsRuns = [] } = useQuery({ queryKey: ['snsRuns'], queryFn: () => db.SNSRun.list('-date', 5000) });

  // Matches whatever period the Utilities page has selected, so the "% of
  // metered electricity" comparison below is apples-to-apples — comparing
  // all-time still runs against one filtered billing period would be
  // meaningless.
  const inRange = (dateStr) => {
    if (!dateStr) return false;
    if (startDate && dateStr < startDate) return false;
    if (endDate && dateStr > endDate) return false;
    return true;
  };
  const hasDateFilter = !!(startDate || endDate);
  const distillationRuns = hasDateFilter ? allDistillationRuns.filter((r) => inRange(r.date)) : allDistillationRuns;
  const snsRuns = hasDateFilter ? allSnsRuns.filter((r) => inRange(r.date)) : allSnsRuns;

  const rows = useMemo(() => {
    const distRows = distillationRuns.map((r) => {
      const e = distillationRunEnergy(r);
      return e ? { ...e, id: r.id, date: r.date, batch_number: r.batch_number, type: 'Distillation' } : null;
    }).filter(Boolean);
    const snsRows = snsRuns.map((r) => {
      const e = snsRunEnergy(r);
      return e ? { ...e, id: r.id, date: r.date, batch_number: r.batch_number || '—', type: 'SNS' } : null;
    }).filter(Boolean);
    return [...distRows, ...snsRows].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [distillationRuns, snsRuns]);

  const totals = rows.reduce((acc, r) => ({
    kwh: acc.kwh + r.kwh,
    waterSaved: acc.waterSaved + r.waterSavedLitres,
    dephlegmator: acc.dephlegmator + (r.dephlegmatorLitres || 0),
  }), { kwh: 0, waterSaved: 0, dephlegmator: 0 });

  const missingCount = distillationRuns.length + snsRuns.length - rows.length;
  const sharePct = totalMeteredKwh > 0 ? (totals.kwh / totalMeteredKwh) * 100 : null;

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-1"><Zap className="w-4 h-4" /> Still Process Energy &amp; Water (calculated)</h2>
      <p className="text-xs text-muted-foreground mb-4">
        From still run timing, not a separate meter — DYE-II-300L, 3 × 7kW elements. Normal runs: 3 elements until Heads, 2 through Heads &amp; Hearts, back to 3 for Tails. SNS runs: all 3 elements the whole run.
        The condenser runs closed-loop in both, so its rated flow ({CONDENSER_LPH_MIN}–{CONDENSER_LPH_MAX} L/hr) is water saved rather than water used.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" /> Estimated Still Electricity</p>
          <p className="text-xl font-bold text-primary">{totals.kwh.toFixed(1)} <span className="text-sm font-normal text-muted-foreground">kWh</span></p>
          {sharePct !== null && <p className="text-xs text-muted-foreground mt-0.5">≈ {sharePct.toFixed(1)}% of metered electricity {hasDateFilter ? 'in this period' : 'to date'}</p>}
        </div>
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
          <p className="text-xs text-emerald-800 flex items-center gap-1"><Droplets className="w-3 h-3" /> Water Saved — Closed-Loop Condenser</p>
          <p className="text-xl font-bold text-emerald-700">{(totals.waterSaved / 1000).toFixed(2)} <span className="text-sm font-normal text-emerald-800/70">m³</span></p>
          <p className="text-xs text-emerald-800/70 mt-0.5">{totals.waterSaved.toLocaleString()} L avoided vs. single-pass cooling</p>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Droplets className="w-3 h-3" /> Dephlegmator Water Used (SNS)</p>
          <p className="text-xl font-bold text-foreground">{totals.dephlegmator.toLocaleString()} <span className="text-sm font-normal text-muted-foreground">L</span></p>
        </div>
      </div>

      {missingCount > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-3">
          {missingCount} run{missingCount === 1 ? '' : 's'} missing run timing — log Run Start/End (and cut times, for normal runs) to include them here.
        </p>
      )}

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <span>{rows.length} run{rows.length === 1 ? '' : 's'} with timing logged</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="overflow-x-auto border rounded-lg mt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">kWh</TableHead>
                  <TableHead className="text-right">Water Saved (L)</TableHead>
                  <TableHead className="text-right">Dephlegmator (L)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No runs with timing logged yet</TableCell></TableRow>
                ) : rows.map((r) => (
                  <TableRow key={`${r.type}-${r.id}`}>
                    <TableCell className="text-sm whitespace-nowrap">{r.date ? format(parseISO(r.date), 'd MMM yyyy') : '—'}</TableCell>
                    <TableCell className="text-sm font-mono">{r.batch_number || '—'}</TableCell>
                    <TableCell className="text-sm">{r.type}{!r.complete ? <span className="text-amber-600"> (partial)</span> : ''}</TableCell>
                    <TableCell className="text-sm text-right">{r.totalHours.toFixed(2)}h</TableCell>
                    <TableCell className="text-sm text-right font-medium">{r.kwh.toFixed(2)}</TableCell>
                    <TableCell className="text-sm text-right text-emerald-700">{r.waterSavedLitres.toFixed(0)}</TableCell>
                    <TableCell className="text-sm text-right">
                      {r.dephlegmatorLitres != null ? `${r.dephlegmatorLitres.toFixed(0)}${r.dephlegmatorIsEstimate ? ' (est.)' : ''}` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
