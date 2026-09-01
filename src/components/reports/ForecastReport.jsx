import { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TrendingUp, FlaskConical, ChevronDown, ChevronRight } from 'lucide-react';
import { format, subMonths } from 'date-fns';

const money = v => `$${(v || 0).toFixed(2)}`;
const isoMonth = d => format(d, 'yyyy-MM');

const isBoxItem = pkg =>
  pkg.type === 'carton' ||
  ['box','case','carton','shipper'].some(w => (pkg.name || '').toLowerCase().includes(w));

// Normalise product name — strip trailing size suffixes like "200ml", "700ml"
// so "London Dry Gin 200ml" and "London Dry Gin" at 200ml are treated as the same product
const normaliseName = (name) =>
  (name || '').replace(/\s*\d{3,4}ml\s*$/i, '').replace(/\s*\d{3,4}\s*$/i, '').trim();

// Some imported dispatch rows (Xero line items, one-off entries like "Tour
// Ticket" or "Shipping") have no bottle_size_ml — pull it out of the product
// name if it's embedded there (e.g. "...6 x 700ml"), otherwise leave it
// unclassifiable so the caller can skip it, rather than guessing a size.
const parseSizeFromName = (name) => {
  const m = (name || '').match(/(\d{3,4})\s*ml/i);
  return m ? Number(m[1]) : null;
};

const STATUS = {
  critical: { label: 'Critical', cls: 'bg-red-100 text-red-700' },
  low:      { label: 'Low',      cls: 'bg-amber-100 text-amber-700' },
  ok:       { label: 'OK',       cls: 'bg-emerald-100 text-emerald-700' },
  surplus:  { label: 'Surplus',  cls: 'bg-blue-100 text-blue-700' },
};
const getStatus = (onHand, needed) => {
  if (!needed) return 'ok';
  const r = onHand / needed;
  if (r < 0.5) return 'critical';
  if (r < 1.0) return 'low';
  if (r > 2.0) return 'surplus';
  return 'ok';
};

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 text-sm font-semibold hover:text-primary w-full text-left">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {title}
      </button>
      {open && children}
    </div>
  );
}

function StatusBadge({ onHand, needed }) {
  const s = STATUS[getStatus(onHand, needed)];
  return <Badge className={`text-xs ${s.cls}`}>{s.label}</Badge>;
}

