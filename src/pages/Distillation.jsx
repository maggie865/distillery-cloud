import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Calculator, FlaskConical, AlertTriangle, CheckCircle2, Pencil, Search, Trash2 } from 'lucide-react';
import MobileCard, { MobileCardGrid, MobileDetailRow } from '@/components/shared/MobileCard';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import CompleteDistillationDialog from '@/components/distillation/CompleteDistillationDialog';
import CreateBatchDialog from '@/components/distillation/CreateBatchDialog';
import BatchManagement from '@/components/distillation/BatchManagement';
import TankAllocationSelector from '@/components/distillation/TankAllocationSelector';
import RunTimeline from '@/components/distillation/RunTimeline';
import Pagination from '@/components/ui/Pagination';

const EMPTY_FORM = {
  batch_number: '', date: new Date().toISOString().split('T')[0],
  product_name: '',
  sub_batch_code: '',
  ethanol_lot_code: '',
  source_tank_allocations: [],
  maceration_date: '', maceration_notes: '',
  input_volume: '', input_abv: '',
  atmospheric_pressure: '', still_temp: '',
  run_start_time: '', run_end_time: '',
  heads_start_time: '', heads_end_time: '',
  hearts_end_time: '', tails_end_time: '',
  abv_readings: [],
  heads_volume: '', heads_abv: '',
  hearts_volume: '', hearts_abv: '',
  tails_volume: '', tails_abv: '',
  dumped_volume: '', dumped_abv: '', dumped_notes: '',
  destination_tank_id: '',
  status: 'planned', notes: ''
};

