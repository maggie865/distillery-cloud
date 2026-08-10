import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/api/supabaseClient';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ArrowRightLeft, MapPin, CheckCircle2, Sparkles, Wrench } from 'lucide-react';
import { toast } from 'sonner';

// Stops a click on an interactive control inside the card from also
// triggering the card's own navigate-to-detail handler.
const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };

const purposeLabels = {
  maceration_dilution: 'Maceration / Dilution',
  final_product_storage: 'Final Product Storage',
  diluted_ethanol: 'Diluted Ethanol',
  spare: 'Spare',
};

const purposeColors = {
  maceration_dilution: 'bg-amber-500',
  final_product_storage: 'bg-primary',
  diluted_ethanol: 'bg-blue-500',
  spare: 'bg-muted-foreground',
};

const statusStyles = {
  empty: 'text-muted-foreground',
  in_use: 'text-emerald-600',
  cleaning: 'text-amber-600',
  maintenance: 'text-red-600',
};

export default function TankCard({ tank, onTransfer }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin';

  const fillPct = tank.capacity_litres > 0
    ? Math.min(100, Math.round((tank.current_volume || 0) / tank.capacity_litres * 100))
    : 0;

  const barColor = purposeColors[tank.purpose] || 'bg-primary';

  const toggleReady = useMutation({
    mutationFn: async (newValue) => {
      await db.StorageTank.update(tank.id, { is_ready_for_bottling: newValue });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
    },
    onError: (e) => toast.error(e.message),
  });

  const markClean = useMutation({
    mutationFn: async () => {
      await db.StorageTank.update(tank.id, { status: 'empty' });
      await db.TankMovement.create({
        date: new Date().toISOString().split('T')[0],
        action: 'cleaning_complete',
        tank_name: tank.name,
        volume_litres: 0,
        notes: 'Tank cleaning complete — marked as empty and available',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['tankMovements'] });
      toast.success(`Tank ${tank.name} marked as clean and available`);
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const markMaintenance = useMutation({
    mutationFn: async () => {
      await db.StorageTank.update(tank.id, { status: 'maintenance' });
      await db.TankMovement.create({
        date: new Date().toISOString().split('T')[0],
        action: 'maintenance_start',
        tank_name: tank.name,
        volume_litres: 0,
        notes: 'Tank closed for maintenance',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['tankMovements'] });
      toast.success(`Tank ${tank.name} closed for maintenance`);
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const markAvailableFromMaintenance = useMutation({
    mutationFn: async () => {
      await db.StorageTank.update(tank.id, { status: 'empty' });
      await db.TankMovement.create({
        date: new Date().toISOString().split('T')[0],
        action: 'maintenance_complete',
        tank_name: tank.name,
        volume_litres: 0,
        notes: 'Maintenance complete — tank returned to service',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      queryClient.invalidateQueries({ queryKey: ['tankMovements'] });
      toast.success(`Tank ${tank.name} returned to service`);
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const handleToggle = (checked) => {
    toggleReady.mutate(checked);
  };

  const isFinishingTank = tank.purpose === 'final_product_storage';
  const canToggleReady = isAdmin && isFinishingTank;

  return (
    <div
      className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => navigate(`/tanks/${tank.id}`)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-display font-bold text-foreground">Tank {tank.name}</span>
            <span className={cn('text-xs font-medium capitalize', statusStyles[tank.status])}>
              ● {tank.status?.replace('_', ' ')}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span className="capitalize">{tank.location}</span>
            <span className="mx-1">·</span>
            <span>{tank.capacity_litres}L capacity</span>
          </div>
        </div>
        <Badge variant="outline" className="text-xs whitespace-nowrap">
          {purposeLabels[tank.purpose]}
        </Badge>
      </div>

      {/* Fill bar */}
      <div>
        <div className="flex justify-between text-xs text-muted-foreground mb-1">
          <span>{tank.current_volume || 0}L filled</span>
          <span>{fillPct}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all duration-500', barColor)}
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <div className="text-right text-xs text-muted-foreground mt-0.5">{tank.capacity_litres}L max</div>
      </div>

      {/* Contents */}
      {tank.status === 'in_use' && (
        <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
          {tank.current_product && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Product</span>
              <span className="font-medium">{tank.current_product}</span>
            </div>
          )}
          {tank.current_batch && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Batch</span>
              <span className="font-mono font-medium">{tank.current_batch}</span>
            </div>
          )}
          {tank.current_abv && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">ABV</span>
              <span className="font-medium">{tank.current_abv}%</span>
            </div>
          )}
        </div>
      )}

      {/* Ready for Bottling toggle — admin only, finishing tanks only */}
      {isFinishingTank && (
        <div className={cn(
          'flex items-center justify-between rounded-lg border px-3 py-2',
          tank.is_ready_for_bottling
            ? 'border-green-300 bg-green-50'
            : 'border-border bg-muted/30'
        )}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className={cn('w-4 h-4', tank.is_ready_for_bottling ? 'text-green-600' : 'text-muted-foreground')} />
            <span className="text-xs font-medium">
              {tank.is_ready_for_bottling ? 'Ready for bottling' : 'Not ready for bottling'}
            </span>
          </div>
          {isAdmin ? (
            <Switch
              checked={!!tank.is_ready_for_bottling}
              onCheckedChange={handleToggle}
              disabled={!canToggleReady || toggleReady.isPending}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={cn('text-xs font-semibold', tank.is_ready_for_bottling ? 'text-green-600' : 'text-muted-foreground')}>
              {tank.is_ready_for_bottling ? '✓' : '—'}
            </span>
          )}
        </div>
      )}

      {/* Maintenance status banner */}
      {tank.status === 'maintenance' && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-red-600" />
            <span className="text-red-600 text-sm font-semibold">Tank closed for maintenance</span>
          </div>
          <p className="text-xs text-red-700">Tank is out of service. Mark as available when maintenance is complete.</p>
          <Button
            size="sm"
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={stop(() => markAvailableFromMaintenance.mutate())}
            disabled={markAvailableFromMaintenance.isPending}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {markAvailableFromMaintenance.isPending ? 'Saving...' : 'Maintenance Complete — Return to Service'}
          </Button>
        </div>
      )}

      {/* Cleaning status banner + Mark as Clean button */}
      {tank.status === 'cleaning' && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-amber-600 text-sm font-semibold">🧹 Tank is being cleaned</span>
          </div>
          <p className="text-xs text-amber-700">Once cleaning is complete, mark the tank as available for use.</p>
          <Button
            size="sm"
            className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={stop(() => markClean.mutate())}
            disabled={markClean.isPending}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {markClean.isPending ? 'Saving...' : 'Mark as Clean & Available'}
          </Button>
        </div>
      )}

      {/* Transfer button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-2 mt-auto"
        onClick={stop(() => onTransfer(tank))}
        disabled={tank.status === 'cleaning' || tank.status === 'maintenance'}
      >
        <ArrowRightLeft className="w-3.5 h-3.5" />
        Transfer / Update
      </Button>

      {/* Mark for Maintenance — only shown when tank is not already in maintenance/cleaning */}
      {tank.status !== 'maintenance' && tank.status !== 'cleaning' && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 text-xs"
          onClick={stop(() => markMaintenance.mutate())}
          disabled={markMaintenance.isPending}
        >
          <Wrench className="w-3.5 h-3.5" />
          {markMaintenance.isPending ? 'Saving...' : 'Mark for Maintenance'}
        </Button>
      )}
    </div>
  );
}