export default function ForecastReport({ dispatches = [], rawMaterials = [], finishedGoods = [], recipes = [], bottlingRuns = [], distillationRuns = [] }) {
  const now = new Date();
  const [forecastMonths, setForecastMonths] = useState(3);
  const [lookbackMonths, setLookbackMonths] = useState(6);
  const [growthPct, setGrowthPct] = useState(10);
  const [safetyWeeks, setSafetyWeeks] = useState(4);
  // Manual production split by bottle size — overrides velocity-based split for packaging
  // Key: bottle size (e.g. 700), Value: % of total production (0-100)
  const [productionSplitOverride, setProductionSplitOverride] = useState({});
  const [useSeasonality, setUseSeasonality] = useState(true);

  // ── 0. Seasonality index per calendar month (1=12) ───────────────────────
  // Uses ALL dispatch history to build a robust seasonal pattern
  const seasonalityIndex = useMemo(() => {
    // Aggregate total sales by calendar month across ALL history
    const byCalMonth = Array(12).fill(0);
    const countByCalMonth = Array(12).fill(0);
    for (const d of dispatches) {
      if (!d.dispatch_date || d.sample_dispatch) continue;
      const mo = new Date(d.dispatch_date).getMonth(); // 0-11
      byCalMonth[mo] += (d.quantity_bottles || 0);
      countByCalMonth[mo]++;
    }
    // Average bottles per calendar month (normalised across years of data)
    // Count how many of each calendar month appear in the data
    const yearMonthsSeen = new Set();
    for (const d of dispatches) {
      if (d.dispatch_date) yearMonthsSeen.add(d.dispatch_date.slice(0, 7));
    }
    const occurrences = Array(12).fill(0);
    for (const ym of yearMonthsSeen) {
      const mo = parseInt(ym.split('-')[1]) - 1;
      occurrences[mo]++;
    }
    // avg bottles per occurrence of each calendar month
    const avgByCalMonth = byCalMonth.map((total, i) =>
      occurrences[i] > 0 ? total / occurrences[i] : 0
    );
    // Overall monthly average
    const overallAvg = avgByCalMonth.reduce((s, v) => s + v, 0) / 12;
    // Seasonality index: ratio of each month to overall average
    return avgByCalMonth.map(v => overallAvg > 0 ? v / overallAvg : 1);
  }, [dispatches]);

  // ── 1. Sales velocity per product+size ────────────────────────────────────
  const velocity = useMemo(() => {
    const months = Array.from({ length: lookbackMonths }, (_, i) =>
      isoMonth(subMonths(now, lookbackMonths - 1 - i))
    );
    // Build forecast months list (the actual future months we're planning for)
    const forecastMonthList = Array.from({ length: forecastMonths }, (_, i) =>
      new Date(now.getFullYear(), now.getMonth() + 1 + i, 1)
    );

    const map = {};
    for (const d of dispatches) {
      if (!d.dispatch_date || d.sample_dispatch) continue;
      // Dispatches with no bottle size and no size embedded in the product
      // name (e.g. "Tour Ticket", "Shipping", "Catering") aren't bottle
      // sales at all — including them used to silently default to 700ml,
      // inflating that forecast with unrelated line items.
      const size = d.bottle_size_ml || parseSizeFromName(d.product_name);
      if (!size) continue;
      const normName = normaliseName(d.product_name);
      const key = `${normName}||${size}`;
      if (!map[key]) map[key] = { product_name: normName, size, byMonth: {} };
      const m = d.dispatch_date.slice(0, 7);
      map[key].byMonth[m] = (map[key].byMonth[m] || 0) + (d.quantity_bottles || 0);
    }

    return Object.values(map).map(p => {
      const monthly = months.map(m => p.byMonth[m] || 0);
      const avg = monthly.reduce((s, v) => s + v, 0) / lookbackMonths;
      const growth = 1 + growthPct / 100;

      // Seasonal forecast: sum each future month adjusted by its seasonal index
      let forecastTotal;
      let forecastByMonth;
      if (useSeasonality && avg > 0) {
        forecastByMonth = forecastMonthList.map(d => {
          const mo = d.getMonth(); // 0-11
          const idx = seasonalityIndex[mo] || 1;
          return Math.round(avg * growth * idx);
        });
        forecastTotal = forecastByMonth.reduce((s, v) => s + v, 0);
      } else {
        forecastTotal = Math.ceil(avg * growth * forecastMonths);
        forecastByMonth = forecastMonthList.map(() => Math.round(avg * growth));
      }

      // Peak month in forecast
      const peakForecastMonth = forecastByMonth
        ? forecastMonthList[forecastByMonth.indexOf(Math.max(...forecastByMonth))]
        : null;
      const peakForecastQty = forecastByMonth ? Math.max(...forecastByMonth) : null;

      const safetyStock = Math.ceil(avg * (safetyWeeks / 4));
      const onHand = finishedGoods
        .filter(g => normaliseName(g.product_name) === p.product_name && Number(g.bottle_size_ml) === Number(p.size))
        .reduce((s, g) => s + (g.quantity_bottles || 0), 0);
      const trend = (() => {
        const r = monthly.slice(-3).reduce((s, v) => s + v, 0) / 3;
        const e = monthly.slice(0, 3).reduce((s, v) => s + v, 0) / 3;
        return e > 0 ? ((r - e) / e * 100).toFixed(0) : null;
      })();

      return {
        ...p,
        avg: Math.round(avg),
        forecastTotal,
        forecastByMonth,
        forecastMonthList,
        peakForecastMonth,
        peakForecastQty,
        safetyStock,
        onHand,
        needed: forecastTotal + safetyStock,
        trend,
        byMonth: p.byMonth,
      };
    }).filter(p => p.avg > 0).sort((a, b) => b.forecastTotal - a.forecastTotal);
  }, [dispatches, finishedGoods, lookbackMonths, forecastMonths, growthPct, safetyWeeks, seasonalityIndex, useSeasonality]);

  // ── 2. Batches + LALs needed ───────────────────────────────────────────────
  // Use ACTUAL historical distillation data:
  //   - avg hearts_volume per batch
  //   - avg hearts_abv per batch → avg LALs per batch
  //   - avg bottles per batch (from bottlingRuns linked by batch_number)
  const distillationPlan = useMemo(() => {
    const spiritRecipes = recipes.filter(r => r.recipe_type === 'spirit');
    if (!spiritRecipes.length || !velocity.length) return [];

    // Group distillation runs by batch_number — a batch = multiple still runs
    const completedRuns = distillationRuns.filter(r => r.status === 'completed' && r.input_volume > 0);
    const distByBatch = {};
    for (const r of completedRuns) {
      const key = r.batch_number || r.id; // fall back to run ID if no batch
      if (!distByBatch[key]) distByBatch[key] = [];
      distByBatch[key].push(r);
    }
    const batchDistStats = Object.values(distByBatch).map(runs => ({
      inputVol: runs.reduce((s, r) => s + (r.input_volume || 0), 0),
      inputLals: runs.reduce((s, r) => s + (r.input_lals || (r.input_volume || 0) * (r.input_abv || 96) / 100), 0),
      heartsVol: runs.reduce((s, r) => s + (r.hearts_volume || 0), 0),
      heartsLals: runs.reduce((s, r) => s + ((r.hearts_volume || 0) * (r.hearts_abv || 0) / 100), 0),
      runCount: runs.length,
    }));
    const numBatches = batchDistStats.length;
    const avgInputVol = numBatches ? batchDistStats.reduce((s, b) => s + b.inputVol, 0) / numBatches : null;
    const avgInputLals = numBatches ? batchDistStats.reduce((s, b) => s + b.inputLals, 0) / numBatches : null;
    const avgHeartsVol = numBatches ? batchDistStats.reduce((s, b) => s + b.heartsVol, 0) / numBatches : null;
    const avgHeartsLals = numBatches ? batchDistStats.reduce((s, b) => s + b.heartsLals, 0) / numBatches : null;
    const avgRunsPerBatch = numBatches ? batchDistStats.reduce((s, b) => s + b.runCount, 0) / numBatches : null;

    // Avg bottles per distillation batch from bottling runs
    const batchBottles = {};
    for (const br of bottlingRuns) {
      if (!br.batch_number) continue;
      batchBottles[br.batch_number] = (batchBottles[br.batch_number] || 0) + (br.bottles_produced || 0);
    }
    const batchVals = Object.values(batchBottles).filter(v => v > 0);
    const avgBottlesPerBatch = batchVals.length
      ? batchVals.reduce((s, v) => s + v, 0) / batchVals.length : null;

    // Total forecast bottles
    const totalForecast700 = velocity.filter(v => Number(v.size) === 700).reduce((s, v) => s + v.forecastTotal, 0);
    const totalForecast200 = velocity.filter(v => Number(v.size) === 200).reduce((s, v) => s + v.forecastTotal, 0);
    // Weight 700ml more heavily for LAL calculation
    const totalForecastLals = totalForecast700 * 0.700 * 0.40 + totalForecast200 * 0.200 * 0.40;

    // Batches needed — use actual avg if available, else use recipe base_ethanol_volume
    const recipe = spiritRecipes[0];
    // Input LALs per batch — from actual run data or recipe (base_vol × base_abv)
    const chargeAbv = (recipe.base_ethanol_abv || 55) / 100; // ABV of what goes into the still
    const inputLalsPerBatch = avgInputLals
      || (recipe.base_ethanol_volume ? recipe.base_ethanol_volume * chargeAbv : null);
    // Input volume per batch in litres AT CHARGE ABV (e.g. 300L @ 55%)
    const inputVolPerBatchLitres = avgInputVol
      || (inputLalsPerBatch && chargeAbv > 0 ? inputLalsPerBatch / chargeAbv : null);
    // Hearts LALs per batch (output — for reference)
    const heartsLalsPerBatch = avgHeartsLals
      || (inputLalsPerBatch ? inputLalsPerBatch * ((recipe.expected_yield_percent || 85) / 100) : null);
    const bottlesPerBatch = avgBottlesPerBatch
      || (heartsLalsPerBatch ? Math.round(heartsLalsPerBatch / 0.40 / 0.700) : null);
    const batchesNeeded = bottlesPerBatch
      ? Math.ceil((totalForecast700 + totalForecast200) / bottlesPerBatch) : null;
    // Total input LALs needed
    const totalInputLalsNeeded = batchesNeeded && inputLalsPerBatch
      ? batchesNeeded * inputLalsPerBatch
      : totalForecastLals / ((recipe.expected_yield_percent || 85) / 100);
    // Total input volume needed in litres AT CHARGE ABV
    const totalInputVolLitres = batchesNeeded && inputVolPerBatchLitres
      ? batchesNeeded * inputVolPerBatchLitres
      : chargeAbv > 0 ? totalInputLalsNeeded / chargeAbv : null;
    // Also show equivalent in litres of 96% for purchasing reference
    const litres96Needed = totalInputLalsNeeded / 0.96;
    const chargeAbvPct = Math.round((recipe.base_ethanol_abv || 55));

    // Ethanol on hand
    const ethanolRM = rawMaterials.filter(r => (r.type || '').toLowerCase() === 'ethanol');
    const ethanolLalsOnHand = ethanolRM.reduce((s, r) => s + (r.lals || (r.quantity || 0) * (r.abv_percent || 96) / 100), 0);
    const ethanolLitresOnHand = ethanolRM.reduce((s, r) => s + (r.quantity || 0), 0);

    return [{
      recipe,
      batchesNeeded,
      bottlesPerBatch: bottlesPerBatch ? Math.round(bottlesPerBatch) : null,
      inputLalsPerBatch: inputLalsPerBatch ? parseFloat(inputLalsPerBatch.toFixed(2)) : null,
      inputVolPerBatchLitres: inputVolPerBatchLitres ? parseFloat(inputVolPerBatchLitres.toFixed(1)) : null,
      heartsLalsPerBatch: heartsLalsPerBatch ? parseFloat(heartsLalsPerBatch.toFixed(2)) : null,
      avgInputVol: avgInputVol ? parseFloat(avgInputVol.toFixed(1)) : null,
      totalInputLalsNeeded: parseFloat(totalInputLalsNeeded.toFixed(2)),
      totalInputVolLitres: totalInputVolLitres ? parseFloat(totalInputVolLitres.toFixed(1)) : null,
      litres96Needed: parseFloat(litres96Needed.toFixed(2)),
      chargeAbvPct,
      ethanolLalsOnHand: parseFloat(ethanolLalsOnHand.toFixed(2)),
      ethanolLitresOnHand: parseFloat(ethanolLitresOnHand.toFixed(2)),
      ethanolShortfallLals: Math.max(0, parseFloat((totalInputLalsNeeded - ethanolLalsOnHand).toFixed(2))),
      ethanolShortfall96: Math.max(0, parseFloat((litres96Needed - ethanolLitresOnHand).toFixed(2))),
      avgRunsPerBatch: avgRunsPerBatch ? parseFloat(avgRunsPerBatch.toFixed(1)) : null,
      dataSource: numBatches > 0
        ? `Based on ${numBatches} batch${numBatches !== 1 ? 'es' : ''} (avg ${avgRunsPerBatch?.toFixed(1) || '?'} still run${avgRunsPerBatch !== 1 ? 's' : ''}/batch)`
        : 'Estimated from recipe (no completed runs yet)',
    }];
  }, [velocity, recipes, distillationRuns, bottlingRuns, rawMaterials, forecastMonths]);

  // ── 3. Botanicals needed ──────────────────────────────────────────────────
  const botanicalForecast = useMemo(() => {
    const plan = distillationPlan[0];
    if (!plan?.batchesNeeded) return [];
    const recipe = plan.recipe;
    if (!recipe?.ingredients?.length) return [];

    // Recipe ingredient quantities are written PER STILL RUN (one charge of base_ethanol_volume)
    // A master batch = avgRunsPerBatch still runs, so multiply accordingly
    // e.g. recipe says 2kg juniper per still run × 3 runs per batch = 6kg per master batch
    const runsPerBatch = plan.avgRunsPerBatch || 1;

    return recipe.ingredients.map(ing => {
      const perStillRun = ing.quantity || 0;
      const perMasterBatch = perStillRun * runsPerBatch;
      const totalNeeded = Math.ceil(perMasterBatch * plan.batchesNeeded);
      const rm = rawMaterials.find(r => (r.name || '').toLowerCase().trim() === (ing.name || '').toLowerCase().trim())
        || rawMaterials.find(r => { const n = (r.name || '').toLowerCase(); const p = (ing.name || '').toLowerCase(); return n.includes(p) || p.includes(n); });
      const onHand = rm?.quantity || 0;
      const shortfall = Math.max(0, totalNeeded - onHand);
      return {
        name: ing.name,
        unit: ing.unit || 'g',
        perStillRun,
        perMasterBatch: parseFloat(perMasterBatch.toFixed(3)),
        runsPerBatch,
        totalNeeded,
        onHand,
        shortfall,
        costPerUnit: rm?.cost_per_unit || 0,
        totalCost: shortfall * (rm?.cost_per_unit || 0),
      };
    });
  }, [distillationPlan, rawMaterials]);

  // ── 4. Packaging forecast — based on production plan (bottles to produce) ──
  const packagingForecast = useMemo(() => {
    const results = [];
    const packagingRecipes = recipes.filter(r => r.recipe_type === 'packaging');
    const plan = distillationPlan[0];

    // Work out bottles to PRODUCE per size using velocity ratio applied to total production
    // Total production = batchesNeeded × avgBottlesPerBatch
    const totalProductionBottles = plan?.batchesNeeded && plan?.bottlesPerBatch
      ? plan.batchesNeeded * plan.bottlesPerBatch
      : velocity.reduce((s, v) => s + v.forecastTotal, 0); // fallback to sales forecast

    // Group sales forecast by bottle size first — velocity is per (product,
    // size), and more than one product name can land on the same size (an
    // oddly-named dispatch line, e.g. "BIDFOOD - Bluff London Dry Gin 6 x
    // 700ml", normalises to its own distinct "product" once the size suffix
    // is stripped). Summing per size here — rather than keying the split
    // directly off each velocity row further down — is what stops one of
    // those near-zero stray rows from clobbering the real total for a size.
    const sizeForecastTotals = {};
    for (const sv of velocity) {
      const size = Number(sv.size);
      sizeForecastTotals[size] = (sizeForecastTotals[size] || 0) + sv.forecastTotal;
    }
    const sizes = Object.keys(sizeForecastTotals).map(Number);
    const totalVelocityBottles = velocity.reduce((s, v) => s + v.forecastTotal, 0);

    // Split by size — use manual override if set, otherwise fall back to velocity ratio
    const hasOverride = Object.keys(productionSplitOverride).length > 0;
    const productionBySize = {};
    if (hasOverride) {
      // Use manual splits
      const totalOverridePct = sizes.reduce((s, size) => s + (parseFloat(productionSplitOverride[size]) || 0), 0);
      for (const size of sizes) {
        const pct = parseFloat(productionSplitOverride[size]) || 0;
        // Normalise so splits always add to 100%
        const ratio = totalOverridePct > 0 ? pct / totalOverridePct : 0;
        productionBySize[size] = Math.round(totalProductionBottles * ratio);
      }
    } else {
      // Use velocity ratio
      for (const size of sizes) {
        const ratio = totalVelocityBottles > 0 ? sizeForecastTotals[size] / totalVelocityBottles : 0;
        productionBySize[size] = Math.round(totalProductionBottles * ratio);
      }
    }

    for (const size of sizes) {
      const bottlesToProduce = productionBySize[size] || sizeForecastTotals[size];

      // Find packaging recipe matching this bottle size
      const pkgRecipe = packagingRecipes.find(r => r.name?.toLowerCase().includes(String(size)));
      if (!pkgRecipe?.packaging?.length) continue;

      const bottlesPerCase = pkgRecipe.bottles_per_case || 6;
      const casesNeeded = Math.ceil(bottlesToProduce / bottlesPerCase);
      // Finished goods on hand for this bottle size, across every product
      // name variant — packaging materials are consumed per physical
      // bottle of that size, not per differently-spelled dispatch line.
      const fgOnHand = finishedGoods
        .filter(g => Number(g.bottle_size_ml) === size)
        .reduce((s, g) => s + (g.quantity_bottles || 0), 0);

      for (const pkg of pkgRecipe.packaging) {
        if (!pkg.name) continue;
        const isBox = isBoxItem(pkg);
        const totalNeeded = isBox
          ? Math.ceil((pkg.quantity || 1) * casesNeeded)
          : Math.ceil((pkg.quantity || 1) * bottlesToProduce);

        const rm = rawMaterials.find(r => (r.name || '').toLowerCase().trim() === (pkg.name || '').toLowerCase().trim())
          || rawMaterials.find(r => { const n = (r.name || '').toLowerCase(); const p = (pkg.name || '').toLowerCase(); return n.includes(p) || p.includes(n); });
        results.push({
          key: `${pkg.name}||${size}`,
          name: pkg.name,
          size,
          isBox,
          unit: pkg.unit || 'units',
          totalNeeded,
          casesNeeded: isBox ? casesNeeded : null,
          bottlesForecasted: bottlesToProduce,
          bottlesPerCase,
          onHand: rm?.quantity || 0,
          fgOnHand,  // finished goods already in stock for this size
          costPerUnit: rm?.cost_per_unit || 0,
        });
      }
    }

    return results.map(r => ({
      ...r,
      shortfall: Math.max(0, r.totalNeeded - r.onHand),
      totalCost: Math.max(0, r.totalNeeded - r.onHand) * r.costPerUnit,
    })).sort((a, b) => b.shortfall - a.shortfall);
  }, [velocity, recipes, rawMaterials, distillationPlan, productionSplitOverride, finishedGoods]);

  const plan = distillationPlan[0];
  const totalProcurementCost = [...botanicalForecast, ...packagingForecast].reduce((s, i) => s + (i.totalCost || 0), 0);

  return (
    <div className="space-y-5">

      {/* Controls */}
      <Card className="p-5">
        <h3 className="font-semibold mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> Forecast Settings</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <Label className="text-xs font-semibold">Forecast period</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input type="number" min="1" max="24" value={forecastMonths} onChange={e => setForecastMonths(Number(e.target.value))} className="w-20" />
              <span className="text-sm text-muted-foreground">months</span>
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Sales history</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input type="number" min="1" max="24" value={lookbackMonths} onChange={e => setLookbackMonths(Number(e.target.value))} className="w-20" />
              <span className="text-sm text-muted-foreground">months</span>
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Growth factor</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input type="number" min="-50" max="200" value={growthPct} onChange={e => setGrowthPct(Number(e.target.value))} className="w-20" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div>
            <Label className="text-xs font-semibold">Safety stock buffer</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input type="number" min="0" max="52" value={safetyWeeks} onChange={e => setSafetyWeeks(Number(e.target.value))} className="w-20" />
              <span className="text-sm text-muted-foreground">weeks</span>
            </div>
          </div>
        </div>

        {/* Seasonality toggle */}
        <div className="border-t border-border pt-4 mt-2 flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={useSeasonality} onChange={e => setUseSeasonality(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm font-semibold">Seasonal forecast</span>
          </label>
          <span className="text-xs text-muted-foreground">Adjusts each forecast month by your historical seasonal pattern — higher in peak months, lower in slow months.</span>
          {useSeasonality && seasonalityIndex.some(v => Math.abs(v - 1) > 0.1) && (
            <div className="flex gap-1 ml-auto">
              {['J','F','M','A','M','J','J','A','S','O','N','D'].map((label, i) => {
                const idx = seasonalityIndex[i] || 1;
                const height = Math.round(idx * 24);
                const color = idx > 1.2 ? 'bg-emerald-500' : idx < 0.8 ? 'bg-amber-400' : 'bg-blue-400';
                return (
                  <div key={i} className="flex flex-col items-center gap-0.5" title={`${label}: ${(idx * 100).toFixed(0)}% of average`}>
                    <div className={`w-3 rounded-sm ${color}`} style={{ height: `${Math.max(4, height)}px` }} />
                    <span className="text-xs text-muted-foreground" style={{ fontSize: '9px' }}>{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Production split override for packaging */}
        {velocity.length > 0 && (
          <div className="border-t border-border pt-4 mt-2">
            <p className="text-xs font-semibold mb-2">Packaging production split <span className="text-muted-foreground font-normal">(override the % of each bottle size in your next production run — useful for new products with limited sales history)</span></p>
            <div className="flex flex-wrap gap-4">
              {velocity.map(sv => {
                const totalV = velocity.reduce((s, v) => s + v.forecastTotal, 0);
                const velocityPct = totalV > 0 ? Math.round(sv.forecastTotal / totalV * 100) : 0;
                const dataMonths = Object.values(sv.byMonth || {}).filter(v => v > 0).length;
                const isLowData = dataMonths < 3;
                return (
                  <div key={sv.size} className="flex items-center gap-2">
                    <label className="text-xs whitespace-nowrap">
                      {sv.size}ml
                      {isLowData && <span className="ml-1 text-amber-600 text-xs" title={`Only ${dataMonths} months of data`}>⚠️</span>}
                    </label>
                    <input
                      type="number" min="0" max="100"
                      value={productionSplitOverride[sv.size] ?? ''}
                      onChange={e => {
                        const val = e.target.value;
                        setProductionSplitOverride(prev => val === '' ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== String(sv.size))) : { ...prev, [sv.size]: val });
                      }}
                      placeholder={`${velocityPct}%`}
                      className="w-16 border border-border rounded px-2 py-1 text-xs text-center"
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                );
              })}
              {Object.keys(productionSplitOverride).length > 0 && (
                <button onClick={() => setProductionSplitOverride({})} className="text-xs text-muted-foreground underline">reset to velocity</button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Leave blank to use sales velocity ratios. ⚠️ = fewer than 3 months of data.</p>
          </div>
        )}
      </Card>

      {/* ── SECTION 1: Sales forecast ── */}
      <Section title="🍾 Finished Goods Forecast">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead className="text-right">Avg/mo</TableHead>
                  <TableHead className="text-right">Trend</TableHead>
                  <TableHead className="text-right">Forecast {forecastMonths}mo</TableHead>
                  <TableHead className="text-right">Peak month</TableHead>
                  <TableHead className="text-right">Safety stock</TableHead>
                  <TableHead className="text-right font-bold">Total needed</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Shortfall</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {velocity.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground text-sm">No sales history found — dispatch records needed to forecast</TableCell></TableRow>
                ) : velocity.map((v, i) => (
                  <TableRow key={i} className={getStatus(v.onHand, v.needed) === 'critical' ? 'bg-red-50' : getStatus(v.onHand, v.needed) === 'low' ? 'bg-amber-50/40' : ''}>
                    <TableCell className="font-medium text-sm">
                      {v.product_name}
                      {Object.values(v.byMonth || {}).filter(x => x > 0).length < 3 && (
                        <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded" title="Fewer than 3 months of sales data — forecast may be unreliable">⚠️ low data</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{v.size}ml</TableCell>
                    <TableCell className="text-right text-sm">{v.avg.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm">
                      {v.trend !== null ? <span className={Number(v.trend) >= 0 ? 'text-emerald-600' : 'text-red-600'}>{Number(v.trend) >= 0 ? '↑' : '↓'}{Math.abs(v.trend)}%</span> : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">{v.forecastTotal.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {v.peakForecastMonth && v.peakForecastQty
                        ? <span className="text-emerald-700 font-medium">{format(v.peakForecastMonth, 'MMM')} {v.peakForecastQty.toLocaleString()}</span>
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{v.safetyStock.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-bold text-sm">{v.needed.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-sm">{v.onHand.toLocaleString()}</TableCell>
                    <TableCell className={`text-right text-sm font-semibold ${Math.max(0, v.needed - v.onHand) > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {Math.max(0, v.needed - v.onHand) > 0 ? `-${(v.needed - v.onHand).toLocaleString()}` : '✓'}
                    </TableCell>
                    <TableCell><StatusBadge onHand={v.onHand} needed={v.needed} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
        <p className="text-xs text-muted-foreground">{useSeasonality ? 'Seasonal forecast' : 'Flat average'} × {growthPct >= 0 ? '+' : ''}{growthPct}% growth + {safetyWeeks} weeks safety stock. {useSeasonality ? 'Each month weighted by historical seasonal pattern.' : 'Turn on seasonal forecast to account for peak/slow periods.'}</p>
      </Section>

      {/* ── SECTION 2: Distillation plan ── */}
      <Section title="🧪 Distillation Plan">
        {!plan ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">No spirit recipe found — add a recipe in Settings to see the distillation plan.</Card>
        ) : (
          <div className="space-y-3">
            <Card className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h4 className="font-semibold">{plan.recipe.name}</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">{plan.dataSource}</p>
                </div>
                <Badge className="bg-primary/10 text-primary text-sm px-3 py-1">
                  {plan.batchesNeeded !== null ? `${plan.batchesNeeded} batches needed` : 'Set up recipes to calculate batches'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Batches needed</p>
                  <p className="text-2xl font-bold text-primary">{plan.batchesNeeded ?? '—'}</p>
                  {plan.bottlesPerBatch && <p className="text-xs text-muted-foreground">~{plan.bottlesPerBatch.toLocaleString()} bottles/batch</p>}
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Input LALs needed</p>
                  <p className="text-2xl font-bold text-primary">{plan.totalInputLalsNeeded}</p>
                  {plan.inputLalsPerBatch && <p className="text-xs text-muted-foreground">~{plan.inputLalsPerBatch} LALs/batch</p>}
                  {plan.heartsLalsPerBatch && <p className="text-xs text-muted-foreground/60">~{plan.heartsLalsPerBatch} hearts LALs out/batch</p>}
                </div>
                <div className="rounded-lg bg-muted p-3">
                  <p className="text-xs text-muted-foreground">Spirit to charge still</p>
                  <p className="text-2xl font-bold text-primary">{plan.totalInputVolLitres ?? plan.litres96Needed}L</p>
                  <p className="text-xs text-muted-foreground">@ {plan.chargeAbvPct}% ABV</p>
                  {plan.inputVolPerBatchLitres && <p className="text-xs text-muted-foreground/60">~{plan.inputVolPerBatchLitres}L/batch · {plan.avgRunsPerBatch && `${plan.avgRunsPerBatch} run${plan.avgRunsPerBatch !== 1 ? 's' : ''} × ~${Math.round(plan.inputVolPerBatchLitres / plan.avgRunsPerBatch)}L each · `}{plan.litres96Needed}L equiv. at 96%</p>}
                </div>
                <div className={`rounded-lg p-3 ${plan.ethanolShortfallLals > 0 ? 'bg-red-50 border border-red-200' : 'bg-emerald-50 border border-emerald-200'}`}>
                  <p className="text-xs text-muted-foreground">Ethanol shortfall</p>
                  <p className={`text-2xl font-bold ${plan.ethanolShortfallLals > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {plan.ethanolShortfallLals > 0 ? `${plan.ethanolShortfallLals} LALs` : '✓ Sufficient'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {plan.ethanolShortfallLals > 0 ? `Need ${plan.ethanolShortfall96}L of 96% ethanol` : `${plan.ethanolLalsOnHand} LALs on hand`}
                  </p>
                </div>
              </div>
            </Card>

            {/* Botanicals */}
            {botanicalForecast.length > 0 && (
              <Card className="overflow-hidden">
                <div className="px-4 py-3 bg-muted/30 border-b">
                  <h4 className="text-sm font-semibold">
                    Botanical Requirements — {plan.batchesNeeded} master batch{plan.batchesNeeded !== 1 ? 'es' : ''}
                    {plan.avgRunsPerBatch && plan.avgRunsPerBatch > 1 && (
                      <span className="text-xs font-normal text-muted-foreground ml-2">
                        ({plan.avgRunsPerBatch} still runs/batch × recipe amounts)
                      </span>
                    )}
                  </h4>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ingredient</TableHead>
                        <TableHead className="text-right">Per still run</TableHead>
                        <TableHead className="text-right">Per master batch</TableHead>
                        <TableHead className="text-right font-bold">Total needed</TableHead>
                        <TableHead className="text-right">On hand</TableHead>
                        <TableHead className="text-right">Shortfall</TableHead>
                        <TableHead className="text-right">Est. cost</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {botanicalForecast.map((b, i) => (
                        <TableRow key={i} className={b.shortfall > 0 && getStatus(b.onHand, b.totalNeeded) === 'critical' ? 'bg-red-50' : ''}>
                          <TableCell className="font-medium text-sm">{b.name}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{b.perStillRun?.toLocaleString()} {b.unit}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{b.perMasterBatch?.toLocaleString()} {b.unit}
                            {b.runsPerBatch > 1 && <span className="text-xs text-muted-foreground ml-1">({b.runsPerBatch} runs)</span>}
                          </TableCell>
                          <TableCell className="text-right text-sm font-bold">{b.totalNeeded.toLocaleString()} {b.unit}</TableCell>
                          <TableCell className="text-right text-sm">{b.onHand.toLocaleString()}</TableCell>
                          <TableCell className={`text-right text-sm font-semibold ${b.shortfall > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                            {b.shortfall > 0 ? `-${b.shortfall.toLocaleString()}` : '✓'}
                          </TableCell>
                          <TableCell className="text-right text-sm">{b.totalCost > 0 ? money(b.totalCost) : '—'}</TableCell>
                          <TableCell><StatusBadge onHand={b.onHand} needed={b.totalNeeded} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </div>
        )}
      </Section>

      {/* ── SECTION 3: Packaging ── */}
      <Section title="📦 Packaging Requirements">
        {packagingForecast.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">No packaging recipes found — add packaging recipes in Settings to see requirements.</Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Basis</TableHead>
                    <TableHead className="text-right">Bottles to produce</TableHead>
                    <TableHead className="text-right">Cases</TableHead>
                    <TableHead className="text-right font-bold">Pkg needed</TableHead>
                    <TableHead className="text-right">Pkg on hand</TableHead>
                    <TableHead className="text-right">FG in stock</TableHead>
                    <TableHead className="text-right">Shortfall</TableHead>
                    <TableHead className="text-right">Est. cost</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packagingForecast.map((p, i) => (
                    <TableRow key={i} className={p.shortfall > 0 && getStatus(p.onHand, p.totalNeeded) === 'critical' ? 'bg-red-50' : ''}>
                      <TableCell className="font-medium text-sm">{p.name}</TableCell>
                      <TableCell className="text-sm">{p.size}ml</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.isBox ? `1 per case (${p.bottlesPerCase} btls)` : '1 per bottle'}</TableCell>
                      <TableCell className="text-right text-sm">{p.bottlesForecasted.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{p.casesNeeded ? p.casesNeeded.toLocaleString() : '—'}</TableCell>
                      <TableCell className="text-right font-bold text-sm">{p.totalNeeded.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm">{p.onHand.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{(p.fgOnHand || 0) > 0 ? p.fgOnHand.toLocaleString() : '—'}</TableCell>
                      <TableCell className={`text-right text-sm font-semibold ${p.shortfall > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                        {p.shortfall > 0 ? `-${p.shortfall.toLocaleString()}` : '✓'}
                      </TableCell>
                      <TableCell className="text-right text-sm">{p.totalCost > 0 ? money(p.totalCost) : '—'}</TableCell>
                      <TableCell><StatusBadge onHand={p.onHand} needed={p.totalNeeded} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {totalProcurementCost > 0 && (
              <div className="px-4 py-3 border-t bg-muted/20 text-sm flex justify-between">
                <span className="text-muted-foreground">Estimated total procurement cost (shortfall items only)</span>
                <span className="font-bold">{money(totalProcurementCost)}</span>
              </div>
            )}
          </Card>
        )}
        <p className="text-xs text-muted-foreground">Based on production plan ({distillationPlan[0]?.batchesNeeded ? `${distillationPlan[0].batchesNeeded} batches × ~${distillationPlan[0].bottlesPerBatch} bottles/batch` : 'sales forecast'}). Boxes/cartons at 1 per case, all other items at 1 per bottle.</p>
      </Section>
    </div>
  );
}