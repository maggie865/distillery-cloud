import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  ArrowLeft, Pencil, Droplets, Percent, Wine, ClipboardList, Ruler, ArrowRightLeft,
  SlidersHorizontal, Settings2, StickyNote, CheckCircle2, Droplet, Sparkles, FileText,
  Printer, PlayCircle,
} from 'lucide-react';
import { format, parseISO, intervalToDuration, formatDuration, isToday, isTomorrow } from 'date-fns';
import { toast } from 'sonner';
import StatCard from '@/components/shared/StatCard';
import TransferDialog from '@/components/tanks/TransferDialog';
import TankVisual, { TankVisualCaption } from '@/components/tanks/detail/TankVisual';
import TankActionsMenu from '@/components/tanks/detail/TankActionsMenu';
import TankOverviewTab from '@/components/tanks/detail/TankOverviewTab';
import TankContentsTab from '@/components/tanks/detail/TankContentsTab';
import TankMeasurementsTab from '@/components/tanks/detail/TankMeasurementsTab';
import TankHistoryTab from '@/components/tanks/detail/TankHistoryTab';
import TankNotesTab from '@/components/tanks/detail/TankNotesTab';
import { calcUtilisationPct } from '@/lib/tankMath';

const PURPOSE_OPTIONS = [
  { value: 'final_product_storage', label: 'Final Product Storage (A, B, C, D type)' },
  { value: 'maceration_dilution', label: 'Maceration & Dilution (E, F, H type)' },
  { value: 'diluted_ethanol', label: 'Diluted Ethanol Outdoor (X, Y type)' },
  { value: 'ibc', label: 'IBC — Heads & Tails' },
  { value: 'sns', label: 'SNS Distillation Destination' },
  { value: 'spare', label: 'Spare' },
];

const STATUS_BADGE = {
  in_use: { label: 'Active', className: 'bg-success/10 text-success border-success/20' },
  empty: { label: 'Empty', className: 'bg-muted text-muted-foreground border-border' },
  cleaning: { label: 'Cleaning', className: 'bg-warning/10 text-warning border-warning/20' },
  maintenance: { label: 'Maintenance', className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

function phaseLabel(tank) {
  if (tank.status === 'empty') return 'Empty';
  if (tank.status === 'cleaning') return 'Cleaning';
  if (tank.status === 'maintenance') return 'Maintenance';
  if (tank.status === 'in_use') {
    if (tank.is_ready_for_bottling) return 'Ready for Bottling';
    if (tank.purpose === 'final_product_storage') return 'Maturing';
    if (tank.purpose === 'maceration_dilution') return 'Maceration / Dilution';
    if (tank.purpose === 'diluted_ethanol') return 'Holding — Diluted Ethanol';
    if (tank.purpose === 'ibc') return 'Holding — Heads & Tails';
    return 'In Use';
  }
  return tank.status;
}

function formatExpectedReady(iso) {
  const d = new Date(iso);
  if (isToday(d)) return `Today · ${format(d, 'HH:mm')}`;
  if (isTomorrow(d)) return `Tomorrow · ${format(d, 'HH:mm')}`;
  return format(d, 'd MMM yyyy · HH:mm');
}

function StatusRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/70 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground text-right">{value}</span>
    </div>
  );
}

