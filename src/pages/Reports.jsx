import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { FileSpreadsheet, Loader2, TrendingDown, PackageCheck, ArrowDownToLine, ArrowUpFromLine, Building2, Truck, MapPin } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval, startOfQuarter, endOfQuarter, startOfYear, subMonths } from 'date-fns';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PageHeader from '@/components/shared/PageHeader';
import Pagination from '@/components/ui/Pagination';
import InventoryReport from '@/components/reports/InventoryReport';
import CostOfGoodsReport from '@/components/reports/CostOfGoodsReport';
import ExciseReturn from '@/components/reports/ExciseReturn';
import ForecastReport from '@/components/reports/ForecastReport';
import MovementsReport from '@/components/reports/MovementsReport';
import CarbonReport from '@/components/reports/CarbonReport';
import IsoLifecycleReport from '@/components/reports/IsoLifecycleReport';
import BatchTraceReport from '@/components/reports/BatchTraceReport';
import { useRawMaterialsNetStock } from '@/hooks/useRawMaterialsNetStock';

function StatCard({ label, value, sub, color = 'text-primary', bg = 'bg-accent border-accent-foreground/10', icon: Icon }) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${bg}`}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className={`w-4 h-4 ${color}`} />}
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function Reports() {
  const now = new Date();
  const [startDate, setStartDate] = useState(format(startOfMonth(now), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(now, 'yyyy-MM-dd'));
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [recvPage, setRecvPage] = useState(1);
  const [recvPageSize, setRecvPageSize] = useState(50);
  const [dispPage, setDispPage] = useState(1);
  const [dispPageSize, setDispPageSize] = useState(50);
  const [wastePage, setWastePage] = useState(1);
  const [wastePageSize, setWastePageSize] = useState(50);

  const setPreset = (key) => {
    const today = new Date();
    let s, e;
    switch (key) {
      case 'thisMonth': s = startOfMonth(today); e = endOfMonth(today); break;
      case 'lastMonth': { const lm = subMonths(today, 1); s = startOfMonth(lm); e = endOfMonth(lm); break; }
      case 'thisQuarter': s = startOfQuarter(today); e = endOfQuarter(today); break;
      case 'thisYear': s = startOfYear(today); e = today; break;
      case 'last12': s = subMonths(today, 12); e = today; break;
      default: return;
    }
    setStartDate(format(s, 'yyyy-MM-dd'));
    setEndDate(format(e, 'yyyy-MM-dd'));
  };

  const { data: wastage = [] } = useQuery({ queryKey: ['wastage'], queryFn: () => db.WastageRecord.list('-date', 5000) });
  const { data: receiving = [] } = useQuery({ queryKey: ['receiving'], queryFn: () => db.Receiving.list('-date_received', 5000) });
  const { data: dispatches = [] } = useQuery({
    queryKey: ['dispatches'],
    queryFn: () => db.Dispatch.list('-dispatch_date', 5000),
  });
  const { data: rawMaterials = [] } = useQuery({ queryKey: ['rawMaterials'], queryFn: () => db.RawMaterial.list('name', 5000) });
  const { data: finishedGoods = [] } = useQuery({ queryKey: ['finishedGoods'], queryFn: () => db.FinishedGood.list('product_name', 5000) });
  const { data: warehouseStock = [] } = useQuery({ queryKey: ['warehouseStock'], queryFn: () => db.WarehouseStock.list('-date_transferred_in', 5000) });
  const { data: distillationRuns = [] } = useQuery({ queryKey: ['distillationRuns'], queryFn: () => db.DistillationRun.list('-date', 5000) });
  const { data: bottlingRuns = [] } = useQuery({ queryKey: ['bottlingRuns'], queryFn: () => db.BottlingRun.list('-date', 5000) });
  const { data: masterBatches = [] } = useQuery({ queryKey: ['masterBatches'], queryFn: () => db.MasterBatch.list('-date_started', 5000) });
  const { data: dilutions = [] } = useQuery({ queryKey: ['dilutions'], queryFn: () => db.Dilution.list('-date', 5000) });
  const { data: tankMovements = [] } = useQuery({ queryKey: ['tankMovements'], queryFn: () => db.TankMovement.list('-date', 5000) });
  const { data: tanks = [] } = useQuery({ queryKey: ['storageTanks'], queryFn: () => db.StorageTank.list('name', 5000) });
  const { data: recipes = [] } = useQuery({ queryKey: ['recipes'], queryFn: () => db.Recipe.list('name', 5000) });

  // Net raw material stock from shared hook (includes receiving-only items with costs)
  const { rawMaterialsWithNetStock: rawMaterialsNetStock } = useRawMaterialsNetStock();

  // Date range
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

  // Filtered data for selected month
  // Exclude tasting/sample bottle wastage records — these are intentional, not losses
  const monthWastage = wastage.filter(w =>
    inRange(w.date) &&
    !(w.reason || '').toLowerCase().includes('tasting') &&
    !(w.reason || '').toLowerCase().includes('sample bottle')
  );
  const monthReceiving = receiving.filter(r => inRange(r.date_received));
  const monthDispatches = dispatches.filter(d => inRange(d.dispatch_date));
  const warehouseDispatches = monthDispatches.filter(d => d.notes?.startsWith('[3PL]'));
  const distilleryDispatches = monthDispatches.filter(d => !d.notes?.startsWith('[3PL]'));
  const monthTankMovements = tankMovements.filter(tm => inRange(tm.date) && tm.counterpart_tank === 'Auckland 3PL');

  // rawMaterialsNetStock is now provided by the shared useRawMaterialsNetStock hook above

  // FinishedGood.quantity_bottles is already the live net quantity —
  // dispatches are deducted from it in real time when a dispatch is saved.
  // No need to recalculate — just use the DB values directly.
  // Normalise names for display: strip doubled/trailing size suffixes.
  const normProductName = (name) => (name || '').trim()
    .replace(/(\s*\d{3,4}ml)\s*\1/gi, '')
    .replace(/\s*\d{3,4}ml\s*$/i, '').trim();

  const finishedGoodsWithStock = finishedGoods.map(g => ({
    ...g,
    product_name: normProductName(g.product_name),
  }));

  // Inventory snapshot totals
  const totalDistilleryBottles = finishedGoodsWithStock.reduce((s, g) => s + (g.quantity_bottles || 0), 0);
  const totalDistilleryLals = finishedGoodsWithStock.reduce((s, g) => s + (g.total_lals || 0), 0);
  const totalWarehouseBottles = warehouseStock.reduce((s, w) => s + (w.quantity_bottles || 0), 0);
  const totalWarehouseLals = warehouseStock.reduce((s, w) => s + (w.total_lals || 0), 0);
  const totalEthanolLals = rawMaterialsNetStock.filter(m => m.type === 'ethanol').reduce((s, m) => s + (m.lals || 0), 0);

  // COGS breakdown is now rendered by the CostOfGoodsReport component

  // Combined wastage: use WastageRecord entity only (distillation dumps are already stored there)
  const combinedWastage = monthWastage;

  // Wastage stats
  const totalWastedLals = combinedWastage.reduce((s, w) => s + (w.lals || 0), 0);
  const totalWastedVol = combinedWastage.reduce((s, w) => s + (w.volume || 0), 0);

  // Cost per LAL: look up cost from ethanol raw materials
  const ethanolCostPerLal = rawMaterials.filter(m => m.type === 'ethanol' && m.cost_per_unit)
    .reduce((avg, m, _, arr) => avg + m.cost_per_unit / arr.length, 0) || 3.5;

  const wastageWithCost = combinedWastage.map(w => {
    const costPerLal = ethanolCostPerLal;
    const totalLoss = parseFloat(((w.lals || 0) * costPerLal).toFixed(2));
    return { ...w, cost_per_lal: costPerLal, total_loss: totalLoss };
  });

  const totalWastageCost = wastageWithCost.reduce((s, w) => s + w.total_loss, 0);
  const avgCostPerLalWasted = totalWastedLals > 0 ? (totalWastageCost / totalWastedLals).toFixed(2) : '0.00';

  // Wastage by source for bar chart
  const wastageBySource = ['distillation', 'bottling', 'tank', 'sns_distillation', 'other'].map(src => {
    const label = src === 'sns_distillation' ? 'SNS Distillation' : src.charAt(0).toUpperCase() + src.slice(1);
    return {
      source: label,
      lals: parseFloat(combinedWastage.filter(w => w.source === src).reduce((s, w) => s + (w.lals || 0), 0).toFixed(3)),
      volume: parseFloat(combinedWastage.filter(w => w.source === src).reduce((s, w) => s + (w.volume || 0), 0).toFixed(2)),
    };
  }).filter(d => d.lals > 0 || d.volume > 0);

  // 6-month trend (always last 6 calendar months regardless of date range)
  const trendData = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const s = startOfMonth(d);
    const e = endOfMonth(d);
    const inM = (ds) => { try { return ds && isWithinInterval(parseISO(ds), { start: s, end: e }); } catch { return false; } };
    return {
      month: format(s, 'MMM yy'),
      received: receiving.filter(r => inM(r.date_received)).reduce((acc, r) => acc + (r.lals || 0), 0),
      dispatched: dispatches.filter(d => inM(d.dispatch_date)).reduce((acc, d) => acc + (d.quantity_bottles || 0), 0),
      wasted: parseFloat(wastage.filter(w => inM(w.date)).reduce((acc, w) => acc + (w.lals || 0), 0).toFixed(3)),
    };
  });

  const [csvModal, setCsvModal] = useState(null); // { filename, content }

  const exportCSV = (filename, rows, headers) => {
    if (!rows || rows.length === 0) {
      toast.warning(`No data to export for this period (${filename}).`);
      return false;
    }
    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
    try {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('href', url);
      a.setAttribute('download', filename);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} rows to ${filename}`);
    } catch {
      toast.error('Download blocked — use the copy modal below.');
    }
    setCsvModal({ filename, content: csv });
    return true;
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const label = `${startDate}_to_${endDate}`;
      switch (activeTab) {
        case 'overview': {
          const headers = ['product_name','batch_number','bottle_size_ml','abv_percent','quantity_bottles','total_lals'];
          const rows = finishedGoodsWithStock.map(g => ({
            product_name: g.product_name, batch_number: g.batch_number,
            bottle_size_ml: g.bottle_size_ml, abv_percent: g.abv_percent,
            quantity_bottles: g.quantity_bottles, total_lals: g.total_lals,
          }));
          exportCSV(`inventory_snapshot_${label}.csv`, rows, headers);
          break;
        }
        case 'movements': {
          const recvHeaders = ['date_received','packing_slip_number','material_name','supplier','quantity','unit','lals','cost_per_unit'];
          const recvRows = monthReceiving.map(r => ({
            date_received: r.date_received, packing_slip_number: r.packing_slip_number,
            material_name: r.material_name, supplier: r.supplier,
            quantity: r.quantity, unit: r.unit, lals: r.lals, cost_per_unit: r.cost_per_unit,
          }));
          exportCSV(`inbound_movements_${label}.csv`, recvRows, recvHeaders);
          const dispHeaders = ['dispatch_date','customer_name','product_name','batch_number','bottle_size_ml','quantity_bottles','total_lals','dispatched_from','sales_channel','order_reference','sample_dispatch','duty_free','is_export'];
          const dispRows = monthDispatches.map(d => ({
            dispatch_date: d.dispatch_date, customer_name: d.customer_name,
            product_name: d.product_name, batch_number: d.batch_number,
            bottle_size_ml: d.bottle_size_ml, quantity_bottles: d.quantity_bottles,
            total_lals: d.total_lals, dispatched_from: d.dispatched_from,
            sales_channel: d.sales_channel, order_reference: d.order_reference,
            sample_dispatch: d.sample_dispatch, duty_free: d.duty_free, is_export: d.is_export,
          }));
          exportCSV(`outbound_dispatches_${label}.csv`, dispRows, dispHeaders);
          break;
        }
        case 'wastage': {
          const headers = ['date','batch_number','product_name','source','volume','abv','lals','reason'];
          const rows = wastageWithCost.map(w => ({
            date: w.date, batch_number: w.batch_number, product_name: w.product_name,
            source: w.source, volume: w.volume, abv: w.abv, lals: w.lals, reason: w.reason,
          }));
          exportCSV(`wastage_${label}.csv`, rows, headers);
          break;
        }
        case 'carbon': {
          const headers = ['dispatch_date','customer_name','product_name','quantity_bottles','transport_method','transport_distance_km','co2e_kg','dispatched_from'];
          const rows = monthDispatches.filter(d => d.co2e_kg > 0).map(d => ({
            dispatch_date: d.dispatch_date, customer_name: d.customer_name,
            product_name: d.product_name, quantity_bottles: d.quantity_bottles,
            transport_method: d.transport_method, transport_distance_km: d.transport_distance_km,
            co2e_kg: d.co2e_kg, dispatched_from: d.dispatched_from,
          }));
          exportCSV(`carbon_footprint_${label}.csv`, rows, headers);
          break;
        }
        case 'cogs': {
          // Rebuild batch COGS inline for export (mirrors CostOfGoodsReport logic)
          const avgEthCost = (() => {
            const em = rawMaterials.filter(m => (m.type === 'ethanol' || m.type === 'Ethanol') && m.cost_per_unit);
            if (!em.length) return 3.5;
            const tl = em.reduce((s,m)=>s+(m.quantity||0)*(m.abv_percent||96)/100,0);
            const tc = em.reduce((s,m)=>s+(m.quantity||0)*(m.cost_per_unit||0),0);
            return tl > 0 ? tc/tl : em.reduce((avg,m,_,arr)=>avg+m.cost_per_unit/arr.length,0);
          })();
          const allMats = [...rawMaterials];
          const costLookup = {};
          for (const m of allMats) if (m.cost_per_unit && m.name) costLookup[m.name.toLowerCase().trim()] = m.cost_per_unit;
          const findCpu = (name) => {
            if (!name) return 0;
            const lower = name.toLowerCase().trim();
            if (costLookup[lower]) return costLookup[lower];
            for (const [k,v] of Object.entries(costLookup)) if (k.includes(lower)||lower.includes(k)) return v;
            return 0;
          };
          const byBatch = {};
          for (const br of bottlingRuns) {
            if (!br.batch_number || !(br.bottles_produced > 0)) continue;
            if (!byBatch[br.batch_number]) byBatch[br.batch_number] = [];
            byBatch[br.batch_number].push(br);
          }
          const rows = Object.entries(byBatch).map(([batchNumber, runs]) => {
            const mb = masterBatches.find(m => m.batch_code === batchNumber);
            const pn = mb?.product_name || runs[0].product_name;
            const recipe = recipes.filter(r=>r.recipe_type==='spirit'&&r.base_ethanol_volume).find(r=>r.name===pn||pn?.toLowerCase().includes(r.name?.toLowerCase())||r.name?.toLowerCase().includes(pn?.toLowerCase()));
            const bottles700 = runs.filter(r=>r.bottle_size_ml===700).reduce((s,r)=>s+(r.bottles_produced||0),0);
            const bottles200 = runs.filter(r=>r.bottle_size_ml===200).reduce((s,r)=>s+(r.bottles_produced||0),0);
            const bottlesTotal = bottles700 + bottles200;
            const distRuns = distillationRuns.filter(dr=>dr.batch_number===batchNumber);
            const totalDistInput = distRuns.reduce((s,dr)=>s+(dr.input_volume||0),0);
            const totalInputLals = distRuns.reduce((s,dr)=>s+(dr.input_lals||0),0);
            const ethanolCost = totalInputLals * avgEthCost;
            let botanicalCost = 0;
            if (recipe?.base_ethanol_volume) {
              const scale = totalDistInput > 0 ? totalDistInput / recipe.base_ethanol_volume : 1;
              for (const ing of (recipe.ingredients||[])) botanicalCost += (ing.quantity||0) * scale * findCpu(ing.name);
            }
            const pkgRecipe700 = recipes.find(r=>r.recipe_type==='packaging'&&r.name?.toLowerCase().includes('700'));
            const pkgRecipe200 = recipes.find(r=>r.recipe_type==='packaging'&&r.name?.toLowerCase().includes('200'));
            const calcPkg = (pkgR) => pkgR?.packaging?.reduce((s,p)=>s+(p.quantity||1)*findCpu(p.name),0)||0;
            const packagingCost = bottles700*calcPkg(pkgRecipe700||recipe) + bottles200*calcPkg(pkgRecipe200||recipe);
            const totalCost = ethanolCost + botanicalCost + packagingCost;
            return {
              batch_number: batchNumber, product: pn,
              bottles_700ml: bottles700, bottles_200ml: bottles200, total_bottles: bottlesTotal,
              distillation_input_litres: totalDistInput.toFixed(3),
              total_lals_used: totalInputLals.toFixed(4),
              ethanol_cost: ethanolCost.toFixed(2),
              botanical_cost: botanicalCost.toFixed(2),
              packaging_cost: packagingCost.toFixed(2),
              total_batch_cogs: totalCost.toFixed(2),
              cost_per_bottle: bottlesTotal > 0 ? (totalCost/bottlesTotal).toFixed(4) : '0',
            };
          }).sort((a,b)=>a.batch_number.localeCompare(b.batch_number));
          const headers = ['batch_number','product','bottles_700ml','bottles_200ml','total_bottles','distillation_input_litres','total_lals_used','ethanol_cost','botanical_cost','packaging_cost','total_batch_cogs','cost_per_bottle'];
          exportCSV(`cogs_by_batch_${label}.csv`, rows, headers);
          break;
        }
        case 'excise': {
          // Export the excise summary as CSV
          // Pull the calculated values from the ExciseReturn component via the shared data
          const headers = ['description', 'lals', 'amount_nzd'];
          const exciseRate = new Date(startDate) >= new Date('2026-07-01') ? 71.034 : 68.915;
          const monthD = dispatches.filter(d => {
            const dd = d.dispatch_date || '';
            return dd >= startDate && dd <= endDate;
          });
          const bluffTaxable = monthD.filter(d => !(d.dispatched_from||'').includes('Auckland') && d.duty_free !== true && d.is_export !== true).reduce((s,d)=>s+(d.total_lals||0),0);
          const bluffExempt = monthD.filter(d => !(d.dispatched_from||'').includes('Auckland') && (d.duty_free===true||d.is_export===true)).reduce((s,d)=>s+(d.total_lals||0),0);
          const transferLals = warehouseStock ? warehouseStock.filter(ws => { const t = ws.transfer_date||ws.date_transferred_in||''; return t >= startDate && t <= endDate; }).reduce((s,ws)=>s+(ws.total_lals||0),0) : 0;
          const exempt3PL = monthD.filter(d => (d.dispatched_from||'').includes('Auckland') && (d.duty_free===true||d.is_export===true)).reduce((s,d)=>s+(d.total_lals||0),0);
          const net3PL = Math.max(0, transferLals - exempt3PL);
          const totalTaxable = bluffTaxable + net3PL;
          const exciseDue = totalTaxable * exciseRate;
          const gst = exciseDue * 0.15;
          const rows = [
            { description: `Excise Return ${startDate} to ${endDate}`, lals: '', amount_nzd: '' },
            { description: 'Distillery dispatches (taxable)', lals: bluffTaxable.toFixed(4), amount_nzd: '' },
            { description: 'Less: Duty free / export from Distillery', lals: `-${bluffExempt.toFixed(4)}`, amount_nzd: '' },
            { description: 'Transferred to 3PL', lals: transferLals.toFixed(4), amount_nzd: '' },
            { description: 'Less: Duty free / export from 3PL', lals: `-${exempt3PL.toFixed(4)}`, amount_nzd: '' },
            { description: 'Net 3PL taxable LALs', lals: net3PL.toFixed(4), amount_nzd: '' },
            { description: 'TOTAL TAXABLE LALs', lals: totalTaxable.toFixed(4), amount_nzd: '' },
            { description: `Excise rate (spirits >23% vol)`, lals: '', amount_nzd: `$${exciseRate}/LAL` },
            { description: 'Excise due (GST excl.)', lals: '', amount_nzd: `$${exciseDue.toFixed(2)}` },
            { description: 'GST (15%)', lals: '', amount_nzd: `$${gst.toFixed(2)}` },
            { description: 'Total excise due (GST incl.)', lals: '', amount_nzd: `$${(exciseDue+gst).toFixed(2)}` },
          ];
          exportCSV(`excise_return_${label}.csv`, rows, headers);
          break;
        }
        case 'iso': {
          const logs = await base44.entities.UtilityLog.list('-reading_date', 5000);
          const periodLogs = logs.filter(l => inRange(l.reading_date));
          const ELECTRICITY_EF = 0.105;
          const WATER_EF = 0.149;
          const totalKwh = periodLogs.reduce((s, l) => s + (l.electricity_kwh || 0), 0);
          const totalWaterL = periodLogs.reduce((s, l) => s + (l.water_litres || 0), 0);
          const elecCo2e = totalKwh * ELECTRICITY_EF;
          const waterCo2e = (totalWaterL / 1000) * WATER_EF;
          const inboundCo2e = receiving.filter(r => inRange(r.date_received)).reduce((s, r) => s + (r.co2e_kg || 0), 0);
          const outboundCo2e = dispatches.filter(d => inRange(d.dispatch_date)).reduce((s, d) => s + (d.co2e_kg || 0), 0);
          const transferCo2e = warehouseStock.filter(w => inRange(w.transfer_date || w.date_transferred_in)).reduce((s, w) => s + (w.co2e_kg || 0), 0);
          const totalCo2e = elecCo2e + waterCo2e + inboundCo2e + outboundCo2e + transferCo2e;
          const share = (v) => totalCo2e > 0 ? ((v / totalCo2e) * 100).toFixed(1) : '0.0';
          const rows = [
            { scope: 'Scope 2', source: 'Grid electricity (mains)', factor: `${ELECTRICITY_EF} kg/kWh`, quantity: `${totalKwh.toLocaleString()} kWh`, co2e_kg: elecCo2e.toFixed(2), share_pct: share(elecCo2e) },
            { scope: 'Scope 3', source: 'Town water supply', factor: `${WATER_EF} kg/m³`, quantity: `${(totalWaterL / 1000).toFixed(1)} m³`, co2e_kg: waterCo2e.toFixed(2), share_pct: share(waterCo2e) },
            { scope: 'Scope 3', source: 'Inbound freight (receiving)', factor: 'per shipment', quantity: `${receiving.filter(r => inRange(r.date_received)).length} receipts`, co2e_kg: inboundCo2e.toFixed(2), share_pct: share(inboundCo2e) },
            { scope: 'Scope 3', source: 'Outbound dispatches', factor: 'per shipment', quantity: `${dispatches.filter(d => inRange(d.dispatch_date)).length} dispatches`, co2e_kg: outboundCo2e.toFixed(2), share_pct: share(outboundCo2e) },
            { scope: 'Scope 3', source: '3PL warehouse transfers', factor: 'per transfer', quantity: `${warehouseStock.filter(w => inRange(w.transfer_date || w.date_transferred_in)).length} transfers`, co2e_kg: transferCo2e.toFixed(2), share_pct: share(transferCo2e) },
            { scope: '', source: 'TOTAL', factor: '', quantity: '', co2e_kg: totalCo2e.toFixed(2), share_pct: '100.0' },
          ];
          exportCSV(`iso_lifecycle_${label}.csv`, rows, ['scope', 'source', 'factor', 'quantity', 'co2e_kg', 'share_pct']);
          break;
        }
        case 'forecast':
          toast.info('Use the browser print function (Ctrl+P) to save the forecast as a PDF.');
          break;
        default:
          toast.info('Switch to a tab to export its data.');
      }
    } catch (err) {
      toast.error('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const monthLabel = `${format(rangeStart, 'dd MMM yyyy')} – ${format(rangeEnd, 'dd MMM yyyy')}`;

  const pagedReceiving = monthReceiving.slice((recvPage - 1) * recvPageSize, recvPage * recvPageSize);
  const pagedDispatches = monthDispatches.slice((dispPage - 1) * dispPageSize, dispPage * dispPageSize);
  const pagedWastage = wastageWithCost.slice((wastePage - 1) * wastePageSize, wastePage * wastePageSize);

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Reports" subtitle="Operational audit, inventory snapshot, and wastage analysis">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {[['thisMonth','This Month'],['lastMonth','Last Month'],['thisQuarter','This Quarter'],['thisYear','YTD'],['last12','Last 12 Months']].map(([key,label]) => (
              <Button key={key} size="sm" variant="outline" onClick={() => setPreset(key)}>{label}</Button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">From</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36 text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">To</label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36 text-sm" />
          </div>
          <Button onClick={handleExport} disabled={exporting} className="gap-2">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        </div>
      </PageHeader>

      <Tabs defaultValue="overview" className="space-y-6" onValueChange={setActiveTab}>
        <TabsList>
           <TabsTrigger value="overview">Inventory Snapshot</TabsTrigger>
           <TabsTrigger value="cogs">Cost of Goods</TabsTrigger>
           <TabsTrigger value="movements">Movements</TabsTrigger>
           <TabsTrigger value="carbon">Carbon Footprint</TabsTrigger>
           <TabsTrigger value="wastage">Wastage Analysis</TabsTrigger>
           <TabsTrigger value="excise">Excise Return</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="iso">ISO Lifecycle</TabsTrigger>
          <TabsTrigger value="batch-trace">Batch Trace</TabsTrigger>
           </TabsList>

        {/* ── INVENTORY SNAPSHOT ── */}
        <TabsContent value="overview" className="space-y-6">
          <InventoryReport
            rawMaterialsNetStock={rawMaterialsNetStock}
            finishedGoodsWithStock={finishedGoodsWithStock}
            warehouseStock={warehouseStock}
            tanks={tanks}
          />
        </TabsContent>

          {/* ── COST OF GOODS ── */}
          <TabsContent value="cogs" className="space-y-6">
            <CostOfGoodsReport
              rawMaterialsNetStock={rawMaterialsNetStock}
              rawMaterials={rawMaterials}
              finishedGoodsWithStock={finishedGoodsWithStock}
              tanks={tanks}
              recipes={recipes}
              distillationRuns={distillationRuns}
              bottlingRuns={bottlingRuns}
              masterBatches={masterBatches}
            />
          </TabsContent>

          {/* ── MOVEMENTS ── */}
          <TabsContent value="movements" className="space-y-6">
            <MovementsReport
              receiving={receiving}
              dispatches={dispatches}
              distillationRuns={distillationRuns}
              bottlingRuns={bottlingRuns}
              tankMovements={tankMovements}
              tanks={tanks}
              wastage={wastage}
              finishedGoods={finishedGoods}
              warehouseStock={warehouseStock}
              startDate={startDate}
              endDate={endDate}
            />
          </TabsContent>

        {/* ── CARBON FOOTPRINT ── */}
        <TabsContent value="carbon" className="space-y-6">
          <CarbonReport
            receiving={receiving}
            dispatches={dispatches}
            warehouseStock={warehouseStock}
            startDate={startDate}
            endDate={endDate}
          />
        </TabsContent>

         {/* ── WASTAGE ── */}
        <TabsContent value="wastage" className="space-y-6">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{monthLabel} — Wastage Analysis</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total Volume Wasted" value={totalWastedVol.toFixed(2)} sub="litres" icon={TrendingDown} color="text-destructive" bg="bg-red-50 border-red-200" />
            <StatCard label="Total LALs Wasted" value={totalWastedLals.toFixed(3)} sub="litres abs. alcohol" icon={TrendingDown} color="text-destructive" bg="bg-red-50 border-red-200" />
            <StatCard label="Avg Cost / LAL" value={`$${avgCostPerLalWasted}`} sub="of wasted spirit" icon={TrendingDown} color="text-amber-700" bg="bg-amber-50 border-amber-200" />
            <StatCard label="Total Wastage Cost" value={`$${totalWastageCost.toFixed(2)}`} sub="estimated loss" icon={TrendingDown} color="text-amber-700" bg="bg-amber-50 border-amber-200" />
          </div>

          {wastageBySource.length > 0 && (
            <Card className="p-4">
              <h4 className="text-sm font-semibold mb-4">Wastage by Source — {monthLabel}</h4>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={wastageBySource}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="source" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="volume" name="Volume (L)" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="lals" name="LALs" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          <Card className="p-4">
            <h4 className="text-sm font-semibold mb-4">Wastage Ledger — {monthLabel}</h4>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Volume (L)</TableHead>
                    <TableHead>ABV %</TableHead>
                     <TableHead>LALs</TableHead>
                     <TableHead>Cost / LAL</TableHead>
                     <TableHead>Total Loss</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wastageWithCost.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No wastage records this month</TableCell></TableRow>
                  ) : pagedWastage.map(w => (
                    <TableRow key={w.id}>
                      <TableCell className="text-sm">{w.date ? format(parseISO(w.date), 'dd MMM yyyy') : '—'}</TableCell>
                      <TableCell className="font-medium text-sm">{w.product_name}</TableCell>
                      <TableCell className="font-mono text-xs">{w.batch_number}</TableCell>
                      <TableCell className="text-sm capitalize">{w.source}</TableCell>
                      <TableCell className="text-sm font-semibold">{w.volume?.toFixed(2) || '—'}</TableCell>
                      <TableCell className="text-sm">{w.abv ? `${w.abv}%` : '—'}</TableCell>
                      <TableCell className="text-sm">{w.lals?.toFixed(3) || '—'}</TableCell>
                      <TableCell className="text-sm text-amber-700">${w.cost_per_lal?.toFixed(2)}</TableCell>
                      <TableCell className="text-sm font-semibold text-destructive">${w.total_loss?.toFixed(2)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{w.reason || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination total={wastageWithCost.length} page={wastePage} pageSize={wastePageSize} onPageChange={setWastePage} onPageSizeChange={(s) => { setWastePageSize(s); setWastePage(1); }} />
          </Card>
        </TabsContent>
        {/* ── EXCISE RETURN ── */}
        <TabsContent value="excise" className="space-y-6">
          <ExciseReturn
            finishedGoods={finishedGoods}
            warehouseStock={warehouseStock}
            tanks={tanks}
            dispatches={dispatches}
            distillationRuns={distillationRuns}
            bottlingRuns={bottlingRuns}
            wastage={wastage}
            tankMovements={tankMovements}
          />
        </TabsContent>

        <TabsContent value="forecast" className="space-y-5">
          <ForecastReport
            dispatches={dispatches}
            rawMaterials={rawMaterials}
            finishedGoods={finishedGoods}
            recipes={recipes}
            bottlingRuns={bottlingRuns}
            distillationRuns={distillationRuns}
          />
        </TabsContent>

        {/* ── ISO LIFECYCLE ── */}
        <TabsContent value="iso" className="space-y-6">
          <IsoLifecycleReport
            receiving={receiving}
            dispatches={dispatches}
            warehouseStock={warehouseStock}
            startDate={startDate}
            endDate={endDate}
          />
        </TabsContent>

        {/* ── BATCH TRACE ── */}
        <TabsContent value="batch-trace" className="space-y-6">
          <BatchTraceReport />
        </TabsContent>
      </Tabs>
      {/* CSV Copy Modal — fallback if download is blocked */}
      {csvModal && (
        <Dialog open={!!csvModal} onOpenChange={() => setCsvModal(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                {csvModal.filename}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">If the file didn't download automatically, copy the content below and paste it into Excel or Google Sheets.</p>
            <div className="flex-1 overflow-auto">
              <textarea
                readOnly
                value={csvModal.content}
                className="w-full h-64 text-xs font-mono border border-border rounded p-2 bg-muted resize-none"
                onClick={e => e.target.select()}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={() => {
                navigator.clipboard.writeText(csvModal.content).then(() => toast.success('Copied to clipboard')).catch(() => toast.error('Copy failed — select all text and copy manually'));
              }}>Copy to Clipboard</Button>
              <Button variant="outline" onClick={() => setCsvModal(null)}>Close</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}