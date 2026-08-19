import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Target, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

// Same 7-value category set as WasteTracker.jsx's CATEGORIES — kept as a
// local id/label list here rather than imported, since WasteTracker's own
// list also carries UI-only fields (icon, color, density) this page
// doesn't need. Must stay in sync with WasteTracker.jsx if categories
// there ever change.
const WASTE_CATEGORIES = [
  { id: 'all', label: 'All categories' },
  { id: 'general', label: 'General Waste' },
  { id: 'recycling', label: 'Recycling' },
  { id: 'glass', label: 'Glass' },
  { id: 'cardboard', label: 'Cardboard / Paper' },
  { id: 'organic', label: 'Organic / Food Waste' },
  { id: 'hazardous', label: 'Hazardous' },
  { id: 'other', label: 'Other' },
];

const UTILITY_METRICS = [
  { id: 'electricity_kwh', label: 'Electricity (kWh)', unit: 'kWh' },
  { id: 'water_litres', label: 'Water (litres)', unit: 'L' },
  { id: 'electricity_cost', label: 'Electricity cost ($)', unit: '$' },
  { id: 'water_cost', label: 'Water cost ($)', unit: '$' },
];

const STATUSES = ['in_progress', 'achieved', 'missed', 'on_hold'];
const STATUS_LABELS = { in_progress: 'In Progress', achieved: 'Achieved', missed: 'Missed', on_hold: 'On Hold' };
const STATUS_COLORS = {
  in_progress: 'bg-blue-100 text-blue-700',
  achieved: 'bg-emerald-100 text-emerald-700',
  missed: 'bg-red-100 text-red-700',
  on_hold: 'bg-muted text-muted-foreground',
};

const BLANK_FORM = {
  title: '', description: '', aspect_id: '', metric_source: 'manual',
  waste_category: 'all', waste_unit: 'kg', utility_metric: 'electricity_kwh', unit_label: '',
  baseline_value: '', target_value: '', target_direction: 'at_or_below',
  period_start: '', period_end: '', manual_current_value: '', owner: '', status: 'in_progress',
};

const todayStr = () => new Date().toISOString().split('T')[0];

function unitFor(objective) {
  if (objective.metric_source === 'waste') return objective.waste_unit === 'litres' ? 'L' : 'kg';
  if (objective.metric_source === 'utility') return UTILITY_METRICS.find(m => m.id === objective.utility_metric)?.unit || '';
  return objective.unit_label || '';
}

// Progress toward target as a % (0-100), only meaningful when a baseline
// is set — linear interpolation between baseline and target.
function progressPct(objective, currentValue) {
  if (objective.baseline_value == null) return null;
  const { baseline_value: b, target_value: t } = objective;
  if (b === t) return currentValue === t ? 100 : 0;
  const raw = objective.target_direction === 'at_or_below'
    ? (b - currentValue) / (b - t) * 100
    : (currentValue - b) / (t - b) * 100;
  return Math.max(0, Math.min(100, raw));
}

function metRule(objective, currentValue) {
  return objective.target_direction === 'at_or_below'
    ? currentValue <= objective.target_value
    : currentValue >= objective.target_value;
}

