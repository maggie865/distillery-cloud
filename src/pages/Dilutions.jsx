import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calculator, FlaskConical, Droplets, Pencil, Search, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import MobileCard, { MobileCardGrid, MobileDetailRow } from '@/components/shared/MobileCard';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import Pagination from '@/components/ui/Pagination';

const PAGE_SIZE = 100;


const BLANK_ETHANOL = {
  date: new Date().toISOString().split('T')[0],
  source_id: '',
  input_ethanol_volume: '',
  input_abv: '',
  water_added: '',
  tank_id: '',
  status: 'completed',
  notes: '',
};

const BLANK_HEARTS = {
  batch_number: '',
  date: new Date().toISOString().split('T')[0],
  source_tank_id: '',
  input_ethanol_volume: '',
  input_abv: '',
  water_added: '',
  output_volume: '',
  target_abv: '',
  transfer_tank_id: '',
  status: 'completed',
  notes: '',
};



export default function Dilutions() {
  const [openType, setOpenType] = useState(null); // 'ethanol' | 'heads'
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'ethanol' | 'hearts'
  const [ethanolForm, setEthanolForm] = useState(BLANK_ETHANOL);
  const [heartsForm, setHeartsForm] = useState(BLANK_HEARTS);
  const [editingDilution, setEditingDilution] = useState(null);
  const [deletingDilution, setDeletingDilution] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const queryClient = useQueryClient();

  const setE = (f, v) => setEthanolForm(p => ({ ...p, [f]: v }));
  const setH = (f, v) => setHeartsForm(p => ({ ...p, [f]: v }));

  const { data: allDilutions = [], isLoading } = useQuery({
    queryKey: ['dilutions'],
    queryFn: () => db.Dilution.list('-date', 5000),
  });

  const { data: sheetData } = useQuery({
    queryKey: ['dilutions-sheet'],
    queryFn: async () => {
      return { dilutions: [] }; // Sheet sync removed — data in Supabase
      const res = { data: { dilutions: [] } };
      return res.data?.dilutions || [];
    },
    staleTime: 60000,
  });

  // Merge: sheet records first (oldest history), then entity records on top
  const entityIds = new Set(allDilutions.map(d => d.id));
  const sheetDilutions = (Array.isArray(sheetData) ? sheetData : sheetData?.dilutions || []).filter(d => !d.id || !entityIds.has(d.id));
  const dilutions = [...allDilutions, ...sheetDilutions].sort((a, b) => {
    const da = new Date(a.date || 0), db = new Date(b.date || 0);
    return db - da;
  });

  const filteredDilutions = dilutions.filter(d => {
    const isHearts = d.notes?.includes('[Heads Dilution]') || parseFloat(d.input_abv) === 79;
    const s = search.toLowerCase();
    const matchSearch = !s || d.batch_number?.toLowerCase().includes(s);
    const matchType = filterType === 'all' || (filterType === 'hearts' && isHearts) || (filterType === 'ethanol' && !isHearts);
    return matchSearch && matchType;
  });
  const pagedDilutions = filteredDilutions.slice((page - 1) * pageSize, page * pageSize);

  const { data: receivings = [] } = useQuery({
    queryKey: ['receivings-ethanol'],
    queryFn: async () => {
      const all = await db.Receiving.list('-date_received', 5000);
      return all.filter(r => (r.material_type || '').toLowerCase() === 'ethanol');
    },
  });

  const { data: tanks = [] } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => db.StorageTank.list('name', 5000),
  });

  const ethanolDestTanks = tanks.filter(t => t.purpose === 'diluted_ethanol');
  const heartsSrcTanks = tanks.filter(t => t.purpose === 'maceration_dilution' || t.purpose === 'sns');
  const productTanks = tanks.filter(t => t.purpose === 'final_product_storage');

  // --- Ethanol Dilution calcs ---
  const eInputLALs = ethanolForm.input_ethanol_volume && ethanolForm.input_abv
    ? parseFloat(ethanolForm.input_ethanol_volume) * parseFloat(ethanolForm.input_abv) / 100 : 0;
  const eOutputVol = (parseFloat(ethanolForm.input_ethanol_volume) || 0) + (parseFloat(ethanolForm.water_added) || 0);
  const eOutputABV = eOutputVol > 0 ? (eInputLALs / eOutputVol) * 100 : 0;
  const eSelectedTank = tanks.find(t => t.id === ethanolForm.tank_id);

  // --- Hearts Dilution calcs (tri-directional) ---
  const hInputVol = parseFloat(heartsForm.input_ethanol_volume) || 0;
  const hInputAbv = parseFloat(heartsForm.input_abv) || 0;
  const hInputLALs = hInputVol && hInputAbv ? hInputVol * hInputAbv / 100 : 0;

  const hWaterRaw = parseFloat(heartsForm.water_added);
  const hOutputVolRaw = parseFloat(heartsForm.output_volume);
  const hTargetAbvRaw = parseFloat(heartsForm.target_abv);

  let hWater = 0, hOutputVol = 0, hOutputABV = 0;

  if (!isNaN(hWaterRaw) && heartsForm.water_added !== '') {
    hWater = hWaterRaw;
    hOutputVol = hInputVol + hWater;
    hOutputABV = hOutputVol > 0 ? (hInputLALs / hOutputVol) * 100 : 0;
  } else if (!isNaN(hOutputVolRaw) && heartsForm.output_volume !== '') {
    hOutputVol = hOutputVolRaw;
    hWater = Math.max(0, hOutputVol - hInputVol);
    hOutputABV = hOutputVol > 0 ? (hInputLALs / hOutputVol) * 100 : 0;
  } else if (!isNaN(hTargetAbvRaw) && heartsForm.target_abv !== '' && hTargetAbvRaw > 0) {
    hOutputABV = hTargetAbvRaw;
    hOutputVol = hInputLALs > 0 ? (hInputLALs / hTargetAbvRaw) * 100 : 0;
    hWater = Math.max(0, hOutputVol - hInputVol);
  }

  const hSourceTank = tanks.find(t => t.id === heartsForm.source_tank_id);

  const handleHeartsSourceChange = (id) => {
    setH('source_tank_id', id);
    const tank = tanks.find(t => t.id === id);
    if (tank) {
      setH('input_abv', tank.current_abv || '');
      setH('input_ethanol_volume', tank.current_volume || '');
      // Auto-populate batch name from tank's current batch
      if (tank.current_batch) {
        setH('batch_number', tank.current_batch);
      }
    }
  };

  const handleEthanolSourceChange = (id) => {
    setE('source_id', id);
    const rec = receivings.find(r => r.id === id);
    if (rec) {
      setE('input_abv', rec.abv_percent || '');
      setE('input_ethanol_volume', rec.quantity || '');
    }
  };

  // --- Mutations ---
  const ethanolMutation = useMutation({
    mutationFn: async (data) => {
      const sourceRec = receivings.find(r => r.id === data.source_id);
      const lotCode = sourceRec?.batch_number || '';
      const materialName = sourceRec?.material_name || 'Ethanol';

      const created = await db.Dilution.create({
        batch_number: lotCode || 'Ethanol Dilution',
        date: data.date,
        input_ethanol_volume: parseFloat(data.input_ethanol_volume),
        input_abv: parseFloat(data.input_abv),
        input_lals: eInputLALs,
        water_added: parseFloat(data.water_added) || 0,
        output_volume: eOutputVol,
        output_abv: parseFloat(eOutputABV.toFixed(2)),
        output_lals: parseFloat(eInputLALs.toFixed(4)),
        status: data.status,
        notes: `[Ethanol Dilution] Lot code: ${lotCode}. Material: ${materialName}. ${data.notes}`,
      });

      if (data.tank_id && eSelectedTank) {
        const newVol = Math.min((eSelectedTank.current_volume || 0) + eOutputVol, eSelectedTank.capacity_litres);
        await db.TankMovement.create({
          date: data.date,
          action: 'fill',
          tank_name: eSelectedTank.name,
          volume_litres: eOutputVol,
          abv: parseFloat(eOutputABV.toFixed(2)),
          lals: parseFloat(eInputLALs.toFixed(4)),
          product: materialName,
          batch_number: lotCode,
          ethanol_lot: lotCode,
          notes: `Ethanol dilution to proofing strength — lot code: ${lotCode}`,
        });
        await db.StorageTank.update(data.tank_id, {
          current_volume: newVol,
          current_abv: parseFloat(eOutputABV.toFixed(2)),
          current_product: materialName,
          current_batch: lotCode,
          status: 'in_use',
        });
        queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
        queryClient.invalidateQueries({ queryKey: ['tankMovements'] });
      }
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['dilutions'] });
      queryClient.invalidateQueries({ queryKey: ['dilutions-sheet'] });
      // Append to sheet
      setOpenType(null);
      setEthanolForm(BLANK_ETHANOL);
      toast.success('Ethanol dilution recorded');
    },
    onError: (err) => toast.error(err.message || 'Failed to record ethanol dilution'),
  });

  const heartsMutation = useMutation({
    mutationFn: async ({ data, action }) => {
      const isTransfer = action === 'transfer';
      const destTank = isTransfer ? tanks.find(t => t.id === data.transfer_tank_id) : null;
      const finalStatus = isTransfer ? 'completed' : 'in_progress';

      const created = await db.Dilution.create({
        batch_number: data.batch_number,
        date: data.date,
        input_ethanol_volume: parseFloat(data.input_ethanol_volume),
        input_abv: parseFloat(data.input_abv),
        input_lals: hInputLALs,
        water_added: parseFloat(hWater.toFixed(3)),
        output_volume: parseFloat(hOutputVol.toFixed(3)),
        output_abv: parseFloat(hOutputABV.toFixed(2)),
        output_lals: parseFloat(hInputLALs.toFixed(4)),
        status: finalStatus,
        notes: `[Heads Dilution] Source tank: ${hSourceTank?.name || ''}${isTransfer ? `. Transferred to Tank ${destTank?.name}` : ' (saved in-place)'}. ${data.notes}`,
      });

      if (hSourceTank && hWater > 0) {
        await db.TankMovement.create({
          date: data.date,
          action: 'fill',
          tank_name: hSourceTank.name,
          volume_litres: parseFloat(hWater.toFixed(3)),
          abv: 0,
          lals: 0,
          product: hSourceTank.current_product || 'Hearts',
          batch_number: data.batch_number,
          notes: `Water addition for hearts dilution — ${hWater.toFixed(3)}L water added`,
        });
      }

      if (isTransfer && destTank && hOutputVol > 0) {
        await db.TankMovement.create({
          date: data.date,
          action: 'transfer_out',
          tank_name: hSourceTank.name,
          counterpart_tank: destTank.name,
          volume_litres: parseFloat(hOutputVol.toFixed(3)),
          abv: parseFloat(hOutputABV.toFixed(2)),
          lals: parseFloat(hInputLALs.toFixed(4)),
          product: data.batch_number || hSourceTank.current_product || 'Diluted Gin',
          batch_number: data.batch_number,
          notes: `Transfer to Tank ${destTank.name} after hearts dilution`,
        });
        const newDestVol = Math.min((destTank.current_volume || 0) + hOutputVol, destTank.capacity_litres);
        await db.TankMovement.create({
          date: data.date,
          action: 'transfer_in',
          tank_name: destTank.name,
          counterpart_tank: hSourceTank.name,
          volume_litres: parseFloat(hOutputVol.toFixed(3)),
          abv: parseFloat(hOutputABV.toFixed(2)),
          lals: parseFloat(hInputLALs.toFixed(4)),
          product: data.batch_number || 'Diluted Gin',
          batch_number: data.batch_number,
          notes: `Received from Tank ${hSourceTank.name} after hearts dilution`,
        });
        await Promise.all([
          db.StorageTank.update(data.source_tank_id, {
            current_volume: 0,
            current_abv: 0,
            current_product: '',
            current_batch: '',
            status: 'empty',
          }),
          db.StorageTank.update(data.transfer_tank_id, {
            current_volume: newDestVol,
            current_abv: parseFloat(hOutputABV.toFixed(2)),
            current_product: data.batch_number || 'Diluted Gin',
            current_batch: data.batch_number,
            status: 'in_use',
          }),
        ]);
      } else if (!isTransfer && hSourceTank && hOutputVol > 0) {
        const newVol = Math.min(hOutputVol, hSourceTank.capacity_litres);
        await db.StorageTank.update(data.source_tank_id, {
          current_volume: newVol,
          current_abv: parseFloat(hOutputABV.toFixed(2)),
          status: 'in_use',
        });
      }

      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['tankMovements'] });
    },
    onSuccess: (created, { action }) => {
      queryClient.invalidateQueries({ queryKey: ['dilutions'] });
      queryClient.invalidateQueries({ queryKey: ['dilutions-sheet'] });
      // Append to sheet
      setOpenType(null);
      setHeartsForm(BLANK_HEARTS);
      toast.success(action === 'transfer' ? 'Hearts dilution complete — product transferred' : 'Progress saved — product remains in source tank');
    },
    onError: (err) => toast.error(err.message || 'Failed to save hearts dilution'),
  });

  const editMutation = useMutation({
    mutationFn: async (data) => {
      // input_ethanol_volume/input_abv are NOT NULL numeric columns with no
      // default and these edit inputs have no `required` attribute, so they
      // can be cleared to '' — parseFloat('') is NaN, which JSON.stringify
      // turns into an explicit null in the request body and 400s the
      // update. Fall back to undefined (leave column unchanged) instead.
      await db.Dilution.update(data.id, {
        batch_number: data.batch_number,
        date: data.date,
        input_ethanol_volume: data.input_ethanol_volume !== '' ? parseFloat(data.input_ethanol_volume) : undefined,
        input_abv: data.input_abv !== '' ? parseFloat(data.input_abv) : undefined,
        input_lals: parseFloat(data.input_ethanol_volume) * parseFloat(data.input_abv) / 100,
        water_added: parseFloat(data.water_added) || 0,
        output_volume: parseFloat(data.output_volume),
        output_abv: parseFloat(data.output_abv),
        output_lals: parseFloat(data.output_lals),
        status: data.status,
        notes: data.notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dilutions'] });
      setEditingDilution(null);
      toast.success('Dilution updated');
    },
    onError: (err) => toast.error(err.message || 'Failed to update dilution'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (dilution) => {
      const isHearts = dilution.notes?.includes('[Heads Dilution]');
      const waterAdded = parseFloat(dilution.water_added) || 0;
      const outputVolume = parseFloat(dilution.output_volume) || 0;
      const outputLals = parseFloat(dilution.output_lals) || 0;
      const outputAbv = parseFloat(dilution.output_abv) || 0;
      const today = new Date().toISOString().split('T')[0];

      const allTanks = await db.StorageTank.list('name', 5000);

      if (isHearts) {
        const isTransfer = dilution.notes?.includes('Transferred to Tank');
        const sourceMatch = dilution.notes?.match(/Source tank: ([^\s.]+)/);
        const destMatch = dilution.notes?.match(/Transferred to Tank ([^\s.]+)/);
        const sourceName = sourceMatch?.[1];
        const destName = destMatch?.[1];

        if (isTransfer && destName) {
          const sourceTank = allTanks.find(t => t.name === sourceName);
          const destTank = allTanks.find(t => t.name === destName);

          if (sourceTank) {
            const newSrcVol = (sourceTank.current_volume || 0) + outputVolume;
            const newSrcAbv = newSrcVol > 0 ? (outputLals / newSrcVol) * 100 : 0;
            await db.StorageTank.update(sourceTank.id, {
              current_volume: parseFloat(newSrcVol.toFixed(3)),
              current_abv: parseFloat(newSrcAbv.toFixed(2)),
              current_product: dilution.batch_number || sourceTank.current_product,
              current_batch: dilution.batch_number || sourceTank.current_batch,
              status: 'in_use',
            });
          }

          if (destTank) {
            const newDestVol = Math.max(0, (destTank.current_volume || 0) - outputVolume);
            const destLals = (destTank.current_volume || 0) * (destTank.current_abv || 0) / 100;
            const newDestLals = Math.max(0, destLals - outputLals);
            const newDestAbv = newDestVol > 0 ? (newDestLals / newDestVol) * 100 : 0;
            await db.StorageTank.update(destTank.id, {
              current_volume: parseFloat(newDestVol.toFixed(3)),
              current_abv: parseFloat(newDestAbv.toFixed(2)),
              ...(newDestVol === 0 ? { current_product: '', current_batch: '', status: 'empty' } : {}),
            });
          }

          await db.TankMovement.create({
            date: today, action: 'dilution_reversed', tank_name: sourceName || 'unknown',
            volume_litres: outputVolume, abv: outputAbv, lals: outputLals,
            product: dilution.batch_number, batch_number: dilution.batch_number,
            notes: `Reversed hearts dilution transfer — ${outputVolume}L returned to source`,
          });
          await db.TankMovement.create({
            date: today, action: 'dilution_reversed', tank_name: destName,
            volume_litres: outputVolume, abv: outputAbv, lals: outputLals,
            product: dilution.batch_number, batch_number: dilution.batch_number,
            notes: `Reversed hearts dilution transfer — ${outputVolume}L removed from destination`,
          });
        } else {
          const sourceTank = allTanks.find(t => t.name === sourceName);
          if (sourceTank) {
            const newVol = Math.max(0, (sourceTank.current_volume || 0) - waterAdded);
            const currentLals = (sourceTank.current_volume || 0) * (sourceTank.current_abv || 0) / 100;
            const newAbv = newVol > 0 ? (currentLals / newVol) * 100 : 0;
            await db.StorageTank.update(sourceTank.id, {
              current_volume: parseFloat(newVol.toFixed(3)),
              current_abv: parseFloat(newAbv.toFixed(2)),
              ...(newVol === 0 ? { current_product: '', current_batch: '', status: 'empty' } : {}),
            });
          }
          await db.TankMovement.create({
            date: today, action: 'dilution_reversed', tank_name: sourceName || 'unknown',
            volume_litres: waterAdded, abv: 0, lals: 0,
            product: dilution.batch_number, batch_number: dilution.batch_number,
            notes: `Reversed hearts in-place dilution — ${waterAdded}L water removed`,
          });
        }
      } else {
        const allMovements = await db.TankMovement.list('-date', 5000);
        const fillMovement = allMovements.find(m =>
          m.date === dilution.date &&
          m.batch_number === dilution.batch_number &&
          m.action === 'fill'
        );
        const tankName = fillMovement?.tank_name;

        if (tankName) {
          const tank = allTanks.find(t => t.name === tankName);
          if (tank) {
            const newVol = Math.max(0, (tank.current_volume || 0) - waterAdded);
            const currentLals = (tank.current_volume || 0) * (tank.current_abv || 0) / 100;
            const newAbv = newVol > 0 ? (currentLals / newVol) * 100 : 0;
            await db.StorageTank.update(tank.id, {
              current_volume: parseFloat(newVol.toFixed(3)),
              current_abv: parseFloat(newAbv.toFixed(2)),
              ...(newVol === 0 ? { current_product: '', current_batch: '', status: 'empty' } : {}),
            });
          }
        }
        await db.TankMovement.create({
          date: today, action: 'dilution_reversed', tank_name: tankName || 'unknown',
          volume_litres: waterAdded, abv: 0, lals: 0,
          product: dilution.batch_number, batch_number: dilution.batch_number,
          notes: `Reversed ethanol dilution — ${waterAdded}L water removed`,
        });
      }

      await db.Dilution.delete(dilution.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dilutions'] });
      queryClient.invalidateQueries({ queryKey: ['dilutions-sheet'] });
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['tankMovements'] });
      setDeletingDilution(null);
      toast.success('Dilution deleted and tank volumes reversed');
    },
    onError: (err) => toast.error(err.message || 'Failed to delete dilution'),
  });

  const CalcDisplay = ({ value, label }) => (
    <div>
      <Label className="flex items-center gap-1">{label} <Calculator className="w-3 h-3 text-primary" /></Label>
      <div className={`h-9 flex items-center px-3 rounded-md border text-sm font-semibold transition-colors ${value > 0 ? 'bg-primary/8 border-primary/30 text-primary' : 'bg-muted border-input text-muted-foreground'}`}>
        {value > 0 ? value.toFixed(3) : '—'}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title="Dilutions" subtitle="Track ethanol and hearts dilutions">
        <div className="flex gap-2">
          {/* Ethanol Dilution Dialog */}
          <Dialog open={openType === 'ethanol'} onOpenChange={v => setOpenType(v ? 'ethanol' : null)}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <FlaskConical className="w-4 h-4" />Ethanol Dilution
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-primary" />
                  Ethanol Dilution (96% → Tank X/Y)
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={e => { e.preventDefault(); ethanolMutation.mutate(ethanolForm); }} className="space-y-4 mt-2">

                <div>
                  <Label>Date</Label>
                  <Input type="date" value={ethanolForm.date} onChange={e => setE('date', e.target.value)} required />
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ethanol Source (Received)</p>
                  <div>
                    <Label>Select Ethanol Lot Code</Label>
                    <Select value={ethanolForm.source_id} onValueChange={handleEthanolSourceChange}>
                      <SelectTrigger><SelectValue placeholder="Choose an ethanol lot code..." /></SelectTrigger>
                      <SelectContent>
                        {receivings.map(r => (
                          <SelectItem key={r.id} value={r.id}>
                            <span className="font-semibold">{r.batch_number || 'No lot code'}</span>
                            {' — '}{r.material_name} ({r.quantity}{r.unit} @ {r.abv_percent}% ABV) — {r.date_received}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {ethanolForm.source_id && (() => {
                    const rec = receivings.find(r => r.id === ethanolForm.source_id);
                    return rec?.batch_number ? (
                      <p className="text-xs font-semibold text-primary flex items-center gap-1">
                        Lot Code: <span className="font-mono bg-primary/10 px-2 py-0.5 rounded">{rec.batch_number}</span>
                        {rec.supplier ? <span className="text-muted-foreground font-normal ml-1">— {rec.supplier}</span> : null}
                      </p>
                    ) : null;
                  })()}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Volume (L)</Label>
                      <Input type="number" step="0.01" value={ethanolForm.input_ethanol_volume} onChange={e => setE('input_ethanol_volume', e.target.value)} required />
                    </div>
                    <div>
                      <Label>ABV %</Label>
                      <Input type="number" step="0.1" value={ethanolForm.input_abv} onChange={e => setE('input_abv', e.target.value)} required />
                    </div>
                    <CalcDisplay value={eInputLALs} label="LALs" />
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Water Addition and Output</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Water Added (L)</Label>
                      <Input type="number" step="0.01" value={ethanolForm.water_added} onChange={e => setE('water_added', e.target.value)} />
                    </div>
                    <CalcDisplay value={eOutputVol} label="Output Vol (L)" />
                    <CalcDisplay value={eOutputABV} label="Output ABV %" />
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calculator className="w-3 h-3 text-primary" />
                    Output LALs = <span className="font-semibold text-primary ml-1">{eInputLALs > 0 ? eInputLALs.toFixed(3) : '—'}</span>
                  </p>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Destination Tank (X or Y — Outdoor)</p>
                  <Select value={ethanolForm.tank_id} onValueChange={v => setE('tank_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Select Tank X or Y..." /></SelectTrigger>
                    <SelectContent>
                      {ethanolDestTanks.length === 0
                        ? <SelectItem value="none" disabled>No X/Y tanks found</SelectItem>
                        : ethanolDestTanks.map(t => (
                          <SelectItem key={t.id} value={t.id}>
                            Tank {t.name} — {t.capacity_litres}L capacity
                            {t.status === 'empty' ? ' (empty)' : ` — ${t.current_volume || 0}L in use`}
                          </SelectItem>
                        ))
                      }
                    </SelectContent>
                  </Select>
                  {eSelectedTank && eOutputVol > 0 && (
                    <p className="text-xs text-primary font-medium">
                      Tank {eSelectedTank.name} → {Math.min((eSelectedTank.current_volume || 0) + eOutputVol, eSelectedTank.capacity_litres).toFixed(1)}L
                      / {eSelectedTank.capacity_litres}L at {eOutputABV.toFixed(2)}% ABV
                    </p>
                  )}
                </div>

                <div>
                  <Label>Status</Label>
                  <Select value={ethanolForm.status} onValueChange={v => setE('status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planned">Planned</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Notes</Label>
                  <Textarea value={ethanolForm.notes} onChange={e => setE('notes', e.target.value)} />
                </div>

                <Button type="submit" className="w-full" disabled={ethanolMutation.isPending}>
                  {ethanolMutation.isPending ? 'Saving...' : 'Record Ethanol Dilution'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          {/* Hearts Dilution Dialog */}
          <Dialog open={openType === 'heads'} onOpenChange={v => setOpenType(v ? 'heads' : null)}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Droplets className="w-4 h-4" />Hearts Dilution
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-blue-500" />
                  Hearts Dilution (Tank E / F / H)
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={e => e.preventDefault()} className="space-y-4 mt-2">

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Batch Number</Label>
                    <Input value={heartsForm.batch_number} onChange={e => setH('batch_number', e.target.value)} required />
                  </div>
                  <div>
                    <Label>Date</Label>
                    <Input type="date" value={heartsForm.date} onChange={e => setH('date', e.target.value)} required />
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Source Tank (E, F or H — Hearts)</p>
                  <div>
                    <Label>Select Source Tank</Label>
                    <Select value={heartsForm.source_tank_id} onValueChange={handleHeartsSourceChange}>
                      <SelectTrigger><SelectValue placeholder="Choose a hearts tank..." /></SelectTrigger>
                      <SelectContent>
                        {heartsSrcTanks.length === 0
                          ? <SelectItem value="none" disabled>No E/F/H tanks found</SelectItem>
                          : heartsSrcTanks.map(t => (
                            <SelectItem key={t.id} value={t.id}>
                              Tank {t.name}
                              {t.current_volume > 0
                                ? ` — ${t.current_volume}L @ ${t.current_abv}% ABV`
                                : ' — empty'}
                              {t.current_product ? ` (${t.current_product})` : ''}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Volume (L)</Label>
                      <Input type="number" step="0.01" value={heartsForm.input_ethanol_volume} onChange={e => setH('input_ethanol_volume', e.target.value)} required />
                    </div>
                    <div>
                      <Label>ABV %</Label>
                      <Input type="number" step="0.1" value={heartsForm.input_abv} onChange={e => setH('input_abv', e.target.value)} required />
                    </div>
                    <CalcDisplay value={hInputLALs} label="LALs" />
                  </div>
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output — enter any one field</p>
                  <p className="text-xs text-muted-foreground">Fill in <span className="font-medium text-foreground">one</span> of the three fields below and the others will be calculated automatically.</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="flex items-center gap-1">Water Added (L){heartsForm.water_added === '' && (hOutputVolRaw || hTargetAbvRaw) ? <Calculator className="w-3 h-3 text-primary" /> : null}</Label>
                      <Input
                        type="number" step="0.01"
                        value={heartsForm.water_added !== '' ? heartsForm.water_added : (heartsForm.output_volume !== '' || heartsForm.target_abv !== '') && hWater > 0 ? hWater.toFixed(3) : ''}
                        onChange={e => setHeartsForm(p => ({ ...p, water_added: e.target.value, output_volume: '', target_abv: '' }))}
                        placeholder="e.g. 50"
                        className={heartsForm.water_added === '' && hWater > 0 ? 'bg-primary/5 border-primary/40 font-semibold text-primary' : ''}
                      />
                    </div>
                    <div>
                      <Label className="flex items-center gap-1">Output Vol (L){heartsForm.output_volume === '' && (heartsForm.water_added !== '' || heartsForm.target_abv !== '') ? <Calculator className="w-3 h-3 text-primary" /> : null}</Label>
                      <Input
                        type="number" step="0.01"
                        value={heartsForm.output_volume !== '' ? heartsForm.output_volume : (heartsForm.water_added !== '' || heartsForm.target_abv !== '') && hOutputVol > 0 ? hOutputVol.toFixed(3) : ''}
                        onChange={e => setHeartsForm(p => ({ ...p, output_volume: e.target.value, water_added: '', target_abv: '' }))}
                        placeholder="e.g. 150"
                        className={heartsForm.output_volume === '' && hOutputVol > 0 ? 'bg-primary/5 border-primary/40 font-semibold text-primary' : ''}
                      />
                    </div>
                    <div>
                      <Label className="flex items-center gap-1">Target ABV %{heartsForm.target_abv === '' && (heartsForm.water_added !== '' || heartsForm.output_volume !== '') ? <Calculator className="w-3 h-3 text-primary" /> : null}</Label>
                      <Input
                        type="number" step="0.1"
                        value={heartsForm.target_abv !== '' ? heartsForm.target_abv : (heartsForm.water_added !== '' || heartsForm.output_volume !== '') && hOutputABV > 0 ? hOutputABV.toFixed(2) : ''}
                        onChange={e => setHeartsForm(p => ({ ...p, target_abv: e.target.value, water_added: '', output_volume: '' }))}
                        placeholder="e.g. 45"
                        className={heartsForm.target_abv === '' && hOutputABV > 0 ? 'bg-primary/5 border-primary/40 font-semibold text-primary' : ''}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calculator className="w-3 h-3 text-primary" />
                    Output LALs = <span className="font-semibold text-primary ml-1">{hInputLALs > 0 ? hInputLALs.toFixed(3) : '—'}</span>
                    {hSourceTank && <span className="ml-1">— water added in-place to Tank {hSourceTank.name}</span>}
                  </p>
                </div>

                <div>
                  <Label>Notes</Label>
                  <Textarea value={heartsForm.notes} onChange={e => setH('notes', e.target.value)} />
                </div>

                <div className="rounded-lg border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transfer Destination (optional)</p>
                  <div>
                    <Label>Transfer to Tank (A, B, C or D)</Label>
                    <Select value={heartsForm.transfer_tank_id} onValueChange={v => setH('transfer_tank_id', v)}>
                      <SelectTrigger><SelectValue placeholder="Select destination tank..." /></SelectTrigger>
                      <SelectContent>
                        {productTanks.length === 0
                          ? <SelectItem value="none" disabled>No A/B/C/D tanks found</SelectItem>
                          : productTanks.map(t => (
                            <SelectItem key={t.id} value={t.id}>
                              Tank {t.name} — {t.capacity_litres}L capacity
                              {t.status === 'empty' ? ' (empty)' : ` — ${t.current_volume || 0}L in use`}
                              {t.current_product ? ` — ${t.current_product}` : ''}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                  {heartsForm.transfer_tank_id && (() => {
                    const dest = productTanks.find(t => t.id === heartsForm.transfer_tank_id);
                    return dest && hOutputVol > 0 ? (
                      <p className="text-xs text-primary font-medium">
                        Tank {dest.name} → {Math.min((dest.current_volume || 0) + hOutputVol, dest.capacity_litres).toFixed(1)}L
                        / {dest.capacity_litres}L at {hOutputABV.toFixed(2)}% ABV
                      </p>
                    ) : null;
                  })()}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={heartsMutation.isPending}
                    onClick={() => heartsMutation.mutate({ data: heartsForm, action: 'save' })}
                  >
                    {heartsMutation.isPending ? 'Saving...' : '💾 Save Progress'}
                  </Button>
                  <Button
                    type="button"
                    disabled={heartsMutation.isPending || !heartsForm.transfer_tank_id}
                    onClick={() => heartsMutation.mutate({ data: heartsForm, action: 'transfer' })}
                    className="bg-green-700 hover:bg-green-800 text-white"
                  >
                    {heartsMutation.isPending ? 'Transferring...' : '✓ Complete and Transfer'}
                  </Button>
                </div>
                {!heartsForm.transfer_tank_id && (
                  <p className="text-xs text-muted-foreground text-center -mt-2">Select a destination tank above to enable Complete and Transfer</p>
                )}
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>

      <Card className="overflow-hidden">
        <div className="flex flex-col sm:flex-row gap-2 p-4 border-b border-border">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search batch, lot code…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-8 text-sm" />
          </div>
          <Select value={filterType} onValueChange={v => { setFilterType(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="hearts">Hearts</SelectItem>
              <SelectItem value="ethanol">Ethanol</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Lot / Batch</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Input Vol (L)</TableHead>
                <TableHead>Input ABV</TableHead>
                <TableHead>Input LALs</TableHead>
                <TableHead>Water (L)</TableHead>
                <TableHead>Output Vol (L)</TableHead>
                <TableHead>Output ABV</TableHead>
                <TableHead>Output LALs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && !sheetData ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : dilutions.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No dilutions recorded</TableCell></TableRow>
              ) : pagedDilutions.map(d => {
                const isHearts = d.notes?.includes('[Heads Dilution]') || parseFloat(d.input_abv) === 79;
                return (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm">{d.date ? format(new Date(d.date), 'MMM d, yyyy') : '—'}</TableCell>
                    <TableCell className="text-sm">
                      {isHearts ? (
                        <span className="font-medium">{d.batch_number}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 font-mono text-xs bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded">
                          {d.batch_number || '—'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${isHearts ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {isHearts ? <Droplets className="w-3 h-3" /> : <FlaskConical className="w-3 h-3" />}
                        {isHearts ? 'Hearts' : 'Ethanol'}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{d.input_ethanol_volume}</TableCell>
                    <TableCell className="text-sm">{d.input_abv}%</TableCell>
                    <TableCell className="text-sm font-medium">{d.input_lals?.toFixed(3)}</TableCell>
                    <TableCell className="text-sm">{d.water_added}</TableCell>
                    <TableCell className="text-sm">{d.output_volume?.toFixed(2)}</TableCell>
                    <TableCell className="text-sm">{d.output_abv?.toFixed(2)}%</TableCell>
                    <TableCell className="text-sm font-medium">{d.output_lals?.toFixed(3)}</TableCell>
                    <TableCell><StatusBadge status={d.status} /></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setEditingDilution({ ...d })}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:text-destructive"
                          onClick={() => setDeletingDilution(d)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <MobileCardGrid>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground text-sm">Loading...</p>
          ) : dilutions.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground text-sm">No dilutions recorded</p>
          ) : pagedDilutions.map(d => {
            const isHearts = d.notes?.includes('[Heads Dilution]') || parseFloat(d.input_abv) === 79;
            return (
              <MobileCard
                key={d.id}
                title={d.batch_number || 'Dilution'}
                subtitle={`${d.date ? format(new Date(d.date), 'MMM d, yyyy') : '—'}`}
                badge={
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${isHearts ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                    {isHearts ? <Droplets className="w-3 h-3" /> : <FlaskConical className="w-3 h-3" />}
                    {isHearts ? 'Hearts' : 'Ethanol'}
                  </span>
                }
                accent={<span className="text-sm font-semibold">{d.output_abv?.toFixed(1)}%</span>}
                actions={
                  <>
                    <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => setEditingDilution({ ...d })}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                    <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-destructive" onClick={() => setDeletingDilution(d)}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
                  </>
                }
              >
                <MobileDetailRow label="Input" value={`${d.input_ethanol_volume}L @ ${d.input_abv}%`} />
                <MobileDetailRow label="Input LALs" value={d.input_lals?.toFixed(3)} />
                <MobileDetailRow label="Water Added" value={`${d.water_added}L`} />
                <MobileDetailRow label="Output Vol" value={d.output_volume?.toFixed(2) ? `${d.output_volume.toFixed(2)}L` : '—'} />
                <MobileDetailRow label="Output ABV" value={d.output_abv?.toFixed(2) ? `${d.output_abv.toFixed(2)}%` : '—'} highlight />
                <MobileDetailRow label="Output LALs" value={d.output_lals?.toFixed(3)} highlight />
                <MobileDetailRow label="Status" value={<StatusBadge status={d.status} />} />
              </MobileCard>
            );
          })}
        </MobileCardGrid>
        <Pagination total={filteredDilutions.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingDilution} onOpenChange={v => !v && setEditingDilution(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              Edit Dilution
            </DialogTitle>
          </DialogHeader>
          {editingDilution && (
            <form
              onSubmit={e => { e.preventDefault(); editMutation.mutate(editingDilution); }}
              className="space-y-4 mt-2"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Batch / Lot</Label>
                  <Input
                    value={editingDilution.batch_number || ''}
                    onChange={e => setEditingDilution(p => ({ ...p, batch_number: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={editingDilution.date || ''}
                    onChange={e => setEditingDilution(p => ({ ...p, date: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Input</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Volume (L)</Label>
                    <Input
                      type="number" step="0.01"
                      value={editingDilution.input_ethanol_volume || ''}
                      onChange={e => setEditingDilution(p => ({ ...p, input_ethanol_volume: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>ABV %</Label>
                    <Input
                      type="number" step="0.1"
                      value={editingDilution.input_abv || ''}
                      onChange={e => setEditingDilution(p => ({ ...p, input_abv: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Output</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Water Added (L)</Label>
                    <Input
                      type="number" step="0.01"
                      value={editingDilution.water_added || ''}
                      onChange={e => setEditingDilution(p => ({ ...p, water_added: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Output Vol (L)</Label>
                    <Input
                      type="number" step="0.01"
                      value={editingDilution.output_volume || ''}
                      onChange={e => setEditingDilution(p => ({ ...p, output_volume: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Output ABV %</Label>
                    <Input
                      type="number" step="0.1"
                      value={editingDilution.output_abv || ''}
                      onChange={e => setEditingDilution(p => ({ ...p, output_abv: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label>Output LALs</Label>
                  <Input
                    type="number" step="0.0001"
                    value={editingDilution.output_lals || ''}
                    onChange={e => setEditingDilution(p => ({ ...p, output_lals: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <Label>Status</Label>
                <Select
                  value={editingDilution.status}
                  onValueChange={v => setEditingDilution(p => ({ ...p, status: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={editingDilution.notes || ''}
                  onChange={e => setEditingDilution(p => ({ ...p, notes: e.target.value }))}
                />
              </div>

              <Button type="submit" className="w-full" disabled={editMutation.isPending}>
                {editMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingDilution} onOpenChange={v => !v && setDeletingDilution(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dilution?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse all tank volume changes from this dilution. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMutation.mutate(deletingDilution)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? 'Deleting…' : 'Delete & Reverse'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}