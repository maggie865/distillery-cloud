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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, BarChart3, Pencil, Trash2, FlaskConical, CheckCircle2, Clock, PackageCheck, AlertTriangle, ChevronDown, ChevronRight, Wrench, Package } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import BottlingRunTracker from '@/components/bottling/BottlingRunTracker';
import Pagination from '@/components/ui/Pagination';
import PreUseChecksTab from '@/components/maintenance/PreUseChecksTab';
import { isBoxOrCase, findPackagingMaterial, checkPackagingStock } from '@/lib/packagingStock';
import AddRunToPalletDialog from '@/components/pallets/AddRunToPalletDialog';
import ChoosePalletDialog from '@/components/pallets/ChoosePalletDialog';
import ScanPalletDialog from '@/components/pallets/ScanPalletDialog';
import QuickCreatePalletDialog from '@/components/pallets/QuickCreatePalletDialog';

const ACTIVE_RUN_KEY = 'bottling_active_run';
const CURRENT_PALLET_KEY = 'bottling_current_pallet_id';

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
  const [palletRun, setPalletRun] = useState(null);
  const [currentPalletId, setCurrentPalletId] = useState(null);
  const [choosingPallet, setChoosingPallet] = useState(false);
  const [scanningPallet, setScanningPallet] = useState(false);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateMode, setQuickCreateMode] = useState('start'); // 'start' (about to begin a run) | 'swap' (current pallet just marked full)
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [preUseExpanded, setPreUseExpanded] = useState(false);
  const [preUseSaving, setPreUseSaving] = useState(false);

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

  // The pallet currently being stacked is sticky across runs — chosen once
  // (or after "Complete Pallet"), then reused for every run until changed,
  // so it survives reloads the same way the active run itself does.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CURRENT_PALLET_KEY);
      if (saved) setCurrentPalletId(saved);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => {
    if (currentPalletId) {
      localStorage.setItem(CURRENT_PALLET_KEY, currentPalletId);
    } else {
      localStorage.removeItem(CURRENT_PALLET_KEY);
    }
  }, [currentPalletId]);

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

  const { data: rawMaterials = [] } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => db.RawMaterial.list('name', 5000),
  });

  const { data: maintenanceRecords = [] } = useQuery({
    queryKey: ['maintenanceRecords'],
    queryFn: () => db.MaintenanceRecord.list('-date', 5000),
  });

  const { data: finishedGoods = [] } = useQuery({
    queryKey: ['finishedGoods'],
    queryFn: () => db.FinishedGood.list('product_name', 5000),
  });

  const { data: pallets = [] } = useQuery({
    queryKey: ['pallets'],
    queryFn: () => db.Pallet.list('-created_at', 5000),
  });
  const currentPallet = pallets.find(p => p.id === currentPalletId) || null;

  const createPreUseRecords = async (recordsList) => {
    setPreUseSaving(true);
    try {
      for (const data of recordsList) {
        await db.MaintenanceRecord.create(data);
      }
      await queryClient.invalidateQueries({ queryKey: ['maintenanceRecords'] });
    } finally {
      setPreUseSaving(false);
    }
  };

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

  // Rough expected yield from the selected tank's volume — the actual count
  // isn't known until the run is finished (cases/extras are tallied live on
  // the bottling floor), so this is only ever an estimate to flag an
  // obvious shortfall before spirit gets committed to bottles, not a
  // precise prediction.
  const estimatedBottles = selectedTank?.current_volume && selectedRecipe?.bottle_size_ml
    ? Math.floor((selectedTank.current_volume * 1000) / selectedRecipe.bottle_size_ml)
    : 0;
  const estimatedCases = Math.floor(estimatedBottles / bottlesPerCase);
  const packagingStockCheck = selectedRecipe
    ? checkPackagingStock(selectedRecipe, rawMaterials, { bottles: estimatedBottles, cases: estimatedCases })
    : [];
  const packagingShortfalls = packagingStockCheck.filter(p => p.shortfall > 0 || !p.found);

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

  const doStartRun = () => {
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

  // Every run has to be attached to a pallet — if one's already chosen
  // (sticky until "Complete Pallet"), skip straight to starting; otherwise
  // prompt for scan-existing vs create-new first.
  const startRun = () => {
    if (!currentPalletId) {
      setQuickCreateMode('start');
      setChoosingPallet(true);
      return;
    }
    doStartRun();
  };

  const handleChooseExistingPallet = () => {
    setChoosingPallet(false);
    setScanningPallet(true);
  };

  const handleChooseNewPallet = () => {
    setChoosingPallet(false);
    setQuickCreateMode('start');
    setQuickCreateOpen(true);
  };

  const handlePalletScanned = (code) => {
    setScanningPallet(false);
    const match = pallets.find(p => p.pallet_code.toLowerCase() === code.trim().toLowerCase());
    if (!match) {
      toast.error(`No pallet found with code "${code}"`);
      return;
    }
    if (match.status !== 'active') {
      toast.error(`Pallet ${match.pallet_code} is ${match.status} — scan or create an active pallet instead.`);
      return;
    }
    setCurrentPalletId(match.id);
    if (quickCreateMode === 'start') doStartRun();
  };

  const handlePalletCreated = (pallet) => {
    setCurrentPalletId(pallet.id);
    if (quickCreateMode === 'start') {
      doStartRun();
    } else {
      toast.success(`Now stacking onto ${pallet.pallet_code}`);
    }
  };

  const completePalletMutation = useMutation({
    mutationFn: async () => {
      if (!currentPalletId) return;
      await db.Pallet.update(currentPalletId, { status: 'full' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pallets'] });
      const finishedCode = currentPallet?.pallet_code;
      setCurrentPalletId(null);
      toast.success(finishedCode ? `${finishedCode} marked full` : 'Pallet marked full');
      setQuickCreateMode('swap');
      setQuickCreateOpen(true);
    },
    onError: (err) => toast.error(err.message || 'Failed to complete pallet'),
  });

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
        bottles_per_case: activeRun.bottles_per_case,
        cases_produced: cases,
        lals_per_bottle: parseFloat(lalPerBottle.toFixed(5)),
        tasting_bottles_produced: tastingBottles,
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

        const packagingCosts = [];
        const unmatchedPackaging = [];

        for (const pkg of recipe.packaging) {
          if (!pkg.name) continue;
          const totalNeeded = isBoxOrCase(pkg.name)
            ? (pkg.quantity || 1) * cases
            : (pkg.quantity || 1) * totalBottles;
          if (totalNeeded <= 0) continue;
          const rm = findPackagingMaterial(allRM, pkg.name);
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

      // 6. Stack this run's output onto whichever pallet is currently being
      // filled — best-effort, same as every other pallet reconciliation in
      // this app: it never blocks the real stock update above.
      if (currentPalletId && totalBottles > 0) {
        try {
          const items = await db.PalletItem.filter({ pallet_id: currentPalletId });
          const existing = items.find(it =>
            it.product_name === activeRun.product_name &&
            (it.batch_number || null) === (activeRun.batch_code || null) &&
            Number(it.bottle_size_ml) === Number(activeRun.bottle_size_ml)
          );
          if (existing) {
            await db.PalletItem.update(existing.id, {
              quantity_bottles: (existing.quantity_bottles || 0) + totalBottles,
              total_lals: parseFloat(((existing.total_lals || 0) + lals).toFixed(4)),
            });
          } else {
            await db.PalletItem.create({
              pallet_id: currentPalletId,
              product_name: activeRun.product_name,
              batch_number: activeRun.batch_code,
              bottle_size_ml: activeRun.bottle_size_ml,
              quantity_bottles: totalBottles,
              total_lals: parseFloat(lals.toFixed(4)),
              source: 'bottling_run',
              bottling_run_id: newRun.id,
            });
          }
        } catch (err) {
          toast.warning('Stock saved, but could not attach it to the current pallet: ' + err.message);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bottlingFloorRuns'] });
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      queryClient.invalidateQueries({ queryKey: ['wastageRecords'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      queryClient.invalidateQueries({ queryKey: ['pallets'] });
      queryClient.invalidateQueries({ queryKey: ['palletItemsAll'] });
      queryClient.invalidateQueries({ queryKey: ['palletItems'] });
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

      // 3. Reverse tasting bottles this run added to its tasting stock line.
      // tasting_bottles_produced is the reliable source; older runs from
      // before that column existed only have it embedded in notes text
      // ("Tasting: N"), so fall back to parsing that.
      const tastingBottlesProduced = run.tasting_bottles_produced ??
        parseInt((run.notes || '').match(/Tasting:\s*(\d+)/)?.[1] || '0', 10);
      if (tastingBottlesProduced > 0) {
        const tastingName = `${run.product_name} — Tasting`;
        const allFG = await db.FinishedGood.list('product_name', 5000);
        const tg = allFG.find(g =>
          g.product_name === tastingName &&
          g.batch_number === run.batch_number &&
          Number(g.bottle_size_ml) === Number(run.bottle_size_ml)
        );
        if (tg) {
          const tastingLalsPerBottle = (tg.quantity_bottles || 0) > 0 && tg.total_lals ? tg.total_lals / tg.quantity_bottles : 0;
          const newTastingQty = Math.max(0, (tg.quantity_bottles || 0) - tastingBottlesProduced);
          const newTastingLals = Math.max(0, (tg.total_lals || 0) - tastingBottlesProduced * tastingLalsPerBottle);
          if (newTastingQty === 0) {
            await db.FinishedGood.delete(tg.id);
          } else {
            await db.FinishedGood.update(tg.id, {
              quantity_bottles: newTastingQty,
              total_lals: parseFloat(newTastingLals.toFixed(4)),
            });
          }
        }
      }

      // Delete WastageRecord(s) created for tasting bottles from this run —
      // only relevant for older runs, from before tasting bottles moved to
      // their own finished-goods line instead of being logged as wastage.
      const tastingWastage = await db.WastageRecord.filter({ source: 'bottling', batch_number: run.batch_number });
      for (const wr of tastingWastage) {
        await db.WastageRecord.delete(wr.id);
      }

      // 4. Restore packaging materials to RawMaterial inventory
      const runRecipe = recipes.find(r => r.id === run.recipe_id);
      if (runRecipe?.packaging?.length && run.bottles_produced > 0) {
        const allRM = await db.RawMaterial.list('name', 5000);
        // Cases actually bottled, as recorded at completion time — NOT
        // recomputed via floor(bottles_produced / bottles_per_case), which
        // silently mismatches the true original case count whenever
        // "extra bottles" reached a full case's worth or the packaging
        // recipe's bottles_per_case changed since. Runs from before this
        // field existed fall back to the old reconstruction as a
        // best-effort (using the run's own bottles_per_case if it has one,
        // since that's what was true when it happened, not the recipe's
        // current value).
        const casesInRun = run.cases_produced ?? Math.floor((run.bottles_produced || 0) / (run.bottles_per_case || runRecipe.bottles_per_case || 6));
        for (const pkg of runRecipe.packaging) {
          if (!pkg.name) continue;
          const totalToRestore = isBoxOrCase(pkg.name)
            ? (pkg.quantity || 1) * casesInRun
            : (pkg.quantity || 1) * run.bottles_produced;
          const rm = findPackagingMaterial(allRM, pkg.name);
          if (rm) {
            await db.RawMaterial.update(rm.id, {
              quantity: parseFloat(((rm.quantity || 0) + totalToRestore).toFixed(4)),
            });
          }
        }
      }

      // 5. Take this run's contribution off whichever pallet it was
      // stacked on — same product/batch/size match as the automatic
      // attachment in completeRunMutation, clamped at zero the same way
      // Finished Goods is above: stock already dispatched or transferred
      // off the pallet can't be un-shipped by deleting the run.
      if (bottlesProduced > 0) {
        const allPalletItems = await db.PalletItem.list('-created_at', 5000);
        const item = allPalletItems.find(it =>
          it.product_name === run.product_name &&
          (it.batch_number || null) === (run.batch_number || null) &&
          Number(it.bottle_size_ml) === Number(run.bottle_size_ml)
        );
        if (item) {
          const itemLalsPerBottle = (item.quantity_bottles || 0) > 0 && item.total_lals ? item.total_lals / item.quantity_bottles : 0;
          const newItemQty = Math.max(0, (item.quantity_bottles || 0) - bottlesProduced);
          const newItemLals = Math.max(0, (item.total_lals || 0) - bottlesProduced * itemLalsPerBottle);
          if (newItemQty === 0) {
            await db.PalletItem.delete(item.id);
          } else {
            await db.PalletItem.update(item.id, {
              quantity_bottles: newItemQty,
              total_lals: parseFloat(newItemLals.toFixed(4)),
            });
          }
        }
      }

      // 6. Delete the run record
      await db.BottlingRun.delete(run.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bottlingFloorRuns'] });
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['finishedGoods'] });
      queryClient.invalidateQueries({ queryKey: ['wastageRecords'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      queryClient.invalidateQueries({ queryKey: ['pallets'] });
      queryClient.invalidateQueries({ queryKey: ['palletItemsAll'] });
      queryClient.invalidateQueries({ queryKey: ['palletItems'] });
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

  // How much of the run being deleted can no longer be reversed because it's
  // already left the building (dispatched, transferred, etc.) — the batch's
  // current Finished Goods balance is lower than what this run contributed.
  const deleteShortfall = (() => {
    if (!deletingRun) return 0;
    const fg = finishedGoods.find(g =>
      g.product_name === deletingRun.product_name &&
      g.batch_number === deletingRun.batch_number &&
      Number(g.bottle_size_ml) === Number(deletingRun.bottle_size_ml)
    );
    const currentQty = fg?.quantity_bottles || 0;
    return Math.max(0, (deletingRun.bottles_produced || 0) - currentQty);
  })();

  if (activeRun) {
    return (
      <>
        <BottlingRunTracker
          run={activeRun}
          onComplete={(data) => completeRunMutation.mutate(data)}
          onCancel={() => setActiveRun(null)}
          isCompleting={completeRunMutation.isPending}
          currentPallet={currentPallet}
          onCompletePallet={() => completePalletMutation.mutate()}
          completingPallet={completePalletMutation.isPending}
        />
        <ChoosePalletDialog
          open={choosingPallet}
          onClose={() => setChoosingPallet(false)}
          onChooseExisting={handleChooseExistingPallet}
          onChooseNew={handleChooseNewPallet}
        />
        <ScanPalletDialog open={scanningPallet} onClose={() => setScanningPallet(false)} onResolve={handlePalletScanned} />
        <QuickCreatePalletDialog
          open={quickCreateOpen}
          onClose={() => setQuickCreateOpen(false)}
          onCreated={handlePalletCreated}
          title={quickCreateMode === 'swap' ? 'Pallet Full — Start a New One' : 'New Pallet'}
          continueLabel={quickCreateMode === 'swap' ? 'Continue Bottling' : 'Start Bottling'}
        />
      </>
    );
  }

  return (
    <div>
      <PageHeader title="Bottling Floor" subtitle="Live production tracking and case management">
        <div className="flex items-center gap-3">
          {currentPallet && (
            <Badge variant="outline" className="gap-1.5 h-9 px-3 font-mono">
              <Package className="w-3.5 h-3.5" /> {currentPallet.pallet_code}
            </Badge>
          )}
          <Button onClick={() => setShowNewRun(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Start Run
          </Button>
        </div>
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
                  <p className="text-xs text-muted-foreground">
                    {selectedRecipe.bottle_size_ml}ml · {selectedRecipe.bottles_per_case || 6} bottles per case
                    {estimatedBottles > 0 && ` · ~${estimatedBottles.toLocaleString()} bottles expected from this tank`}
                  </p>
                  {packagingStockCheck.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border space-y-0.5">
                      {packagingStockCheck.map((p, i) => {
                        const short = p.shortfall > 0 || !p.found;
                        return (
                          <div key={i} className={`flex justify-between text-xs ${short ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                            <span>{p.name}</span>
                            <span>{p.found ? `${p.onHand.toLocaleString()} in stock${p.needed > 0 ? ` / ${p.needed.toLocaleString()} needed` : ''}` : 'not in inventory'}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              {selectedRecipe && estimatedBottles > 0 && packagingShortfalls.length > 0 && (
                <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
                  <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Not enough packaging on hand for the expected yield
                  </p>
                  <ul className="text-xs text-amber-700 mt-1 space-y-0.5 list-disc list-inside">
                    {packagingShortfalls.map((p, i) => (
                      <li key={i}>{p.name}{p.found ? ` — short by ${p.shortfall.toLocaleString()}` : ' — not found in inventory'}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-amber-700/80 mt-1">This is an estimate based on the tank's volume — you can still start the run, but you may need to order more before finishing it.</p>
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

      {/* Bottle Washer Pre-Use Check — optional, no compliance tracking */}
      <Collapsible open={preUseExpanded} onOpenChange={setPreUseExpanded} className="mb-4">
        <Card className="overflow-hidden">
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors">
              <span className="font-semibold text-sm flex items-center gap-2">
                {preUseExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <Wrench className="w-4 h-4 text-muted-foreground" />
                Bottle Washer Pre-Use Check
              </span>
              <span className="text-xs text-muted-foreground">Optional · Click to expand</span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border-t p-4">
              <PreUseChecksTab records={maintenanceRecords} onCreate={createPreUseRecords} saving={preUseSaving} />
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>

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
                          title="Add to Pallet"
                          onClick={() => setPalletRun(run)}
                        >
                          <Package className="w-3.5 h-3.5" />
                        </Button>
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
                <li>Remove <strong>{deletingRun ? (deletingRun.bottles_produced || 0) - deleteShortfall : 0}</strong> bottles from finished goods stock{deleteShortfall > 0 ? ' (all that remains)' : ''}</li>
                {deletingRun?.tasting_bottles_produced > 0 && (
                  <li>Remove <strong>{deletingRun.tasting_bottles_produced}</strong> bottles from tasting stock</li>
                )}
                <li>Return any packaging materials this run used</li>
                <li>Remove its bottles from whichever pallet it was stacked on</li>
              </ul>
              {deleteShortfall > 0 && (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                  <p className="font-semibold text-destructive">
                    {deleteShortfall.toLocaleString()} of this run's bottles have already left the building
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {deletingRun?.batch_number}'s Finished Goods balance is already lower than what this run alone produced — the rest has been dispatched, transferred, or moved elsewhere. Those records won't be touched or reversed, and this run's contribution will simply disappear from {deletingRun?.batch_number}'s production total, so it will permanently look like less was bottled than what's actually been sold. If this run is a genuine duplicate or mistake, that's expected — otherwise, cancel and check the batch's dispatch history first.
                  </p>
                </div>
              )}
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
              {deleteRunMutation.isPending ? 'Deleting…' : deleteShortfall > 0 ? 'Delete Anyway' : 'Delete & Reverse'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddRunToPalletDialog open={!!palletRun} onClose={() => setPalletRun(null)} run={palletRun} />

      <ChoosePalletDialog
        open={choosingPallet}
        onClose={() => setChoosingPallet(false)}
        onChooseExisting={handleChooseExistingPallet}
        onChooseNew={handleChooseNewPallet}
      />
      <ScanPalletDialog open={scanningPallet} onClose={() => setScanningPallet(false)} onResolve={handlePalletScanned} />
      <QuickCreatePalletDialog
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        onCreated={handlePalletCreated}
        title="New Pallet"
      />
    </div>
  );
}