export default function Distillation() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [runToComplete, setRunToComplete] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [scaledIngredients, setScaledIngredients] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [createBatchOpen, setCreateBatchOpen] = useState(false);
  const [batchError, setBatchError] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [deletingRun, setDeletingRun] = useState(null);
  const queryClient = useQueryClient();

  const { data: masterBatches = [] } = useQuery({
    queryKey: ['masterBatches'],
    queryFn: () => base44.entities.MasterBatch.list('-date_started', 5000),
  });

  // Only show batches that are not yet completed/bottling-done
  const activeBatches = masterBatches.filter(b => b.status !== 'completed' && b.status !== 'bottling');

  const { data: recipes = [] } = useQuery({
    queryKey: ['recipes'],
    queryFn: async () => {
      const all = await base44.entities.Recipe.list('name', 5000);
      // Include spirit recipes and any older records without recipe_type set (pre-dates the field)
      return all.filter(r => !r.recipe_type || r.recipe_type === 'spirit');
    },
  });

  const { data: rawMaterials = [] } = useQuery({
    queryKey: ['rawMaterials'],
    queryFn: () => base44.entities.RawMaterial.list('created_at', 5000),
  });

  const { data: runs = [], isLoading } = useQuery({
    queryKey: ['distillationRuns'],
    queryFn: () => base44.entities.DistillationRun.list('-date', 5000),
  });

  const { data: ethanolMaterials = [] } = useQuery({
    queryKey: ['rawMaterials-ethanol'],
    queryFn: () => base44.entities.RawMaterial.filter({ type: 'ethanol' }),
  });

  // Botanical receiving records — used to resolve FIFO lot codes by date_received
  const { data: botanicalReceivings = [] } = useQuery({
    queryKey: ['receivings-botanical'],
    queryFn: async () => {
      const all = await base44.entities.Receiving.list('-date_received', 5000);
      return all.filter(r => (r.material_type || '').toLowerCase().startsWith('botanical'));
    },
  });

  const { data: allTanks = [] } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => base44.entities.StorageTank.list('name', 5000),
  });

  // Only ethanol-holding tanks (diluted_ethanol, maceration_dilution, or sns purposes, in_use)
  const ethanolTanks = allTanks.filter(t =>
    (t.purpose === 'diluted_ethanol' || t.purpose === 'maceration_dilution' || t.purpose === 'sns') && t.status === 'in_use'
  );



  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const openNew = () => {
    setEditing(null);
    setSelectedRecipe(null);
    setScaledIngredients([]);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const openEdit = (run) => {
    setEditing(run);
    setSelectedRecipe(null);
    setScaledIngredients([]);
    setForm({
      batch_number: run.batch_number || '',
      date: run.date || new Date().toISOString().split('T')[0],
      product_name: run.product_name || '',
      sub_batch_code: run.sub_batch_code || '',
      ethanol_lot_code: run.ethanol_lot_code || '',
      source_tank_allocations: run.source_tank_allocations || [],
      maceration_date: run.maceration_date || '',
      maceration_notes: run.maceration_notes || '',
      input_volume: run.input_volume ?? '',
      input_abv: run.input_abv ?? '',
      atmospheric_pressure: run.atmospheric_pressure ?? '',
      still_temp: run.still_temp ?? '',
      run_start_time: run.run_start_time || '',
      run_end_time: run.run_end_time || '',
      heads_start_time: run.heads_start_time || '',
      heads_end_time: run.heads_end_time || '',
      hearts_end_time: run.hearts_end_time || '',
      tails_end_time: run.tails_end_time || '',
      abv_readings: run.abv_readings || [],
      heads_volume: run.heads_volume ?? '',
      heads_abv: run.heads_abv ?? '',
      hearts_volume: run.hearts_volume ?? '',
      hearts_abv: run.hearts_abv ?? '',
      tails_volume: run.tails_volume ?? '',
      tails_abv: run.tails_abv ?? '',
      dumped_volume: run.dumped_volume ?? '',
      dumped_abv: run.dumped_abv ?? '',
      dumped_notes: run.dumped_notes || '',
      destination_tank_id: run.destination_tank_id || '',
      status: run.status || 'planned',
      notes: run.notes || '',
    });
    setOpen(true);
  };

  const handleRecipeSelect = (recipeId) => {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) { setSelectedRecipe(null); setScaledIngredients([]); return; }
    setSelectedRecipe(recipe);
    setForm(prev => ({
      ...prev,
      product_name: recipe.name,
      input_abv: recipe.base_ethanol_abv ? String(recipe.base_ethanol_abv) : prev.input_abv,
    }));
    if (form.input_volume && recipe.base_ethanol_volume) {
      scaleIngredients(recipe, parseFloat(form.input_volume));
    }
  };

  const scaleIngredients = (recipe, actualVolume) => {
    if (!recipe?.ingredients?.length || !actualVolume || !recipe.base_ethanol_volume) {
      setScaledIngredients([]);
      return;
    }
    const ratio = actualVolume / recipe.base_ethanol_volume;
    setScaledIngredients(recipe.ingredients.map(ing => {
      const needed = parseFloat((ing.quantity * ratio).toFixed(2));
      const ingNameLower = (ing.name || '').toLowerCase();

      // Find the matching RawMaterial record
      const rm = rawMaterials.find(m => (m.name || '').toLowerCase().trim() === ingNameLower)
        || rawMaterials.find(m => {
          const n = (m.name || '').toLowerCase();
          return n.includes(ingNameLower) || ingNameLower.includes(n);
        });

      // Build lot list from RawMaterial.lots array (FIFO — oldest first)
      // This is the single source of truth for botanical stock tracking
      const rmLots = (Array.isArray(rm?.lots) && rm.lots.length > 0)
        ? [...rm.lots]
            .sort((a, b) => (a.date_received || '').localeCompare(b.date_received || ''))
            .filter(l => (l.quantity_remaining || 0) > 0)
            .map(l => ({
              _rmId: rm.id,
              _lotIndex: rm.lots.indexOf(l),
              _fullLots: rm.lots,
              lot_number: l.lot_number,
              batch_number: l.lot_number,
              quantity: l.quantity_remaining || 0,
              date_received: l.date_received,
            }))
        : (rm ? [{ _rmId: rm.id, lot_number: null, batch_number: rm.batch_number || null, quantity: rm.quantity || 0 }] : []);

      const totalStock = rm?.quantity || 0;
      return { ...ing, scaledQuantity: needed, totalStock, lots: rmLots, sufficient: totalStock >= needed };
    }));
  };

  const handleVolumeChange = (value) => {
    set('input_volume', value);
    if (selectedRecipe && value) {
      scaleIngredients(selectedRecipe, parseFloat(value));
    }
  };

  // Auto-compute input_volume and input_abv from per-tank allocations
  const handleAllocationsChange = (allocations) => {
    const volSum = allocations.reduce((s, a) => s + (parseFloat(a.volume) || 0), 0);
    let lalSum = 0, volForAbv = 0;
    for (const a of allocations) {
      const v = parseFloat(a.volume) || 0;
      const abv = parseFloat(a.abv) || 0;
      if (v > 0 && abv > 0) { volForAbv += v; lalSum += v * abv / 100; }
    }
    const weightedAbv = volForAbv > 0 ? (lalSum / volForAbv) * 100 : 0;
    setForm(prev => ({
      ...prev,
      source_tank_allocations: allocations,
      input_volume: volSum > 0 ? String(parseFloat(volSum.toFixed(2))) : prev.input_volume,
      input_abv: volForAbv > 0 ? String(parseFloat(weightedAbv.toFixed(1))) : prev.input_abv,
      // Auto-set ethanol lot code from first allocated tank's batch if not already set
      ethanol_lot_code: prev.ethanol_lot_code || (allocations[0] ? (allTanks.find(t => t.id === allocations[0].tank_id)?.current_batch || '') : ''),
    }));
    if (selectedRecipe && volSum > 0) {
      scaleIngredients(selectedRecipe, volSum);
    }
  };

  const inputLALs = form.input_volume && form.input_abv
    ? parseFloat(form.input_volume) * parseFloat(form.input_abv) / 100 : 0;
  const headsLALs = form.heads_volume && form.heads_abv
    ? parseFloat(form.heads_volume) * parseFloat(form.heads_abv) / 100 : 0;
  const heartsLALs = form.hearts_volume && form.hearts_abv
    ? parseFloat(form.hearts_volume) * parseFloat(form.hearts_abv) / 100 : 0;
  const tailsLALs = form.tails_volume && form.tails_abv
    ? parseFloat(form.tails_volume) * parseFloat(form.tails_abv) / 100 : 0;
  // Auto-calculate total output from cuts
  const calcOutputVolume = (parseFloat(form.heads_volume) || 0) + (parseFloat(form.hearts_volume) || 0) + (parseFloat(form.tails_volume) || 0);
  const calcOutputLALs = headsLALs + heartsLALs + tailsLALs;
  // Weighted average ABV from cuts
  const calcOutputAbv = calcOutputVolume > 0 ? (calcOutputLALs / calcOutputVolume) * 100 : 0;
  const outputLALs = calcOutputLALs;

  // Dumped / discarded — auto LALs = whatever is unaccounted after cuts
  const autoDumpedLALs = inputLALs > 0 ? Math.max(0, inputLALs - calcOutputLALs) : 0;
  const dumpedVolume = parseFloat(form.dumped_volume) || 0;
  const dumped_abv = autoDumpedLALs > 0 && dumpedVolume > 0 ? (autoDumpedLALs / dumpedVolume) * 100 : 0;

  const numericFields = ['input_volume','input_abv','atmospheric_pressure','still_temp',
    'heads_volume','heads_abv','hearts_volume','hearts_abv',
    'tails_volume','tails_abv','dumped_volume'];

  const buildPayload = (data) => {
    const payload = { ...data };
    // source_tank_allocations persisted below
    payload.destination_tank_id = data.destination_tank_id || undefined;
    // maceration_date is a `date` column — an empty string (the default when
    // this optional field is left blank) fails Postgres's cast to date and
    // the insert/update rejects with a 400, so it must become undefined too.
    payload.maceration_date = data.maceration_date || undefined;
    numericFields.forEach(f => { payload[f] = data[f] !== '' ? parseFloat(data[f]) : undefined; });
    payload.input_lals = inputLALs ? parseFloat(inputLALs.toFixed(4)) : undefined;
    payload.heads_lals = headsLALs ? parseFloat(headsLALs.toFixed(4)) : undefined;
    payload.hearts_lals = heartsLALs ? parseFloat(heartsLALs.toFixed(4)) : undefined;
    payload.tails_lals = tailsLALs ? parseFloat(tailsLALs.toFixed(4)) : undefined;
    payload.dumped_lals = autoDumpedLALs > 0 ? parseFloat(autoDumpedLALs.toFixed(4)) : undefined;
    payload.dumped_abv = dumped_abv > 0 ? parseFloat(dumped_abv.toFixed(2)) : undefined;
    payload.output_volume = calcOutputVolume > 0 ? parseFloat(calcOutputVolume.toFixed(3)) : undefined;
    payload.output_abv = calcOutputAbv > 0 ? parseFloat(calcOutputAbv.toFixed(2)) : undefined;
    payload.output_lals = calcOutputLALs > 0 ? parseFloat(calcOutputLALs.toFixed(4)) : undefined;
    // Persist per-tank allocations with numeric volumes
    payload.source_tank_allocations = (data.source_tank_allocations || []).map(a => ({
      tank_id: a.tank_id,
      tank_name: a.tank_name,
      volume: parseFloat(a.volume) || undefined,
      abv: parseFloat(a.abv) || undefined,
    }));
    if (payload.source_tank_allocations.length === 0) payload.source_tank_allocations = undefined;
    // Persist ABV readings with numeric values
    payload.abv_readings = (data.abv_readings || []).map(r => ({
      time: r.time || undefined,
      abv: r.abv !== '' ? parseFloat(r.abv) : undefined,
      temp: r.temp !== '' ? parseFloat(r.temp) : undefined,
      notes: r.notes || undefined,
    }));
    if (payload.abv_readings.length === 0) payload.abv_readings = undefined;
    // Timeline string fields — empty becomes undefined
    ['run_start_time','run_end_time','heads_start_time','heads_end_time','hearts_end_time','tails_end_time'].forEach(f => {
      payload[f] = payload[f] || undefined;
    });
    return payload;
  };

  const creditHeartsToTank = async (tankId, heartsVolume, heartsAbv, heartsLALs, batchNumber, productName, date) => {
    const tank = allTanks.find(t => t.id === tankId);
    if (!tank) return;
    const existingVol = tank.current_volume || 0;
    const existingAbv = tank.current_abv || 0;
    const newVol = parseFloat((existingVol + heartsVolume).toFixed(3));
    const blendedAbv = newVol > 0
      ? parseFloat(((existingVol * existingAbv + heartsVolume * heartsAbv) / newVol).toFixed(2))
      : heartsAbv;
    await base44.entities.StorageTank.update(tank.id, {
      current_volume: newVol,
      current_abv: blendedAbv,
      current_product: productName || tank.current_product,
      current_batch: batchNumber || tank.current_batch,
      status: 'in_use',
    });
    await base44.entities.TankMovement.create({
      date: date || format(new Date(), 'yyyy-MM-dd'),
      action: 'distillation_fill',
      tank_name: tank.name,
      volume_litres: parseFloat(heartsVolume.toFixed(3)),
      abv: parseFloat(heartsAbv.toFixed(2)),
      lals: parseFloat((heartsLALs || 0).toFixed(4)),
      product: productName,
      batch_number: batchNumber,
      notes: `Hearts from distillation run ${batchNumber}`,
    });
  };

  const reverseHeartsFromTank = async (tankId, heartsVolume, heartsAbv) => {
    const tank = allTanks.find(t => t.id === tankId);
    if (!tank) return;
    const existingVol = tank.current_volume || 0;
    const existingAbv = tank.current_abv || 0;
    const newVol = parseFloat(Math.max(0, existingVol - heartsVolume).toFixed(3));
    const newAbv = newVol > 0
      ? parseFloat(Math.max(0, (existingVol * existingAbv - heartsVolume * heartsAbv) / newVol).toFixed(2))
      : 0;
    await base44.entities.StorageTank.update(tank.id, {
      current_volume: newVol,
      current_abv: newAbv,
      status: newVol <= 0 ? 'empty' : tank.status,
    });
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const payload = buildPayload(data);
      const newRun = await base44.entities.DistillationRun.create(payload);

      // Structured per-ingredient lot consumption, collected alongside the
      // existing FIFO depletion below and persisted once at the end (see
      // distillation_run_lot_usage) — same rigor ethanol's lot code already
      // had, extended to every ingredient including ethanol's own
      // multi-lot FIFO split, which the single ethanol_lot_code column
      // never captured.
      const lotUsageRows = [];

      // Create SubBatch record if a master batch and sub-batch code are set
      if (data.batch_number && data.sub_batch_code) {
        const master = masterBatches.find(b => b.batch_code === data.batch_number);
        if (master) {
          await base44.entities.SubBatch.create({
            master_batch_id: master.id,
            master_batch_code: master.batch_code,
            sub_batch_code: data.sub_batch_code,
            date: data.date || undefined,
            input_volume: payload.input_volume || undefined,
            input_abv: payload.input_abv || undefined,
            maceration_date: data.maceration_date || undefined,
            maceration_notes: data.maceration_notes || undefined,
            status: data.status === 'completed' ? 'completed' : data.status === 'in_progress' ? 'distilling' : data.status === 'macerating' ? 'macerating' : 'planned',
            notes: data.notes || undefined,
          });
        }
      }

      // Deduct allocated volume from each source tank (per-tank quantities)
      const allocations = (data.source_tank_allocations || []).filter(a => a.tank_id && parseFloat(a.volume) > 0);
      if (allocations.length > 0 && payload.input_volume && payload.input_abv) {
        for (const alloc of allocations) {
          const tank = allTanks.find(t => t.id === alloc.tank_id);
          if (!tank) continue;
          const deductVol = parseFloat(alloc.volume) || 0;
          const newTankVolume = parseFloat(Math.max(0, (tank.current_volume || 0) - deductVol).toFixed(3));
          await base44.entities.StorageTank.update(alloc.tank_id, {
            current_volume: newTankVolume,
            status: newTankVolume <= 0 ? 'empty' : tank.status,
          });
          await base44.entities.TankMovement.create({
            date: data.date || format(new Date(), 'yyyy-MM-dd'),
            action: 'transfer_out',
            tank_name: tank.name,
            volume_litres: parseFloat(deductVol.toFixed(3)),
            abv: parseFloat(alloc.abv) || tank.current_abv || undefined,
            lals: parseFloat((deductVol * (parseFloat(alloc.abv) || 0) / 100).toFixed(4)),
            product: tank.current_product || data.product_name,
            batch_number: data.batch_number,
            notes: `Ethanol draw for distillation run ${data.sub_batch_code || data.batch_number}`,
          });
        }

        // Deduct ethanol from RawMaterial inventory using FIFO lots
        // We deduct the actual input volume at the actual input ABV (not converted to 96%)
        const lalsUsed = payload.input_lals || (payload.input_volume * (payload.input_abv || 0) / 100);
        const inputVolUsed = payload.input_volume || 0;

        // Find the correct ethanol record by lot code or name match
        const lotCode = (data.ethanol_lot_code || '').toLowerCase();
        const allRM = await base44.entities.RawMaterial.list('name', 5000);
        const ethanolRecord = allRM.find(m => {
          if ((m.type || '').toLowerCase() !== 'ethanol') return false;
          if (!lotCode) return true;
          const mLots = Array.isArray(m.lots) ? m.lots : [];
          if (mLots.some(l => (l.lot_number || '').toLowerCase().includes(lotCode))) return true;
          return (m.name || '').toLowerCase().replace(/\s+/g,'').includes(lotCode.replace(/\s+/g,''));
        }) || allRM.find(m => (m.type || '').toLowerCase() === 'ethanol');

        if (ethanolRecord) {
          const lots = Array.isArray(ethanolRecord.lots) && ethanolRecord.lots.length > 0
            ? [...ethanolRecord.lots].sort((a, b) => (a.date_received || '').localeCompare(b.date_received || ''))
            : null;

          if (lots) {
            // FIFO: deplete oldest lot first
            let remaining = inputVolUsed;
            const updatedLots = lots.map(lot => {
              if (remaining <= 0) return lot;
              const take = Math.min(remaining, lot.quantity_remaining || 0);
              remaining -= take;
              if (take > 0) {
                lotUsageRows.push({
                  raw_material_id: ethanolRecord.id,
                  raw_material_name: ethanolRecord.name,
                  ingredient_role: 'ethanol',
                  lot_number: lot.lot_number || null,
                  quantity_consumed: take,
                  unit: ethanolRecord.unit || 'litres',
                });
              }
              return { ...lot, quantity_remaining: parseFloat(Math.max(0, (lot.quantity_remaining || 0) - take).toFixed(4)) };
            });
            const newQty = Math.max(0, (ethanolRecord.quantity || 0) - inputVolUsed);
            const newLals = Math.max(0, (ethanolRecord.lals || 0) - lalsUsed);
            await base44.entities.RawMaterial.update(ethanolRecord.id, {
              quantity: parseFloat(newQty.toFixed(4)),
              lals: parseFloat(newLals.toFixed(4)),
              lots: updatedLots,
            });
          } else {
            // No lots — just deduct from total
            if (inputVolUsed > 0) {
              lotUsageRows.push({
                raw_material_id: ethanolRecord.id,
                raw_material_name: ethanolRecord.name,
                ingredient_role: 'ethanol',
                lot_number: null,
                quantity_consumed: inputVolUsed,
                unit: ethanolRecord.unit || 'litres',
              });
            }
            await base44.entities.RawMaterial.update(ethanolRecord.id, {
              quantity: parseFloat(Math.max(0, (ethanolRecord.quantity || 0) - inputVolUsed).toFixed(4)),
              lals: parseFloat(Math.max(0, (ethanolRecord.lals || 0) - lalsUsed).toFixed(4)),
            });
          }
        }
      }

      // FIFO stock depletion only on create (when ingredients are scaled)
      // Deplete botanical lots FIFO and capture lot codes for batch traceability
      const usedBotanicalLots = new Set();
      // Group by RawMaterial id so we do one update per ingredient
      const rmUpdates = {};

      for (const ing of scaledIngredients) {
        let remaining = ing.scaledQuantity;
        for (const lot of ing.lots) {
          if (remaining <= 0) break;
          const deduct = Math.min(lot.quantity || 0, remaining);
          if (deduct <= 0) continue;

          if (lot._rmId && lot._fullLots) {
            // Update the lots array on the RawMaterial record
            if (!rmUpdates[lot._rmId]) {
              rmUpdates[lot._rmId] = {
                rm: rawMaterials.find(m => m.id === lot._rmId),
                lotsToDeduct: {}, // lot_number -> amount
              };
            }
            const lotKey = lot.lot_number || '__no_lot__';
            rmUpdates[lot._rmId].lotsToDeduct[lotKey] = (rmUpdates[lot._rmId].lotsToDeduct[lotKey] || 0) + deduct;
          } else if (lot._rmId) {
            // No lots array — just deduct from total
            if (!rmUpdates[lot._rmId]) {
              rmUpdates[lot._rmId] = { rm: rawMaterials.find(m => m.id === lot._rmId), directDeduct: 0 };
            }
            rmUpdates[lot._rmId].directDeduct = (rmUpdates[lot._rmId].directDeduct || 0) + deduct;
          }

          if (lot.lot_number) usedBotanicalLots.add(`${ing.name} (${lot.lot_number})`);
          else usedBotanicalLots.add(ing.name);
          lotUsageRows.push({
            raw_material_id: lot._rmId || null,
            raw_material_name: ing.name,
            ingredient_role: 'botanical',
            lot_number: lot.lot_number || null,
            quantity_consumed: deduct,
            unit: ing.unit || null,
          });
          remaining -= deduct;
        }
      }

      // Apply all RawMaterial updates
      for (const [rmId, update] of Object.entries(rmUpdates)) {
        const rm = update.rm;
        if (!rm) continue;
        if (update.lotsToDeduct && Array.isArray(rm.lots)) {
          // Update lots array
          const updatedLots = rm.lots.map(lot => {
            const lotKey = lot.lot_number || '__no_lot__';
            const deduct = update.lotsToDeduct[lotKey] || 0;
            if (deduct <= 0) return lot;
            return { ...lot, quantity_remaining: parseFloat(Math.max(0, (lot.quantity_remaining || 0) - deduct).toFixed(4)) };
          });
          const totalDeducted = Object.values(update.lotsToDeduct).reduce((s, v) => s + v, 0);
          await base44.entities.RawMaterial.update(rmId, {
            quantity: parseFloat(Math.max(0, (rm.quantity || 0) - totalDeducted).toFixed(4)),
            lots: updatedLots,
          });
        } else if (update.directDeduct) {
          await base44.entities.RawMaterial.update(rmId, {
            quantity: parseFloat(Math.max(0, (rm.quantity || 0) - update.directDeduct).toFixed(4)),
          });
        }
      }

      // Patch the SubBatch with captured botanical lot codes so BatchTracker can display them
      if (usedBotanicalLots.size > 0 && data.batch_number && data.sub_batch_code) {
        const subBatchList = await base44.entities.SubBatch.filter({ sub_batch_code: data.sub_batch_code });
        if (subBatchList.length > 0) {
          await base44.entities.SubBatch.update(subBatchList[0].id, {
            botanical_lots: [...usedBotanicalLots].join(', '),
          });
        }
      }

      // Persist the structured lot-usage rows collected above. Deliberately
      // isolated in its own try/catch: the run and every stock deduction
      // above have already succeeded by this point, and a failure here
      // must never roll back or appear to fail the whole save — it would
      // only leave this run's lot detail incomplete, not corrupt anything.
      if (newRun?.id && lotUsageRows.length > 0) {
        try {
          for (const row of lotUsageRows) {
            await base44.entities.DistillationRunLotUsage.create({ ...row, distillation_run_id: newRun.id });
          }
        } catch (err) {
          console.error('Failed to record structured lot usage for distillation run', newRun.id, err);
          toast.error('Run saved, but lot detail logging failed — check console');
        }
      }

      // Note: hearts are credited to destination tank via CompleteDistillationDialog
      // Do NOT credit here to avoid double-counting
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distillationRuns'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials-ethanol'] });
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['tankMovements'] });
      setOpen(false);
      toast.success('Distillation run recorded');
    },
    onError: (err) => toast.error(err.message || 'Failed to save distillation run'),
  });

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      const payload = buildPayload(data);

      // Note: hearts tank credits are managed by CompleteDistillationDialog only
      // Editing a run does not change tank volumes to avoid double-counting
      await base44.entities.DistillationRun.update(editing.id, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distillationRuns'] });
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['tankMovements'] });
      setOpen(false);
      toast.success('Distillation run updated');
    },
    onError: (err) => toast.error(err.message || 'Failed to update distillation run'),
  });

  const deleteRunMutation = useMutation({
    mutationFn: async (run) => {
      const today = new Date().toISOString().split('T')[0];

      // 1. Reverse destination tank credit (hearts output)
      if (run.destination_tank_id && run.hearts_volume) {
        const tank = await base44.entities.StorageTank.get(run.destination_tank_id);
        const newVol = Math.max(0, (tank.current_volume || 0) - (run.hearts_volume || 0));
        const newAbv = newVol > 0
          ? ((tank.current_volume * tank.current_abv) - (run.hearts_volume * run.hearts_abv)) / newVol
          : tank.current_abv;
        await base44.entities.StorageTank.update(run.destination_tank_id, {
          current_volume: parseFloat(newVol.toFixed(3)),
          current_abv: parseFloat(Math.max(0, newAbv).toFixed(2)),
          status: newVol <= 0 ? 'empty' : tank.status,
        });
        await base44.entities.TankMovement.create({
          date: today,
          action: 'distillation_reversed',
          tank_name: tank.name,
          volume_litres: run.hearts_volume,
          lals: run.hearts_lals || 0,
          batch_number: run.batch_number,
          notes: `Reversal: distillation run deleted (${run.date})`,
        });
      }

      // 2. Restore source tank volumes — use persisted per-tank allocations
      const storedAllocations = Array.isArray(run.source_tank_allocations) ? run.source_tank_allocations : [];
      if (storedAllocations.length > 0) {
        for (const alloc of storedAllocations) {
          if (!alloc.tank_id || !(parseFloat(alloc.volume) > 0)) continue;
          const tank = allTanks.find(t => t.id === alloc.tank_id);
          const restoreVol = parseFloat(alloc.volume);
          const newVol = (tank?.current_volume || 0) + restoreVol;
          await base44.entities.StorageTank.update(alloc.tank_id, {
            current_volume: parseFloat(newVol.toFixed(3)),
            status: 'in_use',
          });
          await base44.entities.TankMovement.create({
            date: today,
            action: 'distillation_reversed',
            tank_name: tank?.name || alloc.tank_name || 'Unknown',
            volume_litres: parseFloat(restoreVol.toFixed(3)),
            lals: parseFloat((restoreVol * (alloc.abv || 0) / 100).toFixed(4)),
            batch_number: run.batch_number,
            notes: `Reversal: allocated ethanol restored to source tank (${run.date})`,
          });
        }
      } else {
        // Legacy runs without stored allocations — restore evenly by matching batch
        const sourceTanks = allTanks.filter(t => t.current_batch === run.batch_number && t.purpose !== 'final_product_storage');
        if (sourceTanks.length > 0 && run.input_volume) {
          const restorePerTank = run.input_volume / sourceTanks.length;
          for (const tank of sourceTanks) {
            const newVol = (tank.current_volume || 0) + restorePerTank;
            await base44.entities.StorageTank.update(tank.id, {
              current_volume: parseFloat(newVol.toFixed(3)),
              status: 'in_use',
            });
            await base44.entities.TankMovement.create({
              date: today,
              action: 'distillation_reversed',
              tank_name: tank.name,
              volume_litres: parseFloat(restorePerTank.toFixed(3)),
              lals: run.input_lals || 0,
              batch_number: run.batch_number,
              notes: `Reversal: input volume restored to source tank (${run.date})`,
            });
          }
        }
      }

      // 3. Restore ethanol raw material quantities
      if (run.ethanol_lot_code && run.input_lals) {
        const volAt96 = run.input_lals / 0.96;
        const matchingEthanol = ethanolMaterials
          .filter(m => m.batch_number === run.ethanol_lot_code)
          .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        if (matchingEthanol.length > 0) {
          const lot = matchingEthanol[0];
          await base44.entities.RawMaterial.update(lot.id, {
            quantity: parseFloat(((lot.quantity || 0) + volAt96).toFixed(3)),
            lals: parseFloat(((lot.lals || 0) + run.input_lals).toFixed(4)),
          });
        }
      }

      // 3b. Restore botanical lots (best-effort using recipe scaling)
      if (run.product_name && run.input_volume) {
        const recipe = recipes.find(r => r.name === run.product_name);
        if (recipe?.ingredients?.length && recipe.base_ethanol_volume) {
          const ratio = run.input_volume / recipe.base_ethanol_volume;
          for (const ing of recipe.ingredients) {
            const restoreQty = ing.quantity * ratio;
            const ingNameLower = (ing.name || '').toLowerCase();
            const matching = rawMaterials.filter(m => (m.name || '').toLowerCase() === ingNameLower);
            if (matching.length > 0) {
              const lot = matching.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
              await base44.entities.RawMaterial.update(lot.id, {
                quantity: parseFloat(((lot.quantity || 0) + restoreQty).toFixed(4)),
              });
            }
          }
        }
      }

      // 4. Delete linked WastageRecord
      const allWastage = await base44.entities.WastageRecord.list('-date', 5000);
      const linkedWastage = allWastage.filter(w => w.source === 'distillation' && w.run_id === run.id);
      for (const w of linkedWastage) {
        await base44.entities.WastageRecord.delete(w.id);
      }

      // 5. Delete linked SubBatch
      if (run.sub_batch_code) {
        const subBatches = await base44.entities.SubBatch.filter({ sub_batch_code: run.sub_batch_code });
        const linkedSub = subBatches.find(sb => sb.master_batch_code === run.batch_number);
        if (linkedSub) {
          await base44.entities.SubBatch.delete(linkedSub.id);
        }
      }

      // 6. Delete the DistillationRun record
      await base44.entities.DistillationRun.delete(run.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distillationRuns'] });
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials'] });
      queryClient.invalidateQueries({ queryKey: ['rawMaterials-ethanol'] });
      queryClient.invalidateQueries({ queryKey: ['wastage'] });
      queryClient.invalidateQueries({ queryKey: ['subBatches'] });
      queryClient.invalidateQueries({ queryKey: ['tankMovements'] });
      setDeletingRun(null);
      toast.success('Distillation run deleted and inventory reversed');
    },
    onError: () => {
      toast.error('Failed to delete run — some changes may have been partially applied. Check tank volumes manually.');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.batch_number) {
      setBatchError(true);
      toast.error('Please select a Batch Number before saving');
      return;
    }
    setBatchError(false);
    if (editing) {
      updateMutation.mutate(form);
    } else {
      createMutation.mutate(form);
    }
  };

  const filteredRuns = runs.filter(r => {
    const s = search.toLowerCase();
    const matchSearch = !s || r.batch_number?.toLowerCase().includes(s) || r.product_name?.toLowerCase().includes(s);
    const matchStatus = filterStatus === 'all' || r.status === filterStatus;
    return matchSearch && matchStatus;
  });
  const pagedRuns = filteredRuns.slice((page - 1) * pageSize, page * pageSize);

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="pb-20 md:pb-0">
      <PageHeader title="Distillation" subtitle="Manage distillation runs and batches" />

      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="runs">Distillation Runs</TabsTrigger>
          <TabsTrigger value="batches">Batch Management</TabsTrigger>
        </TabsList>

        <TabsContent value="batches">
          <BatchManagement />
        </TabsContent>

        <TabsContent value="runs" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />New Run</Button>
          </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editing ? 'Edit Distillation Run' : 'New Distillation Run'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">

            {/* Recipe loader — new runs only */}
            {!editing && recipes.length > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
                <Label className="flex items-center gap-1.5 text-primary">
                  <FlaskConical className="w-3.5 h-3.5" />Load from Recipe
                </Label>
                <Select value={selectedRecipe?.id || ''} onValueChange={handleRecipeSelect}>
                  <SelectTrigger><SelectValue placeholder="Select a recipe to pre-fill…" /></SelectTrigger>
                  <SelectContent>
                    {recipes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Core details */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Batch Number <span className="text-destructive">*</span></Label>
                {editing ? (
                  // When editing, show plain text (batch number shouldn't change)
                  <div className="h-9 flex items-center px-3 rounded-md border border-input bg-muted text-sm font-medium">
                    {form.batch_number}
                  </div>
                ) : (
                  <div className="flex gap-1.5">
                    <Select
                      value={form.batch_number}
                      onValueChange={v => {
                        const batch = masterBatches.find(b => b.batch_code === v);
                        set('batch_number', v);
                        setBatchError(false);
                        if (batch?.product_name && !form.product_name) set('product_name', batch.product_name);
                        // Auto-suggest sub-batch code if not already set
                        if (!form.sub_batch_code) {
                          const existingRuns = runs.filter(r => r.batch_number === v);
                          set('sub_batch_code', `${v}-R${existingRuns.length + 1}`);
                        }
                      }}
                    >
                      <SelectTrigger className={`flex-1 ${batchError ? 'border-destructive ring-1 ring-destructive' : ''}`}>
                        <SelectValue placeholder="Select batch…" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeBatches.length === 0 && (
                          <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                            No active batches — create one first
                          </div>
                        )}
                        {activeBatches.map(b => (
                          <SelectItem key={b.id} value={b.batch_code}>
                            <span className="font-mono">{b.batch_code}</span>
                            {b.product_name && <span className="text-muted-foreground ml-2 text-xs">— {b.product_name}</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="flex-shrink-0"
                      title="Create new batch"
                      onClick={() => setCreateBatchOpen(true)}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
              </div>
              <div className="col-span-2">
                <Label>Product Name</Label>
                {selectedRecipe ? (
                  <div className="h-9 flex items-center px-3 rounded-md border border-primary/30 bg-primary/5 text-sm font-medium text-primary">
                    {form.product_name}
                    <span className="ml-auto text-xs text-muted-foreground font-normal">from recipe</span>
                  </div>
                ) : (
                  <Input value={form.product_name} onChange={e => set('product_name', e.target.value)} placeholder="Select a recipe above, or enter manually" required />
                )}
              </div>
            </div>

            {/* Sub-Batch / Run Part */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sub-Batch / Run Part</p>
              <div>
                <Label>Sub-Batch Code</Label>
                <Input
                  value={form.sub_batch_code}
                  onChange={e => set('sub_batch_code', e.target.value)}
                  placeholder={form.batch_number ? `${form.batch_number}-R1` : 'e.g. GIN-001-R1'}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Identifies which run/part of the master batch this distillation is (e.g. R1, R2). This will create a sub-batch record automatically.
                </p>
              </div>
            </div>

            {/* Maceration */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Maceration</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Maceration Start Date</Label>
                  <Input type="date" value={form.maceration_date} onChange={e => set('maceration_date', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label>Maceration Notes</Label>
                  <Textarea rows={2} value={form.maceration_notes} onChange={e => set('maceration_notes', e.target.value)} placeholder="Temperature, duration, observations…" />
                </div>
              </div>
            </div>

            {/* Input / Still conditions */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Input &amp; Still Conditions</p>

              {/* Source tanks selector (per-tank volume allocation) */}
              <div>
                <Label>Source Tanks — allocate volume per tank</Label>
                <TankAllocationSelector
                  ethanolTanks={ethanolTanks}
                  allocations={form.source_tank_allocations || []}
                  onChange={handleAllocationsChange}
                  disabled={!!editing}
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Volume (L)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.input_volume}
                    onChange={e => handleVolumeChange(e.target.value)}
                    readOnly={!!(form.source_tank_allocations || []).some(a => parseFloat(a.volume) > 0)}
                    className="read-only:bg-muted read-only:cursor-not-allowed"
                  />
                </div>
                <div>
                  <Label>ABV %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={form.input_abv}
                    onChange={e => set('input_abv', e.target.value)}
                    readOnly={!!(form.source_tank_allocations || []).some(a => parseFloat(a.volume) > 0)}
                    className="read-only:bg-muted read-only:cursor-not-allowed"
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1">LALs <Calculator className="w-3 h-3 text-primary" /></Label>
                  <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold ${inputLALs > 0 ? 'bg-primary/5 border-primary/30 text-primary' : 'bg-muted border-input text-muted-foreground'}`}>
                    {inputLALs > 0 ? inputLALs.toFixed(3) : '—'}
                  </div>
                </div>
                <div>
                  <Label>Atm. Pressure (hPa)</Label>
                  <Input type="number" step="0.1" value={form.atmospheric_pressure} onChange={e => set('atmospheric_pressure', e.target.value)} placeholder="e.g. 1013" />
                </div>
                <div>
                  <Label>Still Temp (°C)</Label>
                  <Input type="number" step="0.1" value={form.still_temp} onChange={e => set('still_temp', e.target.value)} placeholder="e.g. 78.5" />
                </div>
              </div>
            </div>

            {/* Run Timeline & ABV Log */}
            <RunTimeline form={form} set={set} />

            {/* Scaled ingredients with FIFO stock check (new runs only) */}
            {scaledIngredients.length > 0 && (
              <div className="rounded-lg border border-border p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 text-primary" />
                  Scaled Botanicals for {form.input_volume}L
                </p>
                <div className="space-y-1.5">
                  {scaledIngredients.map((ing, i) => (
                    <div key={i} className="py-1 border-b border-border/50 last:border-0">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-1.5">
                          {ing.lots.length > 0
                            ? ing.sufficient
                              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                              : <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                            : <AlertTriangle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                          }
                          <span>{ing.name}</span>
                        </div>
                        <span className="font-semibold text-primary">{ing.scaledQuantity} {ing.unit}</span>
                      </div>
                      {ing.lots.length > 0 ? (
                        <div className="ml-5 mt-0.5 space-y-0.5">
                          <p className={`text-xs ${ing.sufficient ? 'text-muted-foreground' : 'text-amber-600'}`}>
                            {ing.totalStock.toFixed(2)} {ing.unit} in stock across {ing.lots.length} lot{ing.lots.length > 1 ? 's' : ''}
                            {!ing.sufficient && ` — short by ${(ing.scaledQuantity - ing.totalStock).toFixed(2)} ${ing.unit}`}
                          </p>
                          {ing.lots.filter(l => l.batch_number).map(l => (
                            <span key={l.id} className="inline-flex items-center gap-1 text-xs font-mono bg-green-50 border border-green-200 text-green-700 px-1.5 py-0.5 rounded mr-1">
                              {l.batch_number} ({l.quantity?.toFixed(2)} {ing.unit})
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs mt-0.5 ml-5 text-destructive">Not found in stock</p>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  Scaled from {selectedRecipe.base_ethanol_volume}L base recipe
                  {' '}(×{(parseFloat(form.input_volume) / selectedRecipe.base_ethanol_volume).toFixed(3)}) · Stock depleted FIFO on save
                </p>
              </div>
            )}

            {/* Cuts */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cuts</p>

              {/* Heads */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Heads</p>
                <div className="grid grid-cols-3 gap-x-3">
                  <div>
                    <Label className="text-xs">Volume (L)</Label>
                    <Input type="number" step="0.01" value={form.heads_volume} onChange={e => set('heads_volume', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">ABV %</Label>
                    <Input type="number" step="0.1" value={form.heads_abv} onChange={e => set('heads_abv', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1">LALs <Calculator className="w-3 h-3 text-primary" /></Label>
                    <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold ${headsLALs > 0 ? 'bg-primary/5 border-primary/30 text-primary' : 'bg-muted border-input text-muted-foreground'}`}>
                      {headsLALs > 0 ? headsLALs.toFixed(3) : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Hearts */}
              <div className="space-y-1.5 pt-1 border-t border-border/50">
                <p className="text-xs font-medium text-emerald-600">Hearts</p>
                <div className="grid grid-cols-3 gap-x-3">
                  <div>
                    <Label className="text-xs">Volume (L)</Label>
                    <Input type="number" step="0.01" value={form.hearts_volume} onChange={e => set('hearts_volume', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">ABV %</Label>
                    <Input type="number" step="0.1" value={form.hearts_abv} onChange={e => set('hearts_abv', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1">LALs <Calculator className="w-3 h-3 text-emerald-600" /></Label>
                    <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold ${heartsLALs > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-muted border-input text-muted-foreground'}`}>
                      {heartsLALs > 0 ? heartsLALs.toFixed(3) : '—'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tails */}
              <div className="space-y-1.5 pt-1 border-t border-border/50">
                <p className="text-xs font-medium text-muted-foreground">Tails</p>
                <div className="grid grid-cols-3 gap-x-3">
                  <div>
                    <Label className="text-xs">Volume (L)</Label>
                    <Input type="number" step="0.01" value={form.tails_volume} onChange={e => set('tails_volume', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs">ABV %</Label>
                    <Input type="number" step="0.1" value={form.tails_abv} onChange={e => set('tails_abv', e.target.value)} />
                  </div>
                  <div>
                    <Label className="text-xs flex items-center gap-1">LALs <Calculator className="w-3 h-3 text-primary" /></Label>
                    <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold ${tailsLALs > 0 ? 'bg-primary/5 border-primary/30 text-primary' : 'bg-muted border-input text-muted-foreground'}`}>
                      {tailsLALs > 0 ? tailsLALs.toFixed(3) : '—'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Total Output — auto-calculated from cuts */}
            {calcOutputVolume > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5" />Total Output Collected (calculated from cuts)
                </p>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Volume (L)</p>
                    <p className="font-semibold">{calcOutputVolume.toFixed(3)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Avg ABV %</p>
                    <p className="font-semibold">{calcOutputAbv.toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total LALs</p>
                    <p className="font-semibold text-primary">{calcOutputLALs.toFixed(3)}</p>
                  </div>
                </div>
                {inputLALs > 0 && (
                  <p className="text-xs text-muted-foreground pt-1 border-t border-primary/10">
                    LAL yield:{' '}
                    <span className="font-semibold text-primary">
                      {((calcOutputLALs / inputLALs) * 100).toFixed(1)}%
                    </span>
                    {' '}({calcOutputLALs.toFixed(3)} of {inputLALs.toFixed(3)} input LALs)
                  </p>
                )}
              </div>
            )}

            {/* Dumped / Discarded */}
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dumped / Discarded</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Volume (L)</Label>
                  <Input type="number" step="0.01" value={form.dumped_volume} onChange={e => set('dumped_volume', e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1">ABV % <Calculator className="w-3 h-3 text-primary" /></Label>
                  <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold ${dumped_abv > 0 ? 'bg-primary/5 border-primary/30 text-primary' : 'bg-muted border-input text-muted-foreground'}`}>
                    {dumped_abv > 0 ? dumped_abv.toFixed(2) + '%' : '—'}
                  </div>
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1">LALs <Calculator className="w-3 h-3 text-primary" /></Label>
                  <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold ${autoDumpedLALs > 0 ? 'bg-primary/5 border-primary/30 text-primary' : 'bg-muted border-input text-muted-foreground'}`}>
                    {autoDumpedLALs > 0 ? autoDumpedLALs.toFixed(3) : '—'}
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Dump Notes</Label>
                <Textarea rows={2} value={form.dumped_notes} onChange={e => set('dumped_notes', e.target.value)} placeholder="What was discarded and why…" />
              </div>
            </div>

            {/* Mass Balance Summary */}
            {inputLALs > 0 && calcOutputLALs > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Mass Balance</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Input LALs</span><span className="font-semibold">{inputLALs.toFixed(3)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Heads LALs</span><span>{headsLALs.toFixed(3)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Hearts LALs</span><span className="text-emerald-700 font-semibold">{heartsLALs.toFixed(3)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tails LALs</span><span>{tailsLALs.toFixed(3)}</span></div>
                </div>
                <div className="border-t border-amber-200 pt-2 flex justify-between text-sm">
                  <span className="text-amber-700 font-medium">Dumped / Discarded LALs</span>
                  <span className={`font-semibold ${autoDumpedLALs < 0.001 ? 'text-emerald-600' : 'text-amber-700'}`}>
                    {autoDumpedLALs.toFixed(3)}
                  </span>
                </div>
              </div>
            )}

            <div>
              <Label>Destination Tank (Hearts)</Label>
              <Select value={form.destination_tank_id} onValueChange={v => set('destination_tank_id', v)}>
                <SelectTrigger><SelectValue placeholder="Select tank for hearts output (optional)…" /></SelectTrigger>
                <SelectContent>
                  {allTanks.filter(t => t.status !== 'cleaning').map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      Tank {t.name}
                      {t.current_volume > 0 ? ` — ${t.current_volume.toFixed(1)}L` : ' — empty'}
                      {t.current_product ? ` (${t.current_product})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="macerating">Macerating</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>

            <div className="flex gap-3 pt-1">
              <Button type="submit" variant="outline" className="flex-1" disabled={isPending}>
                {isPending ? 'Saving…' : 'Save Progress'}
              </Button>
              {editing && editing.status !== 'completed' && (
                <Button
                  type="button"
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={isPending}
                  onClick={(e) => {
                    e.preventDefault();
                    updateMutation.mutate(form, {
                      onSuccess: () => {
                        setRunToComplete({ ...editing, ...buildPayload(form) });
                        setCompleteDialogOpen(true);
                      }
                    });
                  }}
                >
                  Complete Still Run
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>



      <Card className="overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-2 p-4 border-b border-border">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search batch, product…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-8 text-sm" />
          </div>
          <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="planned">Planned</SelectItem>
              <SelectItem value="macerating">Macerating</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Batch #</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Maceration</TableHead>
                <TableHead>In Vol (L)</TableHead>
                <TableHead>In ABV</TableHead>
                <TableHead>Hearts (L)</TableHead>
                <TableHead>Out LALs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : runs.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No distillation runs yet</TableCell></TableRow>
              ) : pagedRuns.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{r.date ? format(new Date(r.date), 'MMM d, yyyy') : '—'}</TableCell>
                  <TableCell className="font-medium text-sm">{r.batch_number}</TableCell>
                  <TableCell className="text-sm">{r.product_name}</TableCell>
                  <TableCell className="text-sm">{r.maceration_date ? format(new Date(r.maceration_date), 'MMM d') : '—'}</TableCell>
                  <TableCell className="text-sm">{r.input_volume ?? '—'}</TableCell>
                  <TableCell className="text-sm">{r.input_abv ? `${r.input_abv}%` : '—'}</TableCell>
                  <TableCell className="text-sm">{r.hearts_volume ?? '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{r.output_lals?.toFixed(3) ?? '—'}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(r)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeletingRun(r)}
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
        <MobileCardGrid>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Loading…</p>
          ) : runs.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No distillation runs yet</p>
          ) : pagedRuns.map(r => (
            <MobileCard
              key={r.id}
              title={r.product_name}
              subtitle={`${r.batch_number} • ${r.date ? format(new Date(r.date), 'MMM d, yyyy') : '—'}`}
              badge={<StatusBadge status={r.status} />}
              accent={<span className="text-sm font-semibold">{r.output_lals?.toFixed(2) ?? '—'} LALs</span>}
              actions={
                <>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                  <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-destructive" onClick={() => setDeletingRun(r)}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
                </>
              }
            >
              <MobileDetailRow label="Batch" value={r.batch_number} />
              {r.sub_batch_code && <MobileDetailRow label="Sub-batch" value={r.sub_batch_code} />}
              <MobileDetailRow label="Input" value={r.input_volume ? `${r.input_volume}L @ ${r.input_abv}%` : '—'} />
              <MobileDetailRow label="Hearts" value={r.hearts_volume ? `${r.hearts_volume}L` : '—'} highlight />
              <MobileDetailRow label="Output LALs" value={r.output_lals?.toFixed(3) ?? '—'} highlight />
              {r.maceration_date && <MobileDetailRow label="Maceration" value={format(new Date(r.maceration_date), 'MMM d, yyyy')} />}
            </MobileCard>
          ))}
        </MobileCardGrid>
        <Pagination total={filteredRuns.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      </Card>

      <CompleteDistillationDialog
        run={runToComplete}
        open={completeDialogOpen}
        onOpenChange={setCompleteDialogOpen}
        onCompleted={() => setOpen(false)}
      />

      <CreateBatchDialog
        open={createBatchOpen}
        onOpenChange={setCreateBatchOpen}
        onCreated={(batch) => {
          set('batch_number', batch.batch_code);
          if (batch.product_name && !form.product_name) set('product_name', batch.product_name);
        }}
      />

      <AlertDialog open={!!deletingRun} onOpenChange={v => !v && setDeletingRun(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Distillation Run?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse all tank changes, raw material deductions, and wastage records from this run. Are you sure?
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

        </TabsContent>
      </Tabs>
    </div>
  );
}