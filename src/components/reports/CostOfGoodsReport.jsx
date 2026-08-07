import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Wine, Droplets, Boxes, DollarSign, FlaskConical } from 'lucide-react';
import StatCard from '@/components/shared/StatCard';

const COGS_COLORS = ['#8B5CF6', '#F97316', '#06B6D4', '#10B981', '#3B82F6', '#F59E0B'];

export default function CostOfGoodsReport({ rawMaterialsNetStock, rawMaterials, finishedGoodsWithStock, tanks, recipes, distillationRuns, bottlingRuns, masterBatches }) {
  const avgEthanolCostPerLal = useMemo(() => {
    const ethanolMats = rawMaterialsNetStock.filter(m => m.type === 'ethanol' && m.cost_per_unit);
    if (ethanolMats.length === 0) return 3.5;
    const totalLals = ethanolMats.reduce((s, m) => s + (m.quantity || 0) * (m.abv_percent || 0) / 100, 0);
    const totalCost = ethanolMats.reduce((s, m) => s + (m.quantity || 0) * (m.cost_per_unit || 0), 0);
    return totalLals > 0 ? totalCost / totalLals : ethanolMats.reduce((avg, m, _, arr) => avg + m.cost_per_unit / arr.length, 0);
  }, [rawMaterialsNetStock]);

  const materialCostLookup = useMemo(() => {
    const lookup = {};
    // Build from both rawMaterials (db records) and rawMaterialsNetStock (computed)
    // rawMaterials takes priority as it has the actual cost_per_unit from the database
    const allMats = [...(rawMaterialsNetStock || []), ...(rawMaterials || [])];
    for (const m of allMats) {
      if (m.cost_per_unit && m.name) {
        lookup[m.name.toLowerCase().trim()] = m.cost_per_unit;
      }
    }
    return lookup;
  }, [rawMaterialsNetStock, rawMaterials]);

  const findCostPerUnit = (name) => {
    if (!name) return 0;
    const lower = name.toLowerCase().trim();
    if (materialCostLookup[lower]) return materialCostLookup[lower];
    // Fuzzy match
    for (const [key, cost] of Object.entries(materialCostLookup)) {
      if (key.includes(lower) || lower.includes(key)) return cost;
    }
    return 0;
  };

  // Per-batch COGS: one row per batch showing full batch costs
  const batchCogs = useMemo(() => {
    if (!bottlingRuns || bottlingRuns.length === 0) return [];

    // Group all bottling runs by batch_number
    const byBatch = {};
    for (const br of bottlingRuns) {
      if (!br.batch_number || !(br.bottles_produced > 0)) continue;
      if (!byBatch[br.batch_number]) byBatch[br.batch_number] = [];
      byBatch[br.batch_number].push(br);
    }

    return Object.entries(byBatch).map(([batchNumber, runs]) => {
      const masterBatch = (masterBatches || []).find(mb => mb.batch_code === batchNumber);
      const productName = masterBatch?.product_name || runs[0].product_name;

      // Find spirit recipe
      const recipe = (recipes || [])
        .filter(r => r.recipe_type === 'spirit' && r.base_ethanol_volume)
        .find(r =>
          r.name === productName ||
          productName?.toLowerCase().includes(r.name?.toLowerCase()) ||
          r.name?.toLowerCase().includes(productName?.toLowerCase())
        );

      // Total bottles and runs
      const bottlesProduced = runs.reduce((s, r) => s + (r.bottles_produced || 0), 0);
      const bottles700 = runs.filter(r => r.bottle_size_ml === 700).reduce((s, r) => s + (r.bottles_produced || 0), 0);
      const bottles200 = runs.filter(r => r.bottle_size_ml === 200).reduce((s, r) => s + (r.bottles_produced || 0), 0);

      // Total distillation input for this batch
      const distRuns = (distillationRuns || []).filter(dr => dr.batch_number === batchNumber);
      const totalDistInput = distRuns.reduce((s, dr) => s + (dr.input_volume || 0), 0);
      const totalInputLals = distRuns.reduce((s, dr) => s + (dr.input_lals || 0), 0);

      // Ethanol cost from actual LALs used
      const ethanolCostTotal = totalInputLals * avgEthanolCostPerLal;

      // Botanical/ingredient cost scaled to actual distillation input
      let botanicalCostTotal = 0;
      if (recipe && recipe.base_ethanol_volume) {
        const scale = totalDistInput > 0 ? totalDistInput / recipe.base_ethanol_volume : 1;
        for (const ing of (recipe.ingredients || [])) {
          const cpu = findCostPerUnit(ing.name);
          if (cpu) botanicalCostTotal += (ing.quantity || 0) * scale * cpu;
        }
      }

      // Packaging cost — use FIFO costs stored on each run if available (captured at bottling time)
      // This gives true FIFO accuracy: cost reflects actual lot prices used, not current prices
      let packagingCostTotal = 0;
      const runsWithFifo = runs.filter(r => Array.isArray(r.packaging_costs) && r.packaging_costs.length > 0);
      const runsWithoutFifo = runs.filter(r => !Array.isArray(r.packaging_costs) || !r.packaging_costs.length);

      // Sum FIFO costs from runs that have them
      packagingCostTotal += runsWithFifo.reduce((s, r) =>
        s + (r.packaging_costs || []).reduce((ps, pc) => ps + (pc.total_cost || 0), 0), 0);

      // For older runs without stored costs, fall back to current recipe prices
      if (runsWithoutFifo.length > 0) {
        const pkgRecipe700 = (recipes || []).find(r => r.recipe_type === 'packaging' && r.name?.toLowerCase().includes('700'));
        const pkgRecipe200 = (recipes || []).find(r => r.recipe_type === 'packaging' && r.name?.toLowerCase().includes('200'));
        const calcPkgCostPerBottle = (pkgRecipe) => !pkgRecipe?.packaging?.length ? 0 :
          pkgRecipe.packaging.reduce((s, pkg) => s + (pkg.quantity || 1) * findCostPerUnit(pkg.name), 0);
        const fallback700 = runsWithoutFifo.filter(r => r.bottle_size_ml === 700).reduce((s, r) => s + (r.bottles_produced || 0), 0);
        const fallback200 = runsWithoutFifo.filter(r => r.bottle_size_ml === 200).reduce((s, r) => s + (r.bottles_produced || 0), 0);
        packagingCostTotal += fallback700 * calcPkgCostPerBottle(pkgRecipe700 || recipe);
        packagingCostTotal += fallback200 * calcPkgCostPerBottle(pkgRecipe200 || recipe);
      }

      const totalBatchCost = ethanolCostTotal + botanicalCostTotal + packagingCostTotal;
      const costPerBottle = bottlesProduced > 0 ? totalBatchCost / bottlesProduced : 0;

      // Selling prices — may differ by size
      const fg700 = (finishedGoodsWithStock || []).find(g => g.batch_number === batchNumber && Number(g.bottle_size_ml) === 700);
      const fg200 = (finishedGoodsWithStock || []).find(g => g.batch_number === batchNumber && Number(g.bottle_size_ml) === 200);

      return {
        batch_number: batchNumber,
        productName,
        recipeName: recipe?.name || null,
        bottlingRunCount: runs.length,
        bottlesProduced,
        bottles700,
        bottles200,
        totalDistInput: parseFloat(totalDistInput.toFixed(3)),
        totalInputLals: parseFloat(totalInputLals.toFixed(4)),
        ethanolCostTotal: parseFloat(ethanolCostTotal.toFixed(2)),
        botanicalCostTotal: parseFloat(botanicalCostTotal.toFixed(2)),
        packagingCostTotal: parseFloat(packagingCostTotal.toFixed(2)),
        totalBatchCost: parseFloat(totalBatchCost.toFixed(2)),
        costPerBottle: parseFloat(costPerBottle.toFixed(4)),
        sellingPrice700: fg700?.product_price || 0,
        sellingPrice200: fg200?.product_price || 0,
      };
    }).sort((a, b) => a.batch_number.localeCompare(b.batch_number));
  }, [bottlingRuns, masterBatches, recipes, distillationRuns, finishedGoodsWithStock, avgEthanolCostPerLal, findCostPerUnit]);

  const finishedGoodsCosts = useMemo(() => {
    return finishedGoodsWithStock
      .filter(fg => fg.quantity_bottles > 0)
      .map(fg => {
        const recipe = (recipes || [])
          .filter(r => r.recipe_type === 'spirit' && r.base_ethanol_volume)
          .find(r =>
            r.name === fg.product_name ||
            fg.product_name?.toLowerCase().includes(r.name?.toLowerCase()) ||
            r.name?.toLowerCase().includes(fg.product_name?.toLowerCase())
          );

        let ethanolCost = 0;
        let botanicalCost = 0;
        let packagingCost = 0;
        const method = recipe && recipe.base_ethanol_volume ? 'recipe' : 'lals_only';

        if (recipe && recipe.base_ethanol_volume) {
          const inputLals = recipe.base_ethanol_volume * (recipe.base_ethanol_abv || 96) / 100;
          const bottleLals = (fg.bottle_size_ml || 700) / 1000 * (recipe.target_output_abv || 42) / 100;
          const bottlesFromRecipe = bottleLals > 0 ? inputLals / bottleLals : 1;

          const ethanolPerBottle = (inputLals * avgEthanolCostPerLal) / bottlesFromRecipe;
          ethanolCost = ethanolPerBottle * (fg.quantity_bottles || 0);

          let botanicalPerBottle = 0;
          if (recipe.ingredients) {
            for (const ing of recipe.ingredients) {
              const cpu = findCostPerUnit(ing.name);
              if (cpu) botanicalPerBottle += (ing.quantity * cpu) / bottlesFromRecipe;
            }
          }
          botanicalCost = botanicalPerBottle * (fg.quantity_bottles || 0);

          let packagingPerBottle = 0;
          // Find packaging recipe by bottle size for this finished good
          const fgPackagingRecipe = (recipes || []).find(r =>
            r.recipe_type === 'packaging' &&
            r.name?.toLowerCase().includes(String(fg.bottle_size_ml || '').toLowerCase())
          );
          const pkgSource = fgPackagingRecipe || recipe;
          if (pkgSource?.packaging) {
            for (const pkg of pkgSource.packaging) {
              // Use findCostPerUnit which now checks both rawMaterials and rawMaterialsNetStock
              const cpu = findCostPerUnit(pkg.name);
              if (cpu) packagingPerBottle += (pkg.quantity || 1) * cpu;
            }
          }
          packagingCost = packagingPerBottle * (fg.quantity_bottles || 0);
        } else {
          ethanolCost = (fg.total_lals || 0) * avgEthanolCostPerLal;
        }

        const totalCost = ethanolCost + botanicalCost + packagingCost;
        const costPerBottle = (fg.quantity_bottles || 0) > 0 ? totalCost / fg.quantity_bottles : 0;

        return {
          ...fg,
          ethanolCost, botanicalCost, packagingCost, totalCost, costPerBottle, method,
          recipeUsed: recipe?.name || null,
        };
      });
  }, [finishedGoodsWithStock, recipes, avgEthanolCostPerLal, findCostPerUnit]);

  const totalFinishedGoodsCost = finishedGoodsCosts.reduce((s, f) => s + f.totalCost, 0);
  const totalFinishedEthanolCost = finishedGoodsCosts.reduce((s, f) => s + f.ethanolCost, 0);
  const totalFinishedBotanicalCost = finishedGoodsCosts.reduce((s, f) => s + f.botanicalCost, 0);
  const totalFinishedPackagingCost = finishedGoodsCosts.reduce((s, f) => s + f.packagingCost, 0);

  // Botanical cost per litre of output spirit, by product name
  const botanicalCostPerLitreByProduct = useMemo(() => {
    const lookup = {};
    const spiritRecipes = (recipes || []).filter(r => r.recipe_type === 'spirit');
    spiritRecipes.forEach(recipe => {
      if (!recipe.ingredients?.length) return;
      const baseVol = recipe.base_ethanol_volume || 300;
      const yieldPct = recipe.expected_yield_percent || 85;
      const outputVol = baseVol * yieldPct / 100;
      let totalBotanicalCost = 0;
      recipe.ingredients.forEach(ing => {
        const cpu = findCostPerUnit(ing.name);
        if (cpu) totalBotanicalCost += (ing.quantity || 0) * cpu;
      });
      if (outputVol > 0) {
        lookup[(recipe.name || '').toLowerCase().trim()] = totalBotanicalCost / outputVol;
      }
    });
    return lookup;
  }, [recipes, findCostPerUnit]);

  const findBotanicalCostPerLitre = (productName) => {
    if (!productName) return 0;
    const lower = productName.toLowerCase().trim();
    if (botanicalCostPerLitreByProduct[lower]) return botanicalCostPerLitreByProduct[lower];
    for (const [key, cost] of Object.entries(botanicalCostPerLitreByProduct)) {
      if (key.includes(lower) || lower.includes(key)) return cost;
    }
    return 0;
  };

  // Build a batch-number → product-name lookup from distillation runs
  const batchToProduct = useMemo(() => {
    const lookup = {};
    (distillationRuns || []).forEach(dr => {
      const batchKey = (dr.batch_number || '').toLowerCase().trim();
      if (batchKey && dr.product_name) lookup[batchKey] = dr.product_name;
    });
    return lookup;
  }, [distillationRuns]);

  const tankStockCosts = useMemo(() => {
    return tanks
      .filter(t => t.current_volume > 0 && t.status !== 'empty')
      .map(t => {
        const lals = (t.current_volume || 0) * (t.current_abv || 0) / 100;
        const ethanolCost = lals * avgEthanolCostPerLal;
        // Resolve product name: try current_product first; if no recipe match, look up via batch number
        let productName = t.current_product;
        let botanicalPerLitre = findBotanicalCostPerLitre(productName);
        if (botanicalPerLitre === 0 && t.current_batch) {
          const batchProduct = batchToProduct[(t.current_batch || '').toLowerCase().trim()];
          if (batchProduct) {
            const batchCost = findBotanicalCostPerLitre(batchProduct);
            if (batchCost > 0) {
              productName = batchProduct;
              botanicalPerLitre = batchCost;
            }
          }
        }
        const botanicalCost = (t.current_volume || 0) * botanicalPerLitre;
        const cost = ethanolCost + botanicalCost;
        return { ...t, lals, ethanolCost, botanicalCost, cost, resolvedProduct: productName };
      });
  }, [tanks, avgEthanolCostPerLal, findBotanicalCostPerLitre, batchToProduct]);

  const totalTankCost = tankStockCosts.reduce((s, t) => s + t.cost, 0);
  const totalTankEthanolCost = tankStockCosts.reduce((s, t) => s + t.ethanolCost, 0);
  const totalTankBotanicalCost = tankStockCosts.reduce((s, t) => s + t.botanicalCost, 0);

  const unusedEthanolCosts = rawMaterialsNetStock
    .filter(m => m.type === 'ethanol' && (m.lals || 0) > 0)
    .map(m => ({ ...m, totalCost: (m.lals || 0) * (m.cost_per_unit || 0) }));
  const totalUnusedEthanol = unusedEthanolCosts.reduce((s, m) => s + m.totalCost, 0);

  const unusedBotanicalCosts = rawMaterialsNetStock
    .filter(m => m.type === 'botanical' && (m.quantity || 0) > 0)
    .map(m => ({ ...m, totalCost: (m.quantity || 0) * (m.cost_per_unit || 0) }));
  const totalUnusedBotanicals = unusedBotanicalCosts.reduce((s, m) => s + m.totalCost, 0);

  const unusedPackagingCosts = rawMaterialsNetStock
    .filter(m => m.type === 'packaging' && (m.quantity || 0) > 0)
    .map(m => ({ ...m, totalCost: (m.quantity || 0) * (m.cost_per_unit || 0) }));
  const totalUnusedPackaging = unusedPackagingCosts.reduce((s, m) => s + m.totalCost, 0);

  const totalUnusedGoods = totalUnusedEthanol + totalUnusedBotanicals + totalUnusedPackaging;
  const totalCogsValue = totalFinishedGoodsCost + totalTankCost + totalUnusedGoods;

  const cogBreakdown = [
    { name: 'Finished Goods', value: parseFloat(totalFinishedGoodsCost.toFixed(2)), items: finishedGoodsCosts.length },
    { name: 'Tank Stock', value: parseFloat(totalTankCost.toFixed(2)), items: tankStockCosts.length },
    { name: 'Unused Ethanol', value: parseFloat(totalUnusedEthanol.toFixed(2)), items: unusedEthanolCosts.length },
    { name: 'Unused Botanicals', value: parseFloat(totalUnusedBotanicals.toFixed(2)), items: unusedBotanicalCosts.length },
    { name: 'Unused Packaging', value: parseFloat(totalUnusedPackaging.toFixed(2)), items: unusedPackagingCosts.length },
  ].filter(c => c.value > 0);

  const money = (v) => `$${(v || 0).toFixed(2)}`;

  return (
    <div className="space-y-6">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Cost of Goods — Current Inventory</h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Finished Goods" value={money(totalFinishedGoodsCost)} sub={`${finishedGoodsCosts.length} products`} color="text-purple-600" bg="bg-purple-50 border-purple-200" icon={<Wine className="w-4 h-4" />} />
        <StatCard label="Tank Stock" value={money(totalTankCost)} sub={`${tankStockCosts.length} active tanks`} color="text-cyan-600" bg="bg-cyan-50 border-cyan-200" icon={<Droplets className="w-4 h-4" />} />
        <StatCard label="Unused Materials" value={money(totalUnusedGoods)} sub="ethanol + botanicals + packaging" color="text-amber-600" bg="bg-amber-50 border-amber-200" icon={<Boxes className="w-4 h-4" />} />
        <StatCard label="Total COGS" value={money(totalCogsValue)} sub="all on-hand inventory" color="text-primary" bg="bg-accent border-accent-foreground/10" icon={<DollarSign className="w-4 h-4" />} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-6">
          <h4 className="text-sm font-semibold mb-4">COGS Breakdown</h4>
          {cogBreakdown.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={cogBreakdown} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: $${value.toFixed(0)}`} outerRadius={80} fill="#8884d8" dataKey="value">
                    {cogBreakdown.map((_, index) => <Cell key={`cell-${index}`} fill={COGS_COLORS[index % COGS_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => money(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2">
                {cogBreakdown.map((item, i) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COGS_COLORS[i] }}></div>
                      <span className="text-muted-foreground">{item.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{money(item.value)}</p>
                      <p className="text-xs text-muted-foreground">{item.items} item{item.items !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No cost data available</p>
          )}
        </Card>

        <Card className="p-6">
          <h4 className="text-sm font-semibold mb-4">Cost Summary</h4>
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-4">
              <p className="text-xs text-muted-foreground mb-1">Total Inventory Value</p>
              <p className="text-3xl font-bold font-display">{money(totalCogsValue)}</p>
              <p className="text-xs text-muted-foreground mt-1">Finished goods + tanks + unused materials</p>
            </div>
            <div className="space-y-2">
              {cogBreakdown.map((item) => (
                <div key={item.name} className="flex justify-between text-sm border-b pb-2">
                  <span className="text-muted-foreground">{item.name}</span>
                  <span className="font-semibold">{((item.value / (totalCogsValue || 1)) * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Per-Batch COGS Analysis */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4 flex items-center gap-2"><FlaskConical className="w-4 h-4 text-primary" /> Per-Batch COGS Analysis</h4>
        <p className="text-xs text-muted-foreground mb-3">Full batch cost: ethanol (from actual LALs used) + botanicals (scaled to distillation input) + packaging (from recipe × bottles produced)</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">700ml</TableHead>
                <TableHead className="text-right">200ml</TableHead>
                <TableHead className="text-right">Ethanol Cost</TableHead>
                <TableHead className="text-right">Botanicals</TableHead>
                <TableHead className="text-right">Packaging</TableHead>
                <TableHead className="text-right font-bold">Total Batch COGS</TableHead>
                <TableHead className="text-right">Cost / Bottle</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batchCogs.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-4 text-muted-foreground text-sm">No bottling runs with production data</TableCell></TableRow>
              ) : batchCogs.map(b => (
                <TableRow key={b.batch_number}>
                  <TableCell className="font-mono text-xs font-semibold">{b.batch_number}</TableCell>
                  <TableCell className="text-sm font-medium">{b.productName}</TableCell>
                  <TableCell className="text-sm text-right">{b.bottles700 > 0 ? b.bottles700.toLocaleString() : '—'}</TableCell>
                  <TableCell className="text-sm text-right">{b.bottles200 > 0 ? b.bottles200.toLocaleString() : '—'}</TableCell>
                  <TableCell className="text-sm text-right">{money(b.ethanolCostTotal)}</TableCell>
                  <TableCell className="text-sm text-right">{b.botanicalCostTotal > 0 ? money(b.botanicalCostTotal) : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                  <TableCell className="text-sm text-right">{b.packagingCostTotal > 0 ? money(b.packagingCostTotal) : <span className="text-muted-foreground text-xs">No recipe</span>}</TableCell>
                  <TableCell className="text-right">
                    <span className="font-bold text-sm">{money(b.totalBatchCost)}</span>
                  </TableCell>
                  <TableCell className="text-sm text-right text-muted-foreground">{money(b.costPerBottle)}</TableCell>
                </TableRow>
              ))}
              {batchCogs.length > 0 && (
                <TableRow className="border-t-2 border-border font-bold bg-muted/30">
                  <TableCell colSpan={2} className="text-sm">TOTAL</TableCell>
                  <TableCell className="text-right text-sm">{batchCogs.reduce((s,b)=>s+b.bottles700,0).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-sm">{batchCogs.reduce((s,b)=>s+b.bottles200,0).toLocaleString()}</TableCell>
                  <TableCell className="text-right text-sm">{money(batchCogs.reduce((s,b)=>s+b.ethanolCostTotal,0))}</TableCell>
                  <TableCell className="text-right text-sm">{money(batchCogs.reduce((s,b)=>s+b.botanicalCostTotal,0))}</TableCell>
                  <TableCell className="text-right text-sm">{money(batchCogs.reduce((s,b)=>s+b.packagingCostTotal,0))}</TableCell>
                  <TableCell className="text-right text-sm">{money(batchCogs.reduce((s,b)=>s+b.totalBatchCost,0))}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Finished Goods Cost Detail */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4 flex items-center gap-2"><Wine className="w-4 h-4 text-purple-600" /> Finished Goods — Full Component Cost</h4>
        <p className="text-xs text-muted-foreground mb-3">Includes ethanol, botanicals, and packaging costs based on recipe data</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Bottles</TableHead>
                <TableHead>Ethanol Cost</TableHead>
                <TableHead>Botanical Cost</TableHead>
                <TableHead>Packaging Cost</TableHead>
                <TableHead>Cost / Bottle</TableHead>
                <TableHead>Total Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {finishedGoodsCosts.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-4 text-muted-foreground text-sm">No finished goods in stock</TableCell></TableRow>
              ) : finishedGoodsCosts.map(fg => (
                <TableRow key={fg.id}>
                  <TableCell className="font-medium text-sm">{fg.product_name}</TableCell>
                  <TableCell className="font-mono text-xs">{fg.batch_number}</TableCell>
                  <TableCell className="text-sm">{fg.bottle_size_ml ? `${fg.bottle_size_ml}ml` : '—'}</TableCell>
                  <TableCell className="text-sm">{(fg.quantity_bottles || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{money(fg.ethanolCost)}</TableCell>
                  <TableCell className="text-sm">{money(fg.botanicalCost)}</TableCell>
                  <TableCell className="text-sm">{money(fg.packagingCost)}</TableCell>
                  <TableCell className="text-sm font-semibold">{money(fg.costPerBottle)}</TableCell>
                  <TableCell className="text-sm font-bold">{money(fg.totalCost)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold bg-purple-50/50">
                <TableCell colSpan={4}>Total Finished Goods</TableCell>
                <TableCell className="text-sm">{money(totalFinishedEthanolCost)}</TableCell>
                <TableCell className="text-sm">{money(totalFinishedBotanicalCost)}</TableCell>
                <TableCell className="text-sm">{money(totalFinishedPackagingCost)}</TableCell>
                <TableCell />
                <TableCell className="text-sm">{money(totalFinishedGoodsCost)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Tank Stock Value */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4 flex items-center gap-2"><Droplets className="w-4 h-4 text-cyan-600" /> Tank Stock Value</h4>
        <p className="text-xs text-muted-foreground mb-3">Spirit in tanks valued at ethanol cost per LAL ({money(avgEthanolCostPerLal)}/LAL) plus botanical costs from matching recipes</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tank</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Volume (L)</TableHead>
                <TableHead>ABV %</TableHead>
                <TableHead>LALs</TableHead>
                <TableHead>Ethanol Cost</TableHead>
                <TableHead>Botanical Cost</TableHead>
                <TableHead>Total Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tankStockCosts.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-4 text-muted-foreground text-sm">No spirit in tanks</TableCell></TableRow>
              ) : tankStockCosts.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium text-sm">{t.name}</TableCell>
                  <TableCell className="text-sm">{t.resolvedProduct || t.current_product || '—'}</TableCell>
                  <TableCell className="text-sm font-mono text-xs">{t.current_batch || '—'}</TableCell>
                  <TableCell className="text-sm">{(t.current_volume || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-sm">{t.current_abv ? `${t.current_abv}%` : '—'}</TableCell>
                  <TableCell className="text-sm">{t.lals.toFixed(3)}</TableCell>
                  <TableCell className="text-sm">{money(t.ethanolCost)}</TableCell>
                  <TableCell className="text-sm">{money(t.botanicalCost)}</TableCell>
                  <TableCell className="text-sm font-semibold">{money(t.cost)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold bg-cyan-50/50">
                <TableCell colSpan={6}>Total Tank Stock</TableCell>
                <TableCell className="text-sm">{money(totalTankEthanolCost)}</TableCell>
                <TableCell className="text-sm">{money(totalTankBotanicalCost)}</TableCell>
                <TableCell className="text-sm">{money(totalTankCost)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Unused Goods */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-4 flex items-center gap-2"><Boxes className="w-4 h-4 text-amber-600" /> Unused Stock — Raw Materials, Packaging & Ethanol</h4>
        <p className="text-xs text-muted-foreground mb-3">Materials still in inventory, not yet used in production</p>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Cost / Unit</TableHead>
                <TableHead>Total Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...unusedEthanolCosts, ...unusedBotanicalCosts, ...unusedPackagingCosts].length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground text-sm">No unused materials in stock</TableCell></TableRow>
              ) : (
                <>
                  {unusedEthanolCosts.map(m => (
                    <TableRow key={m.id} className="bg-amber-50/20">
                      <TableCell className="font-medium text-sm">{m.name}</TableCell>
                      <TableCell className="text-sm capitalize">ethanol</TableCell>
                      <TableCell className="text-sm">{(m.lals || 0).toFixed(3)}</TableCell>
                      <TableCell className="text-sm">LALs</TableCell>
                      <TableCell className="text-sm">{m.cost_per_unit ? money(m.cost_per_unit) : '—'}</TableCell>
                      <TableCell className="text-sm font-semibold">{money(m.totalCost)}</TableCell>
                    </TableRow>
                  ))}
                  {unusedBotanicalCosts.map(m => (
                    <TableRow key={m.id} className="bg-green-50/20">
                      <TableCell className="font-medium text-sm">{m.name}</TableCell>
                      <TableCell className="text-sm capitalize">botanical</TableCell>
                      <TableCell className="text-sm">{(m.quantity || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-sm">{m.unit}</TableCell>
                      <TableCell className="text-sm">{m.cost_per_unit ? money(m.cost_per_unit) : '—'}</TableCell>
                      <TableCell className="text-sm font-semibold">{money(m.totalCost)}</TableCell>
                    </TableRow>
                  ))}
                  {unusedPackagingCosts.map(m => (
                    <TableRow key={m.id} className="bg-purple-50/20">
                      <TableCell className="font-medium text-sm">{m.name}</TableCell>
                      <TableCell className="text-sm capitalize">packaging</TableCell>
                      <TableCell className="text-sm">{(m.quantity || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-sm">{m.unit}</TableCell>
                      <TableCell className="text-sm">{m.cost_per_unit ? money(m.cost_per_unit) : '—'}</TableCell>
                      <TableCell className="text-sm font-semibold">{money(m.totalCost)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="font-bold bg-amber-50/50">
                    <TableCell colSpan={5}>Total Unused Stock</TableCell>
                    <TableCell className="text-sm">{money(totalUnusedGoods)}</TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}