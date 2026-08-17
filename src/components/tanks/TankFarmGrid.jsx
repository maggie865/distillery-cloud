import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import TankCard from '@/components/tanks/TankCard';
import TransferDialog from '@/components/tanks/TransferDialog';

// All known purposes — new tanks will auto-appear in the correct group via their purpose field
const GROUP_ORDER = ['maceration_dilution', 'diluted_ethanol', 'final_product_storage', 'ibc', 'sns', 'spare'];
const GROUP_LABELS = {
  maceration_dilution: 'Maceration & Dilution Tanks',
  final_product_storage: 'Final Product Holding Tanks',
  diluted_ethanol: 'Diluted Ethanol Tanks (Outdoor)',
  ibc: 'IBC — Heads & Tails',
  sns: 'SNS Distillation',
  spare: 'Spare',
};

const BLANK_TANK = {
  name: '',
  capacity_litres: '',
  purpose: 'final_product_storage',
  location: 'indoor',
  notes: '',
};

export const PURPOSE_OPTIONS = [
  { value: 'final_product_storage', label: 'Final Product Storage (A, B, C, D type)' },
  { value: 'maceration_dilution', label: 'Maceration & Dilution (E, F, H type)' },
  { value: 'diluted_ethanol', label: 'Diluted Ethanol Outdoor (X, Y type)' },
  { value: 'ibc', label: 'IBC — Heads & Tails' },
  { value: 'sns', label: 'SNS Distillation Destination' },
  { value: 'spare', label: 'Spare' },
];

/**
 * The tank listing + add/edit/delete UI shared by the standalone Tanks page
 * (/tanks) and Settings > Distillery > Tanks & Equipment — one real
 * implementation, two entry points, per the "don't duplicate, move existing
 * functionality into the right place" redesign goal.
 */
