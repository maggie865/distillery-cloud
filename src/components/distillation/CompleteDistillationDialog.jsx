import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, CheckCircle2, Droplets, FlaskConical, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

export default function CompleteDistillationDialog({ run, open, onOpenChange, onCompleted }) {
  const [heartsTankId, setHeartsTankId] = useState('');
  const queryClient = useQueryClient();

  const { data: tanks = [] } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => db.StorageTank.list('name', 50),
  });

  // Hearts go to maceration/dilution tanks only
  const heartsTanks = tanks.filter(t => t.purpose === 'maceration_dilution');
  // IBC tank(s) for heads/tails
  const ibcTanks = tanks.filter(t => t.purpose === 'ibc');
  const ibc = ibcTanks[0]; // use first IBC

  const heartsVolume = parseFloat(run?.hearts_volume) || 0;
  const heartsAbv = parseFloat(run?.hearts_abv) || 0;
  const heartsLALs = heartsVolume && heartsAbv ? parseFloat((heartsVolume * heartsAbv / 100).toFixed(4)) : 0;

  const headsVolume = parseFloat(run?.heads_volume) || 0;
  const headsAbv = parseFloat(run?.heads_abv) || 0;
  const tailsVolume = parseFloat(run?.tails_volume) || 0;
  const tailsAbv = parseFloat(run?.tails_abv) || 0;
  const ibcVolume = parseFloat((headsVolume + tailsVolume).toFixed(2));
  const ibcAvgAbv = ibcVolume > 0
    ? parseFloat(((headsVolume * headsAbv + tailsVolume * tailsAbv) / ibcVolume).toFixed(2))
    : 0;

  const dumpedVolume = parseFloat(run?.dumped_volume) || 0;

  const completeMutation = useMutation({
    mutationFn: async () => {
      const today = format(new Date(), 'yyyy-MM-dd');

      // 1. Update the distillation run to completed
      await db.DistillationRun.update(run.id, { status: 'completed' });

      // 2. Add hearts to selected tank
      if (heartsTankId && heartsVolume > 0) {
        const heartsTank = tanks.find(t => t.id === heartsTankId);
        const newVolume = parseFloat(((heartsTank.current_volume || 0) + heartsVolume).toFixed(2));
        await db.StorageTank.update(heartsTankId, {
          current_volume: newVolume,
          current_abv: heartsAbv || heartsTank.current_abv,
          current_product: run.product_name,
          current_batch: run.batch_number,
          status: 'in_use',
        });
        await db.TankMovement.create({
          date: today,
          action: 'transfer_in',
          tank_name: heartsTank.name,
          volume_litres: heartsVolume,
          abv: heartsAbv,
          lals: heartsLALs,
          product: run.product_name,
          batch_number: run.batch_number,
          notes: `Hearts from distillation run ${run.batch_number}`,
        });
      }

      // 3. Add heads + tails to IBC
      if (ibc && ibcVolume > 0) {
        const newIbcVolume = parseFloat(((ibc.current_volume || 0) + ibcVolume).toFixed(2));
        const ibcLALs = ibcVolume && ibcAvgAbv ? parseFloat((ibcVolume * ibcAvgAbv / 100).toFixed(4)) : 0;
        await db.StorageTank.update(ibc.id, {
          current_volume: newIbcVolume,
          current_abv: ibcAvgAbv,
          status: newIbcVolume > 0 ? 'in_use' : 'empty',
          notes: `Contains heads/tails from various runs`,
        });
        await db.TankMovement.create({
          date: today,
          action: 'transfer_in',
          tank_name: ibc.name,
          volume_litres: ibcVolume,
          abv: ibcAvgAbv,
          lals: ibcLALs,
          product: `Heads & Tails — ${run.product_name}`,
          batch_number: run.batch_number,
          notes: `Heads (${headsVolume}L) + Tails (${tailsVolume}L) from ${run.batch_number}`,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['distillationRuns'] });
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['tankMovements'] });
      toast.success('Distillation completed — hearts and cuts assigned to tanks');
      onOpenChange(false);
      onCompleted?.();
    },
    onError: (err) => toast.error(err.message || 'Failed to complete distillation run'),
  });

  if (!run) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            Complete Distillation Run
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Confirmation warning */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              This will mark <span className="font-semibold">{run.batch_number}</span> as completed and move the cuts to tanks. This cannot be undone automatically.
            </p>
          </div>

          {/* Summary of what will move */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What will be moved</p>

            <div className="flex items-center gap-2.5">
              <FlaskConical className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-emerald-700">Hearts → Selected Tank</p>
                <p className="text-xs text-muted-foreground">
                  {heartsVolume > 0 ? `${heartsVolume}L @ ${heartsAbv}% ABV (${heartsLALs} LALs)` : <span className="text-amber-600">No hearts volume recorded</span>}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <Droplets className="w-4 h-4 text-blue-500 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-700">
                  Heads + Tails → {ibc ? `IBC (${ibc.name})` : <span className="text-destructive">No IBC tank found</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ibcVolume > 0
                    ? `${ibcVolume}L total (Heads: ${headsVolume}L, Tails: ${tailsVolume}L)`
                    : 'No heads/tails volume recorded'}
                </p>
              </div>
            </div>

            {dumpedVolume > 0 && (
              <div className="flex items-center gap-2.5">
                <Trash2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-muted-foreground">Dumped from still</p>
                  <p className="text-xs text-muted-foreground">{dumpedVolume}L — {run.dumped_notes || 'no notes'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Hearts tank selector */}
          <div>
            <Label>Send Hearts to Tank</Label>
            <Select value={heartsTankId} onValueChange={setHeartsTankId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a tank for the hearts…" />
              </SelectTrigger>
              <SelectContent>
                {heartsTanks.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    Tank {t.name}
                    {t.current_volume > 0 ? ` — ${t.current_volume}L in use` : ' — empty'}
                    {t.current_product ? ` (${t.current_product})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!ibc && (
            <p className="text-xs text-destructive">
              ⚠ No IBC tank found. Please create an IBC tank in the Tank Farm first.
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={!heartsTankId || completeMutation.isPending}
              onClick={() => completeMutation.mutate()}
            >
              {completeMutation.isPending ? 'Completing…' : 'Yes, Complete Run'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
