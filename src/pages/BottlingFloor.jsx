import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, BarChart3, Pencil, Trash2, FlaskConical, CheckCircle2, Clock, PackageCheck } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import BottlingRunTracker from '@/components/bottling/BottlingRunTracker';
import Pagination from '@/components/ui/Pagination';

const ACTIVE_RUN_KEY = 'bottling_active_run';

export default function BottlingFloor() {
  const [activeRun, setActiveRun] = useState(null);
  const [showNewRun, setShowNewRun] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [selectedTankId, setSelectedTankId] = useState('');
  const [selectedPackagingRecipeId, setSelectedPackagingRecipeId] = useState('');
  const [staffNames, setStaffNames] = useState([]);
  const [newStaffName, setNewStaffName] = useState('');
  const [historyFilter, setHistoryFilter] = useState({ startDate: '', endDate: '' });
  const [editingRun, setEditingRun] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deletingRun, setDeletingRun] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const queryClient = useQueryClient();

  // Restore an in-progress bottling run after a reload / session timeout
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_RUN_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.batch_code) {
          setActiveRun(parsed);
        }
      }
    } catch (e) { /* ignore */ }
  }, []);

  // Persist the active run so it survives reloads
  useEffect(() => {
    if (activeRun) {
      localStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify(activeRun));
    } else {
      localStorage.removeItem(ACTIVE_RUN_KEY);
    }
  }, [activeRun]);

  const { data: masterBatches = [] } = useQuery({
    queryKey: ['masterBatches'],
    queryFn: () => db.MasterBatch.list('-date_started', 5000),
  });

  const { data: tanks = [] } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => db.StorageTank.list(),
  });

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: () => db.Recipe.list('name', 5000),
  });

  const { data: bottlingRuns = [] } = useQuery({
    queryKey: ['bottlingFloorRuns'],
    queryFn: () => db.BottlingRun.list('-date', 5000),
  });

  // Only tanks that are final_product_storage, in_use, AND admin-marked as ready for bottling
  const finishingTanks = tanks.filter(t =>
    t.purpose === 'final_product_storage' &&
    t.status === 'in_use' &&
    t.is_ready_for_bottling === true
  );

  // Batches that have a product in a finishing tank
  const bottleReadyBatches = masterBatches.filter(b => {
    const matchingTank = finishingTanks.find(t =>
      t.current_batch === b.batch_code || t.current_product === b.product_name
    );
    return matchingTank != null;
  });

  const selectedBatch = masterBatches.find(b => b.id === selectedBatchId);

  // Find tank(s) holding this batch
  const batchTanks = selectedBatch
    ? finishingTanks.filter(t =>
        t.current_batch === selectedBatch.batch_code ||
        t.current_product === selectedBatch.product_name
      )
    : [];

  const selectedTank = tanks.find(t => t.id === selectedTankId);

  // Packaging recipes = bottle-size variants (recipe_type 'packaging'),
  // each linking a base spirit recipe, a bottle size, the packaging
  // materials it needs, and the finished-good Product it produces — see
  // Settings -> Packaging Recipes. Narrowed to the ones matching the
  // selected batch's spirit recipe (by product_name, same string
  // convention finished_good/dispatch already use), falling back to every
  // packaging recipe if no match is found (legacy/free-text batch names).
  const packagingRecipes = recipes.filter(r => r.recipe_type === 'packaging');
  const matchedSpiritRecipe = selectedBatch
    ? recipes.find(r => r.recipe_type === 'spirit' && r.name === selectedBatch.product_name)
    : null;
  const availablePackagingRecipes = matchedSpiritRecipe
    ? (packagingRecipes.filter(r => r.base_recipe_id === matchedSpiritRecipe.id).length > 0
        ? packagingRecipes.filter(r => r.base_recipe_id === matchedSpiritRecipe.id)
        : packagingRecipes)
    : packagingRecipes;

  const selectedRecipe = packagingRecipes.find(r => r.id === selectedPackagingRecipeId);
  const bottlesPerCase = selectedRecipe?.bottles_per_case || 6;

  const resetForm = () => {
    setSelectedBatchId('');
    setSelectedTankId('');
    setSelectedPackagingRecipeId('');
    setStaffNames([]);
    setNewStaffName('');
  };

  const addStaff = () => {
    const name = newStaffName.trim();
    if (name && !staffNames.includes(name)) {
      setStaffNames([...staffNames, name]);
      setNewStaffName('');
    }
  };

  const removeStaff = (idx) => setStaffNames(staffNames.filter((_, i) => i !== idx));

  const canStart = selectedBatchId && selectedTankId && selectedPackagingRecipeId && selectedRecipe?.bottle_size_ml;

  const startRun = () => {
    setActiveRun({
      batch_code: selectedBatch.batch_code,
      product_name: selectedBatch.product_name,
      tank_id: selectedTankId,
      tank_name: selectedTank?.name || '',
      bottle_size_ml: selectedRecipe.bottle_size_ml,
      bottles_per_case: bottlesPerCase,
      abv: selectedTank?.current_abv || 0,
      available_volume: selectedTank?.current_volume || 0,
      recipe: selectedRecipe || null,
      product_id: selectedRecipe?.product_id || null,
      staff: staffNames,
    });
    setShowNewRun(false);
    toast.success('Bottling run started!');
  };

  // Complete run — handles cases, extra bottles, tasting bottles, finished goods, tank deduction
  const completeRunMutation = useMutation({
    mutationFn: async ({ cases, extraBottles, tastingBottles }) => {
      const totalBottles = cases * activeRun.bottles_per_case + extraBottles;
      const spiritUsedLitres = (totalBottles * activeRun.bottle_size_ml) / 1000;
      const abv = activeRun.abv || 0;
      const lals = (spiritUsedLitres * abv) / 100;
      const lalPerBottle = totalBottles > 0 ? lals / totalBottles : 0;

      // 1. Create BottlingRun record
      const newRun = await db.BottlingRun.create({
        batch_number: activeRun.batch_code,
        product_name: activeRun.product_name,
        date: new Date().toISOString().split('T')[0],
        input_volume: spiritUsedLitres,
        input_abv: abv,
        input_lals: parseFloat(lals.toFixed(4)),
        bottle_size_ml: activeRun.bottle_size_ml,
        bottles_produced: totalBottles,
        lals_per_bottle: parseFloat(lalPerBottle.toFixed(5)),
        status: 'completed',
        notes: `Staff: ${activeRun.staff.join(', ')} | Cases: ${cases} | Extra bottles: ${extraBottles} | Tasting: ${tastingBottles}`,
        recipe_id: activeRun.recipe?.id || undefined,
      });

      // 2. Deduct from source tank
      const tank = tanks.find(t => t.id === activeRun.tank_id);
      if (tank) {
        const newVolume = Math.max(0, (tank.current_volume || 0) - spiritUsedLitres);
        // If tank is now empty, clear the bottling-ready flag so it drops off the dropdown
        const tankUpdates = { current_volume: newVolume };
        if (newVolume === 0) {
          tankUpdates.is_ready_for_bottling = false;
          tankUpdates.status = 'empty';
        }
        await db.StorageTank.update(tank.id, tankUpdates);

        await db.TankMovement.create({
          date: new Date().toISOString().split('T')[0],
          action: 'bottling_draw',
          tank_name: tank.name,
          volume_litres: spiritUsedLitres,
          abv,
          lals: parseFloat(lals.toFixed(4)),
          product: activeRun.product_name,
          batch_number: activeRun.batch_code,
          operator: activeRun.staff[0] || 'Unknown',
          notes: `Bottling complete — ${cases} cases + ${extraBottles} extra bottles`,
        });
      }

      // 3. Update main finished goods stock (cases + extra bottles)
      // Match by product_name + batch_number + bottle_size_ml (bottle size is a separate field, not in the name)
      const fgProductName = activeRun.product_name;
      if (totalBottles > 0) {
        const allFG = await db.FinishedGood.list('product_name', 5000);
        const fg = allFG.find(g =>
          g.product_name === fgProductName &&
          g.batch_number === activeRun.batch_code &&
          Number(g.bottle_size_ml) === Number(activeRun.bottle_size_ml)
        );
        if (fg) {
          await db.FinishedGood.update(fg.id, {
            quantity_bottles: (fg.quantity_bottles || 0) + totalBottles,
            total_lals: (fg.total_lals || 0) + parseFloat(lals.toFixed(4)),
            product_id: fg.product_id || activeRun.product_id || undefined,
          });
        } else {
          await db.FinishedGood.create({
            product_name: fgProductName,
            batch_number: activeRun.batch_code,
            bottle_size_ml: activeRun.bottle_size_ml,
            abv_percent: abv,
            quantity_bottles: totalBottles,
            total_lals: parseFloat(lals.toFixed(4)),
            product_id: activeRun.product_id || undefined,
          });
        }
      }

      // 4. Add tasting bottles to a tasting stock item
      if (tastingBottles > 0) {
        const tastingName = `${activeRun.product_name} — Tasting`;
        const tastingLals = (tastingBottles * activeRun.bottle_size_ml / 1000) * abv / 100;
        const allFGList = await db.FinishedGood.list('product_name', 5000);
        const existingTasting = allFGList.filter(g =>
          g.product_name === tastingName &&
          g.batch_number === activeRun.batch_code &&
          Number(g.bottle_size_ml) === Number(activeRun.bottle_size_ml)
        );
        if (existingTasting.length > 0) {
          const tg = existingTasting[0];
          await db.FinishedGood.update(tg.id, {
            quantity_bottles: (tg.quantity_bottles || 0) + tastingBottles,
            total_lals: (tg.total_lals || 0) + parseFloat(tastingLals.toFixed(4)),
          });
        } else {
          await db.FinishedGood.create({
            product_name: tastingName,
            batch_number: activeRun.batch_code,
            bottle_size_ml: activeRun.bottle_size_ml,
            abv_percent: abv,
            quantity_bottles: tastingBottles,
            total_lals: parseFloat(tastingLals.toFixed(4)),
            notes: 'Tasting bottles — rejected from main run',
          });
        }

        // Tasting/sample bottles are tracked as finished goods stock — not wastage
      }

      // 5. Deduct packaging materials from RawMaterial inventory using the recipe
      const recipe = activeRun.recipe;
      if (recipe?.packaging?.length && totalBottles > 0) {
        const allRM = await db.RawMaterial.list('name', 5000);

        // Fuzzy name match — handles minor naming differences
        const findRM = (pkgName) => {
          const target = (pkgName || '').toLowerCase().trim();
          // Exact match first
          let match = allRM.find(r => (r.name || '').toLowerCase().trim() === target);
          if (match) return match;
          // Partial match — one contains the other
          match = allRM.find(r => {
            const name = (r.name || '').toLowerCase().trim();
            return name.includes(target) || target.includes(name);
          });
          return match;
        };

        const isBoxOrCase = (name) => {
          const n = (name || '').toLowerCase();
          return n.includes('box') || n.includes('case') || n.includes('carton') || n.includes('shipper');
        };

        const packagingCosts = [];
        const unmatchedPackaging = [];

        for (const pkg of recipe.packaging) {
          if (!pkg.name) continue;
          const totalNeeded = isBoxOrCase(pkg.name)
            ? (pkg.quantity || 1) * cases
            : (pkg.quantity || 1) * totalBottles;
          if (totalNeeded <= 0) continue;
          const rm = findRM(pkg.name);
          if (rm) {
            const newQty = Math.max(0, (rm.quantity || 0) - totalNeeded);

            // FIFO cost: find the oldest lot with remaining stock and use its cost
            const lots = Array.isArray(rm.lots) && rm.lots.length > 0
              ? [...rm.lots].sort((a, b) => (a.date_received || '').localeCompare(b.date_received || ''))
              : null;

            let fifoCostPerUnit = rm.cost_per_unit || 0;
            let fifoLotNumber = null;

            if (lots) {
              // Find oldest lot with stock — that's what FIFO says we're using
              let remaining = totalNeeded;
              let totalCostAccum = 0;
              for (const lot of lots) {
                if (remaining <= 0) break;
                const take = Math.min(lot.quantity_remaining || 0, remaining);
                if (take <= 0) continue;
                totalCostAccum += take * (lot.cost_per_unit || rm.cost_per_unit || 0);
                if (!fifoLotNumber) fifoLotNumber = lot.lot_number;
                remaining -= take;
              }
              fifoCostPerUnit = totalNeeded > 0 ? totalCostAccum / totalNeeded : (rm.cost_per_unit || 0);

              // Deplete lots FIFO
              let toDeplete = totalNeeded;
              const updatedLots = lots.map(lot => {
                if (toDeplete <= 0) return lot;
                const take = Math.min(lot.quantity_remaining || 0, toDeplete);
                toDeplete -= take;
                return { ...lot, quantity_remaining: parseFloat(Math.max(0, (lot.quantity_remaining || 0) - take).toFixed(4)) };
              });
              await db.RawMaterial.update(rm.id, {
                quantity: parseFloat(newQty.toFixed(4)),
                lots: updatedLots,
              });
            } else {
              await db.RawMaterial.update(rm.id, { quantity: parseFloat(newQty.toFixed(4)) });
            }

            packagingCosts.push({
              name: pkg.name,
              qty_used: totalNeeded,
              cost_per_unit: parseFloat(fifoCostPerUnit.toFixed(6)),
              total_cost: parseFloat((totalNeeded * fifoCostPerUnit).toFixed(4)),
              lot_number: fifoLotNumber || null,
            });
          } else {
            unmatchedPackaging.push(pkg.name);
            toast.warning(`Packaging item "${pkg.name}" not found in inventory — please check your inventory records`);
          }
        }

        // Save FIFO packaging costs to the bottling run for accurate COGS reporting
        if (packagingCosts.length > 0 && newRun?.id) {
          await db.BottlingRun.update(newRun.id, { packaging_costs: packagingCosts });
        }

        // A toast alone disappears and leaves no trace — if a packaging item
        // couldn't be matched, its inventory was never deducted for this
        // run, so record that permanently on the run itself rather than
        // relying on someone having seen and remembered a toast at the time.
        if (unmatchedPackaging.length > 0 && newRun?.id) {
          await db.BottlingRun.update(newRun.id, {
            notes: `${newRun.notes || ''}\n⚠ Not deducted from inventory (no matching raw material): ${unmatchedPackaging.join(', ')}`.trim(),
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bottlingFloorRuns'] });
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      queryClient.invalidateQueries({ queryKey: ['wastageRecords'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      localStorage.removeItem(ACTIVE_RUN_KEY);
      setActiveRun(null);
      resetForm();
      toast.success('Run complete — stock updated!');
    },
    onError: (err) => toast.error(err.message || 'Failed to complete bottling run'),
  });

  // Edit run — updates only safe metadata fields (date, notes, status)
  const editRunMutation = useMutation({
    mutationFn: async (data) => {
      await db.BottlingRun.update(editingRun.id, {
        // date is a NOT NULL `date` column with no default — this input has
        // no `required` attribute so it can be cleared to '', which fails
        // Postgres's cast to date and 400s the update.
        date: data.date || undefined,
        notes: data.notes,
        status: data.status,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bottlingFloorRuns'] });
      setEditingRun(null);
      toast.success('Run updated');
    },
    onError: (err) => toast.error(err.message || 'Failed to update run'),
  });

  // Delete run — reverses all inventory impacts
  const deleteRunMutation = useMutation({
    mutationFn: async (run) => {
      const bottlesProduced = run.bottles_produced || 0;
      const spiritVolume = run.input_volume || 0;
      const abv = run.input_abv || 0;
      const lals = run.input_lals || 0;

      // 1. Return spirit to source tank — find via TankMovement audit trail
      const allMovements = await db.TankMovement.list('-date', 5000);
      const bottlingDraw = allMovements.find(tm =>
        tm.action === 'bottling_draw' &&
        tm.batch_number === run.batch_number &&
        Math.abs((tm.volume_litres || 0) - (run.input_volume || 0)) < 0.01
      );

      if (bottlingDraw) {
        const tank = tanks.find(t => t.name === bottlingDraw.tank_name);
        if (tank) {
          await db.StorageTank.update(tank.id, {
            current_volume: parseFloat(((tank.current_volume || 0) + (run.input_volume || 0)).toFixed(3)),
          });
          await db.TankMovement.create({
            date: new Date().toISOString().split('T')[0],
            action: 'bottling_reversed',
            tank_name: tank.name,
            volume_litres: run.input_volume || 0,
            abv: run.input_abv || 0,
            lals: run.input_lals || 0,
            batch_number: run.batch_number,
            notes: `Reversal: bottling run deleted (${run.date})`,
          });
        }
      }

      // 2. Deduct from finished goods
      if (bottlesProduced > 0) {
        const fgProductName = run.product_name;
        const allFG = await db.FinishedGood.list('product_name', 5000);
        const fg = allFG.find(g =>
          g.product_name === fgProductName &&
          g.batch_number === run.batch_number &&
          Number(g.bottle_size_ml) === Number(run.bottle_size_ml)
        );
        if (fg) {
          const newQty = Math.max(0, (fg.quantity_bottles || 0) - bottlesProduced);
          const newLals = Math.max(0, (fg.total_lals || 0) - lals);
          if (newQty === 0) {
            await db.FinishedGood.delete(fg.id);
          } else {
            await db.FinishedGood.update(fg.id, {
              quantity_bottles: newQty,
              total_lals: parseFloat(newLals.toFixed(4)),
            });
          }
        }
      }

      // 3. Delete WastageRecord(s) created for tasting bottles from this run
      const tastingWastage = await db.WastageRecord.filter({ source: 'bottling', batch_number: run.batch_number });
      for (const wr of tastingWastage) {
        await db.WastageRecord.delete(wr.id);
      }

      // 4. Restore packaging materials to RawMaterial inventory
      const runRecipe = recipes.find(r => r.id === run.recipe_id);
      if (runRecipe?.packaging?.length && run.bottles_produced > 0) {
        const allRM = await db.RawMaterial.list('name', 5000);
        const findRM2 = (pkgName) => {
          const target = (pkgName || '').toLowerCase().trim();
          let match = allRM.find(r => (r.name || '').toLowerCase().trim() === target);
          if (!match) match = allRM.find(r => { const name = (r.name || '').toLowerCase().trim(); return name.includes(target) || target.includes(name); });
          return match;
        };
        const isBoxOrCase2 = (name) => {
          const n = (name || '').toLowerCase();
          return n.includes('box') || n.includes('case') || n.includes('carton') || n.includes('shipper');
        };
        // Work out how many cases were in this run
        const casesInRun = Math.floor((run.bottles_produced || 0) / (runRecipe.bottles_per_case || 6));
        for (const pkg of runRecipe.packaging) {
          if (!pkg.name) continue;
          const totalToRestore = isBoxOrCase2(pkg.name)
            ? (pkg.quantity || 1) * casesInRun
            : (pkg.quantity || 1) * run.bottles_produced;
          const rm = findRM2(pkg.name);
          if (rm) {
            await db.RawMaterial.update(rm.id, {
              quantity: parseFloat(((rm.quantity || 0) + totalToRestore).toFixed(4)),
            });
          }
        }
      }

      // 5. Delete the run record
      await db.BottlingRun.delete(run.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bottlingFloorRuns'] });
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      queryClient.invalidateQueries({ queryKey: ['wastageRecords'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      setDeletingRun(null);
      toast.success('Run deleted and inventory reversed');
    },
    onError: (err) => toast.error(err.message || 'Failed to delete run'),
  });

  const filteredHistory = bottlingRuns.filter(run => {
    if (historyFilter.startDate && new Date(run.date) < new Date(historyFilter.startDate)) return false;
    if (historyFilter.endDate && new Date(run.date) > new Date(historyFilter.endDate)) return false;
    return true;
  });

  const pagedHistory = filteredHistory.slice((page - 1) * pageSize, page * pageSize);

  if (activeRun) {
    return (
      <BottlingRunTracker
        run={activeRun}
        onComplete={(data) => completeRunMutation.mutate(data)}
        onCancel={() => setActiveRun(null)}
        isCompleting={completeRunMutation.isPending}
      />
    );
  }

  return (
    <div>
      <PageHeader title="Bottling Floor" subtitle="Live production tracking and case management">
        <Button onClick={() => setShowNewRun(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Start Run
        </Button>
      </PageHeader>

      {/* Start New Run Dialog */}
      <Dialog open={showNewRun} onOpenChange={v => { setShowNewRun(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Start Bottling Run</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 mt-4">

            {/* Batch selection — only from finishing tanks */}
            <div>
              <Label>Batch (Finishing Tanks Only)</Label>
              <Select
                value={selectedBatchId}
                onValueChange={v => {
                  setSelectedBatchId(v);
                  const batch = masterBatches.find(b => b.id === v);
                  const batchTankList = batch
                    ? finishingTanks.filter(t =>
                        t.current_batch === batch.batch_code ||
                        t.current_product === batch.product_name
                      )
                    : [];
                  // Auto-select tank if only one matches
                  setSelectedTankId(batchTankList.length === 1 ? batchTankList[0].id : '');
                  // Auto-select packaging recipe if the new batch narrows it to exactly one
                  const spiritRecipe = batch ? recipes.find(r => r.recipe_type === 'spirit' && r.name === batch.product_name) : null;
                  const allPackaging = recipes.filter(r => r.recipe_type === 'packaging');
                  const matching = spiritRecipe ? allPackaging.filter(r => r.base_recipe_id === spiritRecipe.id) : [];
                  const candidates = matching.length > 0 ? matching : allPackaging;
                  setSelectedPackagingRecipeId(candidates.length === 1 ? candidates[0].id : '');
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select a batch ready to bottle" /></SelectTrigger>
                <SelectContent>
                  {bottleReadyBatches.length === 0 && (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                      No tanks marked as ready for bottling
                    </div>
                  )}
                  {bottleReadyBatches.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.batch_code} — {b.product_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Auto-filled info */}
            {selectedBatch && (
              <div className="rounded-lg bg-muted px-4 py-3 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Product</p>
                  <p className="font-semibold">{selectedBatch.product_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">ABV</p>
                  <p className="font-semibold">
                    {batchTanks[0]?.current_abv != null ? `${batchTanks[0].current_abv}%` : '—'}
                  </p>
                </div>
              </div>
            )}

            {/* Source tank (from batch's finishing tanks) */}
            {batchTanks.length > 0 && (
              <div>
                <Label>Source Tank</Label>
                <Select value={selectedTankId} onValueChange={setSelectedTankId}>
                  <SelectTrigger><SelectValue placeholder="Select tank" /></SelectTrigger>
                  <SelectContent>
                    {batchTanks.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} — {t.current_volume?.toFixed(1) || 0}L @ {t.current_abv || 0}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Packaging recipe — picking one sets bottle size, bottles/case,
                packaging materials, and the finished-good Product together */}
            <div>
              <Label>Packaging Recipe</Label>
              <Select value={selectedPackagingRecipeId} onValueChange={setSelectedPackagingRecipeId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select packaging recipe…" /></SelectTrigger>
                <SelectContent>
                  {availablePackagingRecipes.length === 0 && (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                      No packaging recipes yet — add one under Settings → Packaging Recipes
                    </div>
                  )}
                  {availablePackagingRecipes.map(r => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}{r.bottle_size_ml ? ` — ${r.bottle_size_ml}ml` : ''}{r.bottles_per_case ? ` — ${r.bottles_per_case} btls/case` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRecipe && (
                <div className="mt-2 rounded-lg border border-border px-4 py-3">
                  <p className="text-xs text-muted-foreground">{selectedRecipe.bottle_size_ml}ml · {selectedRecipe.bottles_per_case || 6} bottles per case</p>
                  {selectedRecipe.packaging?.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border space-y-0.5">
                      {selectedRecipe.packaging.map((p, i) => (
                        <div key={i} className="flex justify-between text-xs text-muted-foreground">
                          <span>{p.name}</span>
                          <span>{p.quantity} {p.unit}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Team */}
            <div>
              <Label>Production Team</Label>
              <div className="flex gap-2 mt-1 mb-2">
                <Input
                  placeholder="Enter name and press Enter"
                  value={newStaffName}
                  onChange={e => setNewStaffName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addStaff()}
                  className="text-base"
                />
                <Button type="button" variant="outline" size="icon" onClick={addStaff}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              {staffNames.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {staffNames.map((name, i) => (
                    <Badge key={i} variant="secondary" className="flex items-center gap-1.5 px-3 py-1">
                      {name}
                      <button onClick={() => removeStaff(i)} className="text-muted-foreground hover:text-destructive ml-1">×</button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Button
              onClick={startRun}
              disabled={!canStart}
              className="w-full h-12 text-base font-semibold"
            >
              Start Bottling
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch Status Summary */}
      {(() => {
        const inProgress = bottlingRuns.filter(r => r.status === 'in_progress');
        const completed = bottlingRuns.filter(r => r.status === 'completed');
        const planned = bottlingRuns.filter(r => r.status === 'planned');
        const totalBottles = completed.reduce((sum, r) => sum + (r.bottles_produced || 0), 0);

        const stats = [
          {
            label: 'Waiting to Bottle',
            value: bottleReadyBatches.length,
            sub: `batch${bottleReadyBatches.length !== 1 ? 'es' : ''} ready`,
            icon: Clock,
            color: 'text-amber-600',
            bg: 'bg-amber-50 border-amber-200',
          },
          {
            label: 'In Progress',
            value: inProgress.length + (activeRun ? 1 : 0),
            sub: `run${(inProgress.length + (activeRun ? 1 : 0)) !== 1 ? 's' : ''} active`,
            icon: FlaskConical,
            color: 'text-blue-600',
            bg: 'bg-blue-50 border-blue-200',
          },
          {
            label: 'Completed',
            value: completed.length,
            sub: `run${completed.length !== 1 ? 's' : ''} finished`,
            icon: CheckCircle2,
            color: 'text-green-600',
            bg: 'bg-green-50 border-green-200',
          },
          {
            label: 'Total Bottles Produced',
            value: totalBottles.toLocaleString(),
            sub: 'across all completed runs',
            icon: PackageCheck,
            color: 'text-primary',
            bg: 'bg-accent border-accent-foreground/10',
          },
        ];

        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {stats.map(({ label, value, sub, icon: Icon, color, bg }) => (
              <div key={label} className={`rounded-xl border p-4 flex flex-col gap-1 ${bg}`}>
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${color}`} />
                  <span className="text-xs font-medium text-muted-foreground">{label}</span>
                </div>
                <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Bottling History */}
      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Bottling History
          </h2>
          <div className="flex flex-wrap gap-3 mb-4">
            <Input
              type="date"
              value={historyFilter.startDate}
              onChange={e => setHistoryFilter({ ...historyFilter, startDate: e.target.value })}
              className="text-sm w-auto"
            />
            <Input
              type="date"
              value={historyFilter.endDate}
              onChange={e => setHistoryFilter({ ...historyFilter, endDate: e.target.value })}
              className="text-sm w-auto"
            />
            <Button variant="outline" onClick={() => setHistoryFilter({ startDate: '', endDate: '' })} className="text-sm">
              Clear
            </Button>
          </div>
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Bottles</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHistory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No bottling runs yet
                    </TableCell>
                  </TableRow>
                ) : pagedHistory.map(run => (
                  <TableRow key={run.id}>
                    <TableCell>{run.date ? format(new Date(run.date), 'MMM d, yyyy') : '—'}</TableCell>
                    <TableCell className="font-mono font-semibold">{run.batch_number}</TableCell>
                    <TableCell>{run.product_name}</TableCell>
                    <TableCell className="font-semibold">{run.bottles_produced || 0}</TableCell>
                    <TableCell>{run.bottle_size_ml}ml</TableCell>
                    <TableCell><StatusBadge status={run.status} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditingRun(run); setEditForm({ date: run.date, notes: run.notes || '', status: run.status }); }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => setDeletingRun(run)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination total={filteredHistory.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
        </Card>
      </div>

      {/* Edit Run Dialog */}
      <Dialog open={!!editingRun} onOpenChange={v => !v && setEditingRun(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Edit Bottling Run</DialogTitle>
          </DialogHeader>
          {editingRun && (
            <div className="space-y-4 mt-2">
              <div className="rounded-lg bg-muted px-4 py-3 text-sm">
                <p className="font-semibold">{editingRun.product_name}</p>
                <p className="text-muted-foreground text-xs">{editingRun.batch_number} · {editingRun.bottles_produced} bottles · {editingRun.bottle_size_ml}ml</p>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} className="mt-1" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setEditingRun(null)}>Cancel</Button>
                <Button className="flex-1" disabled={editRunMutation.isPending} onClick={() => editRunMutation.mutate(editForm)}>
                  {editRunMutation.isPending ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <AlertDialog open={!!deletingRun} onOpenChange={v => !v && setDeletingRun(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bottling Run?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the run for <strong>{deletingRun?.product_name}</strong> ({deletingRun?.batch_number}) and reverse all inventory changes:
              <ul className="mt-2 space-y-1 list-disc list-inside text-sm">
                <li>Return <strong>{deletingRun?.input_volume?.toFixed(1)}L</strong> of spirit back to the source tank</li>
                <li>Remove <strong>{deletingRun?.bottles_produced}</strong> bottles from finished goods stock</li>
                <li>Delete tasting bottle wastage records for this batch</li>
              </ul>
              <p className="mt-2 font-medium text-destructive">This cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteRunMutation.mutate(deletingRun)}
              disabled={deleteRunMutation.isPending}
            >
              {deleteRunMutation.isPending ? 'Deleting…' : 'Delete & Reverse'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}