export default function TankFarmGrid({ allowDelete = false }) {
  const [selectedTank, setSelectedTank] = useState(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newTank, setNewTank] = useState(BLANK_TANK);
  const [editTank, setEditTank] = useState(null);
  const queryClient = useQueryClient();

  const { data: tanks = [], isLoading: tanksLoading } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => db.StorageTank.list('name', 5000),
  });

  const addMutation = useMutation({
    mutationFn: (data) => db.StorageTank.create({
      name: data.name.toUpperCase(),
      capacity_litres: parseFloat(data.capacity_litres),
      purpose: data.purpose,
      location: data.location,
      status: 'empty',
      notes: data.notes,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      setAddOpen(false);
      setNewTank(BLANK_TANK);
      toast.success('Tank added — it will now appear in all relevant dropdowns');
    },
    onError: (err) => toast.error(err.message || 'Failed to add tank'),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, data }) => db.StorageTank.update(id, {
      name: data.name.toUpperCase(),
      capacity_litres: parseFloat(data.capacity_litres),
      purpose: data.purpose,
      location: data.location,
      notes: data.notes,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      setEditTank(null);
      toast.success('Tank updated');
    },
    onError: (err) => toast.error(err.message || 'Failed to update tank'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.StorageTank.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['storageTanks'] });
      toast.success('Tank deleted');
    },
    onError: (e) => toast.error('Failed to delete: ' + e.message),
  });

  const handleTransfer = (tank) => {
    setSelectedTank(tank);
    setTransferOpen(true);
  };

  // Group tanks by purpose
  const grouped = GROUP_ORDER.reduce((acc, key) => {
    const group = tanks.filter(t => t.purpose === key);
    if (group.length > 0) acc[key] = group;
    return acc;
  }, {});

  // Summary stats
  const totalLitres = tanks.reduce((s, t) => s + (t.current_volume || 0), 0);
  const inUseTanks = tanks.filter(t => t.status === 'in_use').length;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Tanks</h2>
          <p className="text-sm text-muted-foreground">{tanks.length} tank{tanks.length !== 1 ? 's' : ''}</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" />Add Tank</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display">Add New Tank</DialogTitle>
            </DialogHeader>
            <form onSubmit={e => { e.preventDefault(); addMutation.mutate(newTank); }} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tank Name / Letter</Label>
                  <Input
                    value={newTank.name}
                    onChange={e => setNewTank(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. G"
                    required
                  />
                </div>
                <div>
                  <Label>Capacity (litres)</Label>
                  <Input
                    type="number" step="1"
                    value={newTank.capacity_litres}
                    onChange={e => setNewTank(p => ({ ...p, capacity_litres: e.target.value }))}
                    placeholder="e.g. 500"
                    required
                  />
                </div>
              </div>
              <div>
                <Label>Tank Type / Purpose</Label>
                <Select value={newTank.purpose} onValueChange={v => setNewTank(p => ({ ...p, purpose: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PURPOSE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  This determines which dropdowns the tank appears in across the app.
                </p>
              </div>
              <div>
                <Label>Location</Label>
                <Select value={newTank.location} onValueChange={v => setNewTank(p => ({ ...p, location: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indoor">Indoor</SelectItem>
                    <SelectItem value="outdoor">Outdoor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Input value={newTank.notes} onChange={e => setNewTank(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
              </div>
              <Button type="submit" className="w-full" disabled={addMutation.isPending}>
                {addMutation.isPending ? 'Adding...' : 'Add Tank'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
          <span className="text-muted-foreground">Total tanks: </span>
          <span className="font-semibold">{tanks.length}</span>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
          <span className="text-muted-foreground">In use: </span>
          <span className="font-semibold text-emerald-600">{inUseTanks}</span>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-2 text-sm">
          <span className="text-muted-foreground">Total volume: </span>
          <span className="font-semibold">{totalLitres.toFixed(0)}L</span>
        </div>
      </div>

      {tanksLoading ? (
        <p className="text-center py-16 text-muted-foreground text-sm">Loading tanks...</p>
      ) : (
        <div className="space-y-8">
          {Object.entries(grouped).map(([group, groupTanks]) => (
            <div key={group}>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                {GROUP_LABELS[group]}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                 {groupTanks.map(tank => (
                   <div key={tank.id} className="relative group">
                     <TankCard tank={tank} onTransfer={handleTransfer} />
                     <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button
                         onClick={() => setEditTank({ ...tank, capacity_litres: tank.capacity_litres ?? '' })}
                         className="bg-white/90 hover:bg-white rounded-md p-1.5 shadow-sm border border-border"
                         title="Edit tank"
                       >
                         <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                       </button>
                       {allowDelete && (
                         <button
                           onClick={() => { if (confirm(`Delete Tank ${tank.name}? This cannot be undone.`)) deleteMutation.mutate(tank.id); }}
                           className="bg-white/90 hover:bg-white rounded-md p-1.5 shadow-sm border border-border"
                           title="Delete tank"
                         >
                           <Trash2 className="w-3.5 h-3.5 text-destructive" />
                         </button>
                       )}
                     </div>
                   </div>
                 ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedTank && (
        <TransferDialog
          tank={selectedTank}
          allTanks={tanks}
          open={transferOpen}
          onOpenChange={setTransferOpen}
        />
      )}

      {/* Edit Tank Dialog */}
      <Dialog open={!!editTank} onOpenChange={open => { if (!open) setEditTank(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Edit Tank {editTank?.name}</DialogTitle>
          </DialogHeader>
          {editTank && (
            <form
              onSubmit={e => { e.preventDefault(); editMutation.mutate({ id: editTank.id, data: editTank }); }}
              className="space-y-4 mt-2"
            >
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tank Name / Letter</Label>
                  <Input
                    value={editTank.name}
                    onChange={e => setEditTank(p => ({ ...p, name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <Label>Capacity (litres)</Label>
                  <Input
                    type="number" step="1"
                    value={editTank.capacity_litres}
                    onChange={e => setEditTank(p => ({ ...p, capacity_litres: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div>
                <Label>Tank Type / Purpose</Label>
                <Select value={editTank.purpose} onValueChange={v => setEditTank(p => ({ ...p, purpose: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PURPOSE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Changing purpose will update which dropdowns this tank appears in across the app.
                </p>
              </div>
              <div>
                <Label>Location</Label>
                <Select value={editTank.location} onValueChange={v => setEditTank(p => ({ ...p, location: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indoor">Indoor</SelectItem>
                    <SelectItem value="outdoor">Outdoor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Input
                  value={editTank.notes || ''}
                  onChange={e => setEditTank(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <Button type="submit" className="w-full" disabled={editMutation.isPending}>
                {editMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
