import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CalendarDays, Plus, Pencil, Trash2, Flame, Droplets, Wine, Cylinder, AlertTriangle, Link2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import StatCard from '@/components/shared/StatCard';

const RUN_TYPES = [
  { id: 'distillation', label: 'Distillation', icon: Flame },
  { id: 'sns_distillation', label: 'SNS Distillation', icon: Flame },
  { id: 'dilution', label: 'Dilution', icon: Droplets },
  { id: 'bottling', label: 'Bottling', icon: Wine },
];
const runTypeInfo = (id) => RUN_TYPES.find(t => t.id === id) || RUN_TYPES[0];

// Linking a plan to the real record it became (see "Link to actual run"
// below) lets the planner show what's really going on - that record's own
// status - instead of just the plan's own coarse
// planned/in_progress/completed state. Each real run table has a different
// shape (only distillation_run and
// bottling_run have product_name; sns_run has neither a batch_number nor a
// product_name) - this builds one identifying line per type rather than
// assuming a common shape.
function runSummary(runType, run) {
  if (!run) return '';
  const parts = [];
  if (run.batch_number) parts.push(run.batch_number);
  else if (runType === 'sns_distillation') parts.push('SNS Run');
  if (run.product_name) parts.push(run.product_name);
  if (run.date) parts.push(run.date);
  return parts.join(' · ');
}