export default function Objectives() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);

  const { data: objectives = [], isLoading } = useQuery({
    queryKey: ['environmentalObjectives'],
    queryFn: () => db.EnvironmentalObjective.list('-created_at', 5000),
  });

  const { data: aspects = [] } = useQuery({
    queryKey: ['environmentalAspects'],
    queryFn: () => db.EnvironmentalAspect.list('-created_at', 5000),
  });
  const aspectById = useMemo(() => new Map(aspects.map(a => [a.id, a])), [aspects]);

  // Same source WasteTracker.jsx reads — one AppSettings row holding every
  // waste record as a JSON array (no dedicated waste table exists).
  const { data: wasteRecords = [] } = useQuery({
    queryKey: ['wasteRecordsForObjectives'],
    queryFn: async () => {
      const rows = await base44.entities.AppSettings.list('key', 5000);
      const row = rows.find(r => r.key === 'waste_records');
      if (!row?.value) return [];
      try { return JSON.parse(row.value); } catch { return []; }
    },
  });

  const { data: utilityLogs = [] } = useQuery({
    queryKey: ['utilityLogsForObjectives'],
    queryFn: () => db.UtilityLog.list('-reading_date', 5000),
  });

  const currentValueFor = (objective) => {
    const windowEnd = objective.period_end < todayStr() ? objective.period_end : todayStr();
    if (objective.metric_source === 'manual') {
      return objective.manual_current_value != null ? Number(objective.manual_current_value) : 0;
    }
    if (objective.metric_source === 'waste') {
      return wasteRecords
        .filter(r => r.date >= objective.period_start && r.date <= windowEnd)
        .filter(r => objective.waste_category === 'all' || r.category === objective.waste_category)
        .reduce((sum, r) => sum + (Number(r[objective.waste_unit]) || 0), 0);
    }
    // utility
    return utilityLogs
      .filter(l => l.reading_date >= objective.period_start && l.reading_date <= windowEnd)
      .reduce((sum, l) => sum + (Number(l[objective.utility_metric]) || 0), 0);
  };

  const createMutation = useMutation({
    mutationFn: () => db.EnvironmentalObjective.create({
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      aspect_id: form.aspect_id || undefined,
      metric_source: form.metric_source,
      waste_category: form.metric_source === 'waste' ? form.waste_category : undefined,
      waste_unit: form.metric_source === 'waste' ? form.waste_unit : undefined,
      utility_metric: form.metric_source === 'utility' ? form.utility_metric : undefined,
      unit_label: form.metric_source === 'manual' ? (form.unit_label.trim() || undefined) : undefined,
      baseline_value: form.baseline_value !== '' ? parseFloat(form.baseline_value) : undefined,
      target_value: parseFloat(form.target_value),
      target_direction: form.target_direction,
      period_start: form.period_start,
      period_end: form.period_end,
      manual_current_value: form.metric_source === 'manual' && form.manual_current_value !== '' ? parseFloat(form.manual_current_value) : undefined,
      owner: form.owner.trim() || undefined,
      status: form.status,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['environmentalObjectives'] });
      setFormOpen(false);
      setForm(BLANK_FORM);
      toast.success('Objective added');
    },
    onError: (e) => toast.error(e.message || 'Failed to add objective'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.EnvironmentalObjective.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['environmentalObjectives'] });
      toast.success('Objective removed');
    },
    onError: (e) => toast.error(e.message || 'Failed to remove objective'),
  });

  const canSubmit = form.title.trim() && form.target_value !== '' && form.period_start && form.period_end
    && (form.metric_source !== 'manual' || form.manual_current_value !== '');

  return (
    <div className="space-y-6">
      <PageHeader title="Objectives & Targets" subtitle="Measurable environmental goals, tracked against live data where possible">
        <Button className="gap-1.5" onClick={() => { setForm(BLANK_FORM); setFormOpen(true); }}>
          <Plus className="w-4 h-4" /> Add Objective
        </Button>
      </PageHeader>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
      ) : objectives.length === 0 ? (
        <Card className="p-10 text-center space-y-3">
          <Target className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">No objectives yet — add one to start tracking progress toward a goal.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {objectives.map(o => {
            const current = currentValueFor(o);
            const pct = progressPct(o, current);
            const unit = unitFor(o);
            const met = metRule(o, current);
            const aspect = o.aspect_id ? aspectById.get(o.aspect_id) : null;
            return (
              <Card key={o.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{o.title}</CardTitle>
                    {o.description && <CardDescription>{o.description}</CardDescription>}
                  </div>
                  <button onClick={() => deleteMutation.mutate(o.id)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={STATUS_COLORS[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                    <Badge variant="secondary" className="text-xs capitalize">{o.metric_source}</Badge>
                    {aspect && <Badge variant="outline" className="text-xs">{aspect.aspect}</Badge>}
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Current</span>
                    <span className="font-semibold">{current.toLocaleString(undefined, { maximumFractionDigits: 2 })} {unit}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Target ({o.target_direction === 'at_or_below' ? '≤' : '≥'})</span>
                    <span className="font-semibold">{Number(o.target_value).toLocaleString(undefined, { maximumFractionDigits: 2 })} {unit}</span>
                  </div>

                  {pct != null ? (
                    <div className="space-y-1">
                      <Progress value={pct} className={met ? '[&>div]:bg-emerald-500' : ''} />
                      <p className="text-xs text-muted-foreground text-right">{pct.toFixed(0)}% of the way to target</p>
                    </div>
                  ) : (
                    <p className={`text-xs font-medium ${met ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {met ? '✅ Target met' : '⏳ Target not yet met'} (no baseline set, showing raw comparison)
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground pt-2 border-t border-border">
                    {o.period_start} → {o.period_end}{o.owner ? ` · ${o.owner}` : ''}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">Add Objective</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Reduce glass waste 10%" />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">Related aspect (optional)</Label>
              <Select value={form.aspect_id || 'none'} onValueChange={v => setForm(f => ({ ...f, aspect_id: v === 'none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {aspects.map(a => <SelectItem key={a.id} value={a.id}>{a.aspect}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Track progress from</Label>
              <Select value={form.metric_source} onValueChange={v => setForm(f => ({ ...f, metric_source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="waste">Waste Tracker</SelectItem>
                  <SelectItem value="utility">Utility Tracker</SelectItem>
                  <SelectItem value="manual">Manual entry</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.metric_source === 'waste' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Waste category</Label>
                  <Select value={form.waste_category} onValueChange={v => setForm(f => ({ ...f, waste_category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {WASTE_CATEGORIES.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Unit</Label>
                  <Select value={form.waste_unit} onValueChange={v => setForm(f => ({ ...f, waste_unit: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="litres">litres</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {form.metric_source === 'utility' && (
              <div>
                <Label className="text-xs">Utility metric</Label>
                <Select value={form.utility_metric} onValueChange={v => setForm(f => ({ ...f, utility_metric: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UTILITY_METRICS.map(m => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.metric_source === 'manual' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Unit label</Label>
                  <Input value={form.unit_label} onChange={e => setForm(f => ({ ...f, unit_label: e.target.value }))} placeholder="e.g. kg, %, kWh" />
                </div>
                <div>
                  <Label className="text-xs">Current value</Label>
                  <Input type="number" step="any" value={form.manual_current_value} onChange={e => setForm(f => ({ ...f, manual_current_value: e.target.value }))} />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Baseline (optional)</Label>
                <Input type="number" step="any" value={form.baseline_value} onChange={e => setForm(f => ({ ...f, baseline_value: e.target.value }))} placeholder="Starting point" />
              </div>
              <div>
                <Label className="text-xs">Target value</Label>
                <Input type="number" step="any" value={form.target_value} onChange={e => setForm(f => ({ ...f, target_value: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Direction</Label>
                <Select value={form.target_direction} onValueChange={v => setForm(f => ({ ...f, target_direction: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="at_or_below">Reduce to at or below target</SelectItem>
                    <SelectItem value="at_or_above">Increase to at or above target</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Period start</Label>
                <Input type="date" value={form.period_start} onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Period end</Label>
                <Input type="date" value={form.period_end} onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Owner</Label>
                <Input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} />
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

            <Button className="w-full" disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? 'Saving...' : 'Add Objective'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
