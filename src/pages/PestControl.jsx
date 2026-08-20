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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Bug, MapPin, ClipboardList, Trash2, Pencil } from 'lucide-react';
import MobileCard, { MobileCardGrid, MobileDetailRow } from '@/components/shared/MobileCard';
import { format } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

const TRAP_TYPES = ['snap_trap','bait_station','glue_board','live_trap','electronic','fly_screen'];
const ACTIVITIES = ['checked_clear','trapped','reset','rebaited','damaged','removed'];
const ACTIVITY_COLORS = {
  checked_clear: 'bg-emerald-100 text-emerald-800',
  trapped: 'bg-destructive/10 text-destructive',
  reset: 'bg-amber-100 text-amber-800',
  rebaited: 'bg-blue-100 text-blue-800',
  damaged: 'bg-orange-100 text-orange-800',
  removed: 'bg-gray-100 text-gray-600',
};

const BLANK_TRAP = { trap_id: '', trap_type: 'bait_station', location_description: '', location_x: 50, location_y: 50, status: 'active', notes: '' };
const BLANK_LOG = { date: new Date().toISOString().split('T')[0], trap_ids: [], inspected_by: '', activity: 'checked_clear', pest_type: '', quantity: '', bait_used: '', notes: '' };

export default function PestControl() {
  const [trapOpen, setTrapOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [trapForm, setTrapForm] = useState(BLANK_TRAP);
  const [logForm, setLogForm] = useState(BLANK_LOG);
  const [editingTrapId, setEditingTrapId] = useState(null);
  const [draggingTrap, setDraggingTrap] = useState(null);
  const qc = useQueryClient();

  // Fetch floor plan URL from shared AppSettings so all users see it
  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list('key', 100),
  });

  const mapImageUrl = appSettings.find(s => s.key === 'pest_map_image')?.value || null;

  const { data: traps = [] } = useQuery({
    queryKey: ['pestTraps'],
    queryFn: () => base44.entities.PestControlTrap.list('trap_id', 200),
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['pestLogs'],
    queryFn: () => base44.entities.PestControlLog.list('-date', 500),
  });

  const setT = (k, v) => setTrapForm(f => ({ ...f, [k]: v }));
  const setL = (k, v) => setLogForm(f => ({ ...f, [k]: v }));

  const saveTrapMutation = useMutation({
    mutationFn: async (data) => {
      if (editingTrapId) await base44.entities.PestControlTrap.update(editingTrapId, data);
      else await base44.entities.PestControlTrap.create(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pestTraps'] });
      setTrapOpen(false); setEditingTrapId(null); setTrapForm(BLANK_TRAP);
      toast.success('Trap saved');
    },
    onError: (e) => toast.error(e.message || 'Failed to save trap'),
  });

  const saveLogMutation = useMutation({
    mutationFn: async (data) => {
      const { trap_ids, ...baseData } = data;
      const payload = { ...baseData, quantity: baseData.quantity ? parseInt(baseData.quantity) : undefined };
      
      // Create a log entry for each selected trap
      for (const trapId of trap_ids) {
        await base44.entities.PestControlLog.create({ ...payload, trap_id: trapId });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pestLogs'] });
      setLogOpen(false); setLogForm(BLANK_LOG);
      toast.success('Inspections logged');
    },
    onError: (e) => toast.error(e.message || 'Failed to log inspection'),
  });

  const deleteTrapMutation = useMutation({
    mutationFn: (id) => base44.entities.PestControlTrap.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pestTraps'] }),
    onError: (e) => toast.error(e.message || 'Failed to remove trap'),
  });

  const updatePositionMutation = useMutation({
    mutationFn: ({ id, x, y }) => base44.entities.PestControlTrap.update(id, { location_x: x, location_y: y }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pestTraps'] }),
    onError: (e) => toast.error(e.message || 'Failed to update trap position'),
  });

  // Map drag handlers
  const handleMapClick = (e) => {
    if (draggingTrap) {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
      const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
      updatePositionMutation.mutate({ id: draggingTrap, x, y });
      setDraggingTrap(null);
    }
  };

  const trapActivities = logs.filter(l => l.activity === 'trapped').length;
  const activeTraps = traps.filter(t => t.status === 'active').length;

  const trapTypeLabel = (t) => t.replace('_', ' ');

  return (
    <div>
      <PageHeader title="Pest Control" subtitle="Trap map, inspections and bait records">
        <Button variant="outline" onClick={() => { setEditingTrapId(null); setTrapForm(BLANK_TRAP); setTrapOpen(true); }} className="gap-2">
          <MapPin className="w-4 h-4" /> Add Trap
        </Button>
        <Button onClick={() => setLogOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Log Inspection
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Active traps', value: activeTraps },
          { label: 'Total inspections', value: logs.length },
          { label: 'Trapped (all time)', value: trapActivities },
          { label: 'This month', value: logs.filter(l => l.date?.startsWith(new Date().toISOString().slice(0,7))).length },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border p-4 bg-accent border-accent-foreground/10">
            <div className="flex items-center gap-2 mb-1">
              <Bug className="w-4 h-4 text-primary" />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-2xl font-bold font-display text-primary">{value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="map">
        <TabsList className="mb-4">
          <TabsTrigger value="map" className="gap-2"><MapPin className="w-4 h-4" /> Trap map</TabsTrigger>
          <TabsTrigger value="logs" className="gap-2"><ClipboardList className="w-4 h-4" /> Inspection logs</TabsTrigger>
        </TabsList>

        <TabsContent value="map">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium">Click a trap then click the map to reposition it</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {TRAP_TYPES.slice(0,3).map(t => (
                  <span key={t} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                    {trapTypeLabel(t)}
                  </span>
                ))}
              </div>
            </div>

            {/* Map area */}
            <div
              className="relative w-full border border-border rounded-xl overflow-hidden cursor-crosshair"
              style={{ height: '400px', background: mapImageUrl ? 'transparent' : 'var(--color-background-secondary)' }}
              onClick={handleMapClick}
            >
              {mapImageUrl ? (
                <img
                  src={mapImageUrl}
                  alt="Facility floor plan"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
              ) : (
                <>
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none">
                    <p className="text-sm text-muted-foreground/40">{traps.length === 0 ? 'Add traps and drag them to their locations' : 'Blank canvas'}</p>
                    <p className="text-xs text-muted-foreground/30">Upload a floor plan in Settings → Pest Map</p>
                  </div>
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.08 }}>
                    {[20,40,60,80].map(p => (
                      <g key={p}>
                        <line x1={`${p}%`} y1="0" x2={`${p}%`} y2="100%" stroke="currentColor" strokeWidth="1" />
                        <line x1="0" y1={`${p}%`} x2="100%" y2={`${p}%`} stroke="currentColor" strokeWidth="1" />
                      </g>
                    ))}
                  </svg>
                </>
              )}

              {traps.map(trap => (
                <div
                  key={trap.id}
                  className={`absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group ${draggingTrap === trap.id ? 'scale-125' : 'hover:scale-110'} transition-transform`}
                  style={{ left: `${trap.location_x || 50}%`, top: `${trap.location_y || 50}%` }}
                  onClick={e => { e.stopPropagation(); setDraggingTrap(draggingTrap === trap.id ? null : trap.id); }}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm border-2 ${
                    draggingTrap === trap.id ? 'border-primary bg-primary' :
                    trap.status === 'active' ? 'border-emerald-500 bg-emerald-500' :
                    'border-gray-400 bg-gray-400'
                  }`}>
                    {trap.trap_id || '?'}
                  </div>
                  <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                    <div className="bg-background border border-border rounded-lg px-2 py-1.5 shadow-sm text-xs whitespace-nowrap">
                      <p className="font-semibold">{trap.trap_id}</p>
                      <p className="text-muted-foreground">{trapTypeLabel(trap.trap_type)}</p>
                      <p className="text-muted-foreground">{trap.location_description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Trap list */}
            {traps.length > 0 && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {traps.map(trap => (
                  <div key={trap.id} className="flex items-center justify-between p-2.5 rounded-lg border border-border text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${trap.status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`}>
                        {(trap.trap_id || '?').slice(0,2)}
                      </div>
                      <div>
                        <p className="font-medium leading-none">{trap.trap_id}</p>
                        <p className="text-xs text-muted-foreground">{trapTypeLabel(trap.trap_type)} · {trap.location_description}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingTrapId(trap.id); setTrapForm(trap); setTrapOpen(true); }}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => { if (confirm('Remove trap?')) deleteTrapMutation.mutate(trap.id); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card className="overflow-hidden">
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Trap ID</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead>Pest</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Bait used</TableHead>
                    <TableHead>Inspected by</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsLoading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No inspections logged yet</TableCell></TableRow>
                  ) : logs.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm">{l.date ? format(new Date(l.date), 'MMM d, yyyy') : '—'}</TableCell>
                      <TableCell className="text-sm font-mono font-semibold">{l.trap_id || '—'}</TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ACTIVITY_COLORS[l.activity] || 'bg-gray-100 text-gray-600'}`}>
                          {(l.activity || '').replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{l.pest_type || '—'}</TableCell>
                      <TableCell className="text-sm">{l.quantity || '—'}</TableCell>
                      <TableCell className="text-sm">{l.bait_used || '—'}</TableCell>
                      <TableCell className="text-sm">{l.inspected_by || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{l.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <MobileCardGrid>
              {logsLoading ? (
                <p className="text-center py-8 text-muted-foreground text-sm">Loading...</p>
              ) : logs.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">No inspections logged yet</p>
              ) : logs.map(l => (
                <MobileCard
                  key={l.id}
                  title={l.trap_id || '—'}
                  subtitle={l.date ? format(new Date(l.date), 'MMM d, yyyy') : '—'}
                  badge={
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ACTIVITY_COLORS[l.activity] || 'bg-gray-100 text-gray-600'}`}>
                      {(l.activity || '').replace('_', ' ')}
                    </span>
                  }
                >
                  <MobileDetailRow label="Pest" value={l.pest_type || '—'} />
                  <MobileDetailRow label="Quantity" value={l.quantity || '—'} />
                  <MobileDetailRow label="Bait Used" value={l.bait_used || '—'} />
                  <MobileDetailRow label="Inspected by" value={l.inspected_by || '—'} />
                  {l.notes && <MobileDetailRow label="Notes" value={l.notes} />}
                </MobileCard>
              ))}
            </MobileCardGrid>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/edit trap dialog */}
      <Dialog open={trapOpen} onOpenChange={v => { setTrapOpen(v); if (!v) { setEditingTrapId(null); setTrapForm(BLANK_TRAP); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-display">{editingTrapId ? 'Edit' : 'Add'} Trap / Bait Station</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Trap ID</Label>
                <Input value={trapForm.trap_id} onChange={e => setT('trap_id', e.target.value)} placeholder="e.g. T1, BS-03" className="mt-1" />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={trapForm.trap_type} onValueChange={v => setT('trap_type', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{TRAP_TYPES.map(t => <SelectItem key={t} value={t}>{trapTypeLabel(t)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Location description</Label>
              <Input value={trapForm.location_description} onChange={e => setT('location_description', e.target.value)} placeholder="e.g. Near back door, inside warehouse" className="mt-1" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={trapForm.status} onValueChange={v => setT('status', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="removed">Removed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={trapForm.notes} onChange={e => setT('notes', e.target.value)} className="mt-1" rows={2} />
            </div>
            <Button className="w-full" onClick={() => saveTrapMutation.mutate(trapForm)} disabled={saveTrapMutation.isPending || !trapForm.trap_id}>
              {saveTrapMutation.isPending ? 'Saving...' : editingTrapId ? 'Save Changes' : 'Add Trap'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Log inspection dialog */}
      <Dialog open={logOpen} onOpenChange={v => { setLogOpen(v); if (!v) setLogForm(BLANK_LOG); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-display">Log Inspection</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label>Date</Label>
              <Input type="date" value={logForm.date} onChange={e => setL('date', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Traps ({logForm.trap_ids.length} selected)</Label>
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3">
                {traps.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No traps available. Add traps first.</p>
                ) : (
                  traps.map(t => (
                    <div key={t.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`trap-${t.id}`}
                        checked={logForm.trap_ids.includes(t.trap_id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setL('trap_ids', [...logForm.trap_ids, t.trap_id]);
                          } else {
                            setL('trap_ids', logForm.trap_ids.filter(id => id !== t.trap_id));
                          }
                        }}
                        className="rounded border-input"
                      />
                      <label htmlFor={`trap-${t.id}`} className="text-sm cursor-pointer flex-1">
                        <span className="font-medium">{t.trap_id}</span>
                        <span className="text-muted-foreground text-xs block">{t.location_description}</span>
                      </label>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <Label>Activity</Label>
              <Select value={logForm.activity} onValueChange={v => setL('activity', v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{ACTIVITIES.map(a => <SelectItem key={a} value={a}>{a.replace('_', ' ')}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {(logForm.activity === 'trapped') && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Pest type</Label>
                  <Input value={logForm.pest_type} onChange={e => setL('pest_type', e.target.value)} placeholder="e.g. Mouse, Rat" className="mt-1" />
                </div>
                <div>
                  <Label>Quantity</Label>
                  <Input type="number" min="1" value={logForm.quantity} onChange={e => setL('quantity', e.target.value)} className="mt-1" />
                </div>
              </div>
            )}
            {(logForm.activity === 'rebaited') && (
              <div>
                <Label>Bait used</Label>
                <Input value={logForm.bait_used} onChange={e => setL('bait_used', e.target.value)} placeholder="e.g. Ditrac, Contrac" className="mt-1" />
              </div>
            )}
            <div>
              <Label>Inspected by</Label>
              <Input value={logForm.inspected_by} onChange={e => setL('inspected_by', e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={logForm.notes} onChange={e => setL('notes', e.target.value)} className="mt-1" rows={2} />
            </div>
            <Button className="w-full" onClick={() => saveLogMutation.mutate(logForm)} disabled={saveLogMutation.isPending || logForm.trap_ids.length === 0}>
              {saveLogMutation.isPending ? 'Saving...' : 'Log Inspection'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}