export default function TankDetail() {
  const { tankId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const userName = user?.full_name;

  const [activeTab, setActiveTab] = useState('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusForm, setStatusForm] = useState({ status: 'empty', expected_ready_at: '' });
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferAction, setTransferAction] = useState('fill');

  const tanksQuery = useQuery({ queryKey: ['storageTanks'], queryFn: () => db.StorageTank.list('name', 5000) });
  const tank = tanksQuery.data?.find((t) => t.id === tankId);

  const movementsQuery = useQuery({ queryKey: ['tankMovements'], queryFn: () => db.TankMovement.list('-date', 5000) });
  const tankMovements = useMemo(
    () => (movementsQuery.data || []).filter((m) => tank && m.tank_name === tank.name),
    [movementsQuery.data, tank]
  );

  const hasBatch = !!tank?.current_batch;

  const masterBatchQuery = useQuery({
    queryKey: ['masterBatchForTank', tank?.current_batch],
    queryFn: () => db.MasterBatch.filter({ batch_code: tank.current_batch }),
    enabled: hasBatch,
  });
  const masterBatch = masterBatchQuery.data?.[0] || null;

  const subBatchesQuery = useQuery({
    queryKey: ['subBatchesForTank', masterBatch?.id],
    queryFn: () => db.SubBatch.filter({ master_batch_id: masterBatch.id }),
    enabled: !!masterBatch?.id,
  });

  const distillationRunsQuery = useQuery({
    queryKey: ['distillationRunsForBatch', tank?.current_batch],
    queryFn: () => db.DistillationRun.filter({ batch_number: tank.current_batch }),
    enabled: hasBatch,
  });

  const dilutionsQuery = useQuery({
    queryKey: ['dilutionsForBatch', tank?.current_batch],
    queryFn: () => db.Dilution.filter({ batch_number: tank.current_batch }),
    enabled: hasBatch,
  });

  const bottlingRunsQuery = useQuery({
    queryKey: ['bottlingRunsForBatch', tank?.current_batch],
    queryFn: () => db.BottlingRun.filter({ batch_number: tank.current_batch }),
    enabled: hasBatch,
  });

  const recipeQuery = useQuery({
    queryKey: ['recipeForTank', tank?.current_product],
    queryFn: () => db.Recipe.filter({ name: tank.current_product }),
    enabled: !!tank?.current_product,
  });
  const recipe = recipeQuery.data?.[0] || null;

  const invalidateTank = () => {
    queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
    queryClient.invalidateQueries({ queryKey: ['tankMovements'] });
  };

  const editMutation = useMutation({
    mutationFn: (data) => db.StorageTank.update(tank.id, {
      name: data.name.toUpperCase(),
      capacity_litres: parseFloat(data.capacity_litres),
      purpose: data.purpose,
      location: data.location,
      notes: data.notes,
    }),
    onSuccess: () => {
      invalidateTank();
      setEditOpen(false);
      toast.success('Tank updated');
    },
    onError: (e) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: async (data) => {
      await db.StorageTank.update(tank.id, {
        status: data.status,
        expected_ready_at: data.expected_ready_at ? new Date(data.expected_ready_at).toISOString() : null,
      });
      await db.TankMovement.create({
        date: new Date().toISOString().split('T')[0],
        action: 'status_change',
        tank_name: tank.name,
        volume_litres: 0,
        operator: userName || null,
        notes: `Status set to ${data.status}`,
      });
    },
    onSuccess: () => {
      invalidateTank();
      setStatusOpen(false);
      toast.success('Tank status updated');
    },
    onError: (e) => toast.error(e.message),
  });

  const markReadyMutation = useMutation({
    mutationFn: async () => {
      await db.StorageTank.update(tank.id, { is_ready_for_bottling: true });
      await db.TankMovement.create({
        date: new Date().toISOString().split('T')[0],
        action: 'ready',
        tank_name: tank.name,
        volume_litres: 0,
        operator: userName || null,
        notes: 'Marked ready for bottling',
      });
    },
    onSuccess: () => { invalidateTank(); toast.success('Tank marked ready for bottling'); },
    onError: (e) => toast.error(e.message),
  });

  const completeCleaningMutation = useMutation({
    mutationFn: async () => {
      await db.StorageTank.update(tank.id, { status: 'empty' });
      await db.TankMovement.create({
        date: new Date().toISOString().split('T')[0],
        action: 'cleaning_complete',
        tank_name: tank.name,
        volume_litres: 0,
        operator: userName || null,
        notes: 'Tank cleaning complete — marked as empty and available',
      });
    },
    onSuccess: () => { invalidateTank(); toast.success('Tank marked as clean and available'); },
    onError: (e) => toast.error(e.message),
  });

  const openTransfer = (action) => { setTransferAction(action); setTransferOpen(true); };

  if (tanksQuery.isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!tank) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <h1 className="text-xl font-semibold text-foreground mb-2">Tank not found</h1>
        <p className="text-muted-foreground max-w-sm mb-4">This tank may have been removed or the link is out of date.</p>
        <Button onClick={() => navigate('/tanks')} className="gap-2"><ArrowLeft className="w-4 h-4" /> Back to Tanks</Button>
      </div>
    );
  }

  const volume = tank.current_volume || 0;
  const pct = calcUtilisationPct(volume, tank.capacity_litres);
  const isEmpty = volume <= 0;

  const fillEvents = ['fill', 'transfer_in', 'adjust'];
  const lastFillEvent = [...tankMovements]
    .filter((m) => fillEvents.includes(m.action))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const filledAt = lastFillEvent?.created_at || null;
  const durationLabel = filledAt
    ? (formatDuration(intervalToDuration({ start: new Date(filledAt), end: new Date() }), { format: ['days', 'hours'] }) || 'Just now')
    : null;

  const badge = STATUS_BADGE[tank.status] || STATUS_BADGE.empty;

  const actions = [
    { key: 'measurement', label: 'Add Measurement', icon: Ruler, onClick: () => setActiveTab('measurements') },
  ];
  if (isAdmin && !isEmpty && tank.status !== 'maintenance' && tank.status !== 'cleaning') {
    actions.push({ key: 'transfer', label: 'Transfer Product', icon: ArrowRightLeft, onClick: () => openTransfer('transfer_out') });
    actions.push({ key: 'adjust', label: 'Adjust Volume', icon: SlidersHorizontal, onClick: () => openTransfer('adjust') });
  }
  actions.push({ key: 'note', label: 'Add Note', icon: StickyNote, onClick: () => setActiveTab('notes'), separatorBefore: true });
  if (isAdmin) {
    actions.push({
      key: 'status',
      label: 'Change Status',
      icon: Settings2,
      onClick: () => {
        setStatusForm({
          status: tank.status,
          expected_ready_at: tank.expected_ready_at ? tank.expected_ready_at.slice(0, 16) : '',
        });
        setStatusOpen(true);
      },
    });
  }
  if (isAdmin && tank.purpose === 'final_product_storage' && tank.status === 'in_use' && !tank.is_ready_for_bottling) {
    actions.push({ key: 'ready', label: 'Mark as Ready', icon: CheckCircle2, onClick: () => markReadyMutation.mutate() });
  }
  if (isAdmin && !isEmpty && tank.status !== 'maintenance') {
    actions.push({
      key: 'emptyTank',
      label: 'Empty Tank',
      icon: Droplet,
      destructive: true,
      separatorBefore: true,
      onClick: () => {
        if (confirm(`Empty Tank ${tank.name} completely? This cannot be undone.`)) openTransfer('empty');
      },
    });
  }
  if (isAdmin && tank.status === 'empty') {
    actions.push({ key: 'cleanStart', label: 'Clean Tank', icon: Sparkles, onClick: () => openTransfer('cleaning') });
  }
  if (isAdmin && tank.status === 'cleaning') {
    actions.push({ key: 'cleanComplete', label: 'Mark Clean & Available', icon: Sparkles, onClick: () => completeCleaningMutation.mutate() });
  }
  if (tank.current_batch) {
    actions.push({ key: 'viewBatch', label: 'View Batch', icon: FileText, onClick: () => navigate('/reports'), separatorBefore: true });
  }
  actions.push({ key: 'print', label: 'Print Tank Record', icon: Printer, onClick: () => window.print() });

  return (
    <div className="pb-20 md:pb-0">
      <button
        onClick={() => navigate('/tanks')}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Tanks
      </button>

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight text-foreground">Tank {tank.name}</h1>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          {tank.current_product && <p className="text-lg text-muted-foreground mt-0.5">{tank.current_product}</p>}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm text-muted-foreground">
            <span>Tank ID: <span className="font-medium text-foreground">TANK-{tank.name}</span></span>
            <span>Capacity: <span className="font-medium text-foreground">{tank.capacity_litres} L</span></span>
            {tank.current_batch && <span>Current Batch: <span className="font-medium text-foreground">{tank.current_batch}</span></span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              setEditForm({ name: tank.name, capacity_litres: tank.capacity_litres, purpose: tank.purpose, location: tank.location, notes: tank.notes || '' });
              setEditOpen(true);
            }}
          >
            <Pencil className="w-4 h-4" /> Edit Tank
          </Button>
          <TankActionsMenu actions={actions} />
        </div>
      </div>

      {/* Hero: visual + status panel */}
      <Card className="p-6 mb-5">
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
          <div>
            <TankVisual pct={pct} empty={isEmpty} />
            <TankVisualCaption volume={volume} abv={isEmpty ? null : tank.current_abv} pct={isEmpty ? null : pct} />
          </div>
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tank Status</h2>
            <StatusRow label="Current Status" value={phaseLabel(tank)} />
            <StatusRow label="Started" value={filledAt ? format(new Date(filledAt), 'd MMM yyyy · HH:mm') : '—'} />
            <StatusRow label="Expected ready" value={tank.expected_ready_at ? formatExpectedReady(tank.expected_ready_at) : 'Not set'} />
            <StatusRow label="Duration" value={durationLabel || '—'} />
            <StatusRow label="Current volume" value={`${volume.toLocaleString()} L`} />
            <StatusRow label="ABV" value={tank.current_abv != null ? `${tank.current_abv}%` : '—'} />
            {isEmpty && (
              <Button size="sm" className="mt-4 gap-2" onClick={() => openTransfer('fill')}>
                <PlayCircle className="w-4 h-4" /> Start Production
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Info cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <StatCard title="Volume" value={`${volume.toLocaleString()} L`} subtitle={`of ${tank.capacity_litres} L · ${Math.round(pct)}% capacity`} icon={Droplets} tone="info" />
        <StatCard
          title="ABV"
          value={tank.current_abv != null ? `${tank.current_abv}%` : '—'}
          subtitle={masterBatch?.target_abv != null ? `Target: ${masterBatch.target_abv}%` : 'No target set'}
          icon={Percent}
          tone="warning"
        />
        <StatCard title="Product" value={tank.current_product || '—'} subtitle={recipe ? `Recipe: ${recipe.name}` : 'No recipe linked'} icon={Wine} tone="primary" />
        <StatCard
          title="Batch"
          value={tank.current_batch || '—'}
          subtitle={masterBatch?.date_started ? `Started: ${format(parseISO(masterBatch.date_started), 'd MMM yyyy')}` : '—'}
          icon={ClipboardList}
          tone="info"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contents">Contents</TabsTrigger>
          <TabsTrigger value="measurements">Measurements</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <TankOverviewTab
            tank={tank}
            movements={tankMovements}
            subBatches={subBatchesQuery.data || []}
            distillationRuns={distillationRunsQuery.data || []}
            dilutions={dilutionsQuery.data || []}
            bottlingRuns={bottlingRunsQuery.data || []}
          />
        </TabsContent>
        <TabsContent value="contents">
          <TankContentsTab tank={tank} filledAt={filledAt} onStartProduction={isEmpty ? () => openTransfer('fill') : null} />
        </TabsContent>
        <TabsContent value="measurements">
          <TankMeasurementsTab tank={tank} movements={tankMovements} userName={userName} />
        </TabsContent>
        <TabsContent value="history">
          <TankHistoryTab movements={tankMovements} />
        </TabsContent>
        <TabsContent value="notes">
          <TankNotesTab tank={tank} movements={tankMovements} userName={userName} isAdmin={isAdmin} />
        </TabsContent>
      </Tabs>

      {/* Edit Tank dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-display">Edit Tank {tank.name}</DialogTitle></DialogHeader>
          {editForm && (
            <form onSubmit={(e) => { e.preventDefault(); editMutation.mutate(editForm); }} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tank Name / Letter</Label>
                  <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} required />
                </div>
                <div>
                  <Label>Capacity (litres)</Label>
                  <Input type="number" step="1" value={editForm.capacity_litres} onChange={(e) => setEditForm((p) => ({ ...p, capacity_litres: e.target.value }))} required />
                </div>
              </div>
              <div>
                <Label>Tank Type / Purpose</Label>
                <Select value={editForm.purpose} onValueChange={(v) => setEditForm((p) => ({ ...p, purpose: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PURPOSE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Location</Label>
                <Select value={editForm.location} onValueChange={(v) => setEditForm((p) => ({ ...p, location: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indoor">Indoor</SelectItem>
                    <SelectItem value="outdoor">Outdoor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
              </div>
              <Button type="submit" className="w-full" disabled={editMutation.isPending}>
                {editMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Change Status dialog */}
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-display">Change Status</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); statusMutation.mutate(statusForm); }} className="space-y-4 mt-2">
            <div>
              <Label>Status</Label>
              <Select value={statusForm.status} onValueChange={(v) => setStatusForm((p) => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="empty">Empty</SelectItem>
                  <SelectItem value="in_use">In Use</SelectItem>
                  <SelectItem value="cleaning">Cleaning</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Expected ready (optional)</Label>
              <Input
                type="datetime-local"
                value={statusForm.expected_ready_at}
                onChange={(e) => setStatusForm((p) => ({ ...p, expected_ready_at: e.target.value }))}
              />
            </div>
            <Button type="submit" className="w-full" disabled={statusMutation.isPending}>
              {statusMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <TransferDialog
        key={transferAction}
        tank={tank}
        allTanks={tanksQuery.data || []}
        open={transferOpen}
        onOpenChange={setTransferOpen}
        initialAction={transferAction}
      />
    </div>
  );
}