const STATUSES = ['planned', 'in_progress', 'completed', 'cancelled'];
const STATUS_LABELS = { planned: 'Planned', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' };
const STATUS_COLORS = {
  planned: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-muted text-muted-foreground',
};
// Only these statuses reserve a tank for conflict-checking purposes -
// a completed or cancelled entry no longer occupies anything.
const OCCUPYING_STATUSES = new Set(['planned', 'in_progress']);

const todayStr = () => new Date().toISOString().split('T')[0];
const endOf = (plan) => plan.planned_end_date || plan.planned_date;
// Two inclusive date ranges overlap when each starts on or before the
// other's end.
const rangesOverlap = (aStart, aEnd, bStart, bEnd) => aStart <= bEnd && bStart <= aEnd;

const BLANK_FORM = {
  run_type: 'distillation', title: '', product_name: '', tank_id: '',
  planned_date: todayStr(), planned_end_date: '', status: 'planned',
  notes: '', created_by: '',
};

export default function ProductionPlanner() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [typeFilter, setTypeFilter] = useState('all');
  const [showAll, setShowAll] = useState(false); // false = hide completed/cancelled

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['productionPlans'],
    queryFn: () => db.ProductionPlan.list('planned_date', 5000),
  });

  const { data: tanks = [] } = useQuery({
    queryKey: ['storageTanksForPlanner'],
    queryFn: () => db.StorageTank.list('name', 5000),
  });
  const tankById = useMemo(() => new Map(tanks.map(t => [t.id, t])), [tanks]);

  // Real run records, one query per type (hooks can't be called in a loop,
  // hence four separate useQuery calls rather than mapping over RUN_TYPES)
  // - used both to look up a linked plan's actual current status and to
  // populate the "pick a run" list in the link dialog. Counts are modest
  // (a few hundred rows each at most) so fetching all of each is fine.
  const { data: distillationRuns = [] } = useQuery({ queryKey: ['runsForPlanner', 'distillation'], queryFn: () => db.DistillationRun.list('-date', 1000) });
  const { data: snsRuns = [] } = useQuery({ queryKey: ['runsForPlanner', 'sns_distillation'], queryFn: () => db.SNSRun.list('-date', 1000) });
  const { data: dilutionRuns = [] } = useQuery({ queryKey: ['runsForPlanner', 'dilution'], queryFn: () => db.Dilution.list('-date', 1000) });
  const { data: bottlingRuns = [] } = useQuery({ queryKey: ['runsForPlanner', 'bottling'], queryFn: () => db.BottlingRun.list('-date', 1000) });
  const runsByType = {
    distillation: distillationRuns, sns_distillation: snsRuns,
    dilution: dilutionRuns, bottling: bottlingRuns,
  };
  const runById = useMemo(() => {
    const map = new Map();
    for (const t of RUN_TYPES) for (const r of runsByType[t.id]) map.set(r.id, { ...r, run_type: t.id });
    return map;
  }, [distillationRuns, snsRuns, dilutionRuns, bottlingRuns]);

  const [linkTarget, setLinkTarget] = useState(null); // plan being linked, or null

  const createMutation = useMutation({
    mutationFn: (payload) => db.ProductionPlan.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productionPlans'] });
      setFormOpen(false);
      toast.success('Run added to schedule');
    },
    onError: (e) => toast.error(e.message || 'Failed to add planned run'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => db.ProductionPlan.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productionPlans'] });
      setFormOpen(false);
      setEditingPlan(null);
      toast.success('Updated');
    },
    onError: (e) => toast.error(e.message || 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.ProductionPlan.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productionPlans'] });
      toast.success('Removed from schedule');
    },
    onError: (e) => toast.error(e.message || 'Failed to remove'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => db.ProductionPlan.update(id, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productionPlans'] }); },
    onError: (e) => toast.error(e.message || 'Failed to update status'),
  });

  // Linking to the real run also bumps the plan to in_progress (unless
  // it's already completed/cancelled) - the whole point of linking is that
  // the run has actually started, so leaving it sitting at "planned" would
  // be misleading now that there's a real record.
  const linkMutation = useMutation({
    mutationFn: ({ plan, run }) => db.ProductionPlan.update(plan.id, {
      linked_run_id: run.id,
      linked_run_type: plan.run_type,
      status: (plan.status === 'completed' || plan.status === 'cancelled') ? plan.status : 'in_progress',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productionPlans'] });
      setLinkTarget(null);
      toast.success('Linked to actual run');
    },
    onError: (e) => toast.error(e.message || 'Failed to link'),
  });

  const unlinkMutation = useMutation({
    mutationFn: (planId) => db.ProductionPlan.update(planId, { linked_run_id: null, linked_run_type: null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['productionPlans'] }); },
    onError: (e) => toast.error(e.message || 'Failed to unlink'),
  });

  const openAdd = () => { setEditingPlan(null); setForm(BLANK_FORM); setFormOpen(true); };
  const openEdit = (plan) => {
    setEditingPlan(plan);
    setForm({
      run_type: plan.run_type, title: plan.title, product_name: plan.product_name || '',
      tank_id: plan.tank_id || '', planned_date: plan.planned_date,
      planned_end_date: plan.planned_end_date || '', status: plan.status,
      notes: plan.notes || '', created_by: plan.created_by || '',
    });
    setFormOpen(true);
  };

  const handleSubmit = () => {
    const payload = {
      run_type: form.run_type,
      title: form.title.trim(),
      product_name: form.product_name.trim() || undefined,
      tank_id: form.tank_id || undefined,
      planned_date: form.planned_date,
      planned_end_date: form.planned_end_date || form.planned_date,
      status: form.status,
      notes: form.notes.trim() || undefined,
      created_by: form.created_by.trim() || undefined,
    };
    if (editingPlan) updateMutation.mutate({ id: editingPlan.id, payload });
    else createMutation.mutate(payload);
  };

  // Other plans booking the same tank, for the conflict warning in the
  // dialog - excludes the entry being edited and anything that's no
  // longer occupying the tank (completed/cancelled).
  const tankConflicts = useMemo(() => {
    if (!form.tank_id) return [];
    const start = form.planned_date;
    const end = form.planned_end_date || form.planned_date;
    if (!start) return [];
    return plans.filter(p =>
      p.tank_id === form.tank_id &&
      p.id !== editingPlan?.id &&
      OCCUPYING_STATUSES.has(p.status) &&
      rangesOverlap(start, end, p.planned_date, endOf(p))
    );
  }, [plans, form.tank_id, form.planned_date, form.planned_end_date, editingPlan]);

  const filtered = useMemo(() => plans
    .filter(p => typeFilter === 'all' || p.run_type === typeFilter)
    .filter(p => showAll || OCCUPYING_STATUSES.has(p.status)),
    [plans, typeFilter, showAll]
  );

  const counts = useMemo(() => {
    const c = { planned: 0, in_progress: 0, completedThisMonth: 0 };
    const now = new Date();
    for (const p of plans) {
      if (p.status === 'planned') c.planned++;
      else if (p.status === 'in_progress') c.in_progress++;
      else if (p.status === 'completed') {
        const d = new Date(p.planned_date);
        if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) c.completedThisMonth++;
      }
    }
    return c;
  }, [plans]);

  // Nearest upcoming (or current) occupying booking per tank, for the
  // availability strip - lets someone see "is Tank 3 free" at a glance
  // without cross-referencing the table below.
  const nextBookingByTank = useMemo(() => {
    const today = todayStr();
    const map = new Map();
    for (const p of plans) {
      if (!p.tank_id || !OCCUPYING_STATUSES.has(p.status)) continue;
      if (endOf(p) < today) continue; // already finished its window
      const current = map.get(p.tank_id);
      if (!current || p.planned_date < current.planned_date) map.set(p.tank_id, p);
    }
    return map;
  }, [plans]);

  const canSubmit = form.title.trim() && form.planned_date;

  return (
    <div className="space-y-6">
      <PageHeader title="Production Planner" subtitle="Schedule upcoming distillation, dilution, and bottling runs against tank availability">
        <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Plan a Run</Button>
      </PageHeader>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard title="Planned" value={counts.planned} icon={CalendarDays} tone="info" />
        <StatCard title="In Progress" value={counts.in_progress} icon={Flame} tone="warning" />
        <StatCard title="Completed this month" value={counts.completedThisMonth} icon={Wine} tone="success" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Cylinder className="w-4 h-4" /> Tank availability</CardTitle>
          <CardDescription>What's actually in each tank right now, plus the nearest upcoming booking</CardDescription>
        </CardHeader>
        <CardContent>
          {tanks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tanks set up yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {tanks.map(tank => {
                const booking = nextBookingByTank.get(tank.id);
                const liveInUse = tank.status === 'in_use';
                return (
                  <div key={tank.id} className="rounded-lg border border-border p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{tank.name}</p>
                      {tank.status && tank.status !== 'empty' && (
                        <Badge variant={liveInUse ? 'default' : 'secondary'} className="text-[10px] shrink-0 capitalize">
                          {tank.status.replace('_', ' ')}
                        </Badge>
                      )}
                    </div>
                    {liveInUse && (
                      <p className="text-xs text-foreground truncate">
                        Now: {tank.current_product || 'Unlabelled contents'}{tank.current_batch ? ` · ${tank.current_batch}` : ''}
                      </p>
                    )}
                    {booking ? (
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground truncate">
                          Next: {booking.title} · {booking.planned_date}{endOf(booking) !== booking.planned_date ? ` – ${endOf(booking)}` : ''}
                        </p>
                        <Badge className={`text-[10px] shrink-0 ${STATUS_COLORS[booking.status]}`}>{STATUS_LABELS[booking.status]}</Badge>
                      </div>
                    ) : !liveInUse && (
                      <p className="text-xs text-emerald-600">Free — nothing scheduled</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="flex items-center gap-2"><CalendarDays className="w-4 h-4" /> Schedule</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {RUN_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant={showAll ? 'default' : 'outline'} size="sm" onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Hide completed/cancelled' : 'Show all'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Nothing scheduled — plan a run above.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dates</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Run</TableHead>
                    <TableHead>Tank</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(p => {
                    const type = runTypeInfo(p.run_type);
                    const linkedRun = p.linked_run_id ? runById.get(p.linked_run_id) : null;
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {p.planned_date}{endOf(p) !== p.planned_date ? ` – ${endOf(p)}` : ''}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs gap-1"><type.icon className="w-3 h-3" />{type.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <p className="font-medium">{p.title}</p>
                          {p.product_name && <p className="text-xs text-muted-foreground">{p.product_name}</p>}
                          {p.linked_run_id ? (
                            linkedRun ? (
                              <p className="text-xs text-emerald-700 mt-0.5">
                                Actual: {runSummary(p.run_type, linkedRun)} — <span className="capitalize">{linkedRun.status?.replace('_', ' ')}</span>
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground mt-0.5">Linked run no longer found</p>
                            )
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.tank_id ? (tankById.get(p.tank_id)?.name || '—') : '—'}</TableCell>
                        <TableCell>
                          <Select value={p.status} onValueChange={(status) => statusMutation.mutate({ id: p.id, status })}>
                            <SelectTrigger className="w-36 h-8 text-xs">
                              <Badge className={`text-xs ${STATUS_COLORS[p.status]}`}>{STATUS_LABELS[p.status]}</Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1.5 justify-end">
                            {p.linked_run_id ? (
                              <button onClick={() => unlinkMutation.mutate(p.id)} title="Unlink actual run" className="text-muted-foreground hover:text-foreground transition-colors">
                                <Unlink className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <button onClick={() => setLinkTarget(p)} title="Link to actual run" className="text-muted-foreground hover:text-primary transition-colors">
                                <Link2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => openEdit(p)} className="text-muted-foreground hover:text-foreground transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => { if (confirm('Remove this planned run?')) deleteMutation.mutate(p.id); }} className="text-muted-foreground hover:text-destructive transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) setEditingPlan(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">{editingPlan ? 'Edit Planned Run' : 'Plan a Run'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Run type</Label>
                <Select value={form.run_type} onValueChange={v => setForm(f => ({ ...f, run_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RUN_TYPES.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Gin Batch 47" />
            </div>
            <div>
              <Label className="text-xs">Product (optional)</Label>
              <Input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} placeholder="e.g. London Dry Gin 700ml" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start date</Label>
                <Input type="date" value={form.planned_date} onChange={e => setForm(f => ({ ...f, planned_date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">End date (optional)</Label>
                <Input type="date" value={form.planned_end_date} onChange={e => setForm(f => ({ ...f, planned_end_date: e.target.value }))} min={form.planned_date} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Tank (optional)</Label>
              <Select value={form.tank_id || 'none'} onValueChange={v => setForm(f => ({ ...f, tank_id: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {tanks.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {tankConflicts.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Tank already booked over this period:</p>
                  {tankConflicts.map(c => (
                    <p key={c.id}>{c.title} ({c.planned_date}{endOf(c) !== c.planned_date ? ` – ${endOf(c)}` : ''})</p>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Planned by</Label>
                <Input value={form.created_by} onChange={e => setForm(f => ({ ...f, created_by: e.target.value }))} placeholder="Your name" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <Button className="w-full" disabled={!canSubmit || createMutation.isPending || updateMutation.isPending} onClick={handleSubmit}>
              {(createMutation.isPending || updateMutation.isPending) ? 'Saving...' : editingPlan ? 'Save Changes' : 'Plan Run'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linkTarget} onOpenChange={(v) => !v && setLinkTarget(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Link to Actual Run</DialogTitle>
          </DialogHeader>
          {linkTarget && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Pick the real {runTypeInfo(linkTarget.run_type).label.toLowerCase()} record for "{linkTarget.title}".
              </p>
              {(runsByType[linkTarget.run_type] || []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No {runTypeInfo(linkTarget.run_type).label.toLowerCase()} records found yet.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-96 overflow-y-auto">
                  {(runsByType[linkTarget.run_type] || []).slice(0, 40).map(run => (
                    <button
                      key={run.id}
                      onClick={() => linkMutation.mutate({ plan: linkTarget, run })}
                      disabled={linkMutation.isPending}
                      className="w-full flex items-center justify-between gap-2 rounded-lg border border-border p-2.5 text-left hover:border-primary/50 hover:bg-muted/50 transition-colors"
                    >
                      <span className="text-sm">{runSummary(linkTarget.run_type, run)}</span>
                      <Badge variant="secondary" className="text-xs capitalize shrink-0">{run.status?.replace('_', ' ')}</Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
