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
import { FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

const LIFECYCLE_STAGES = [
  { value: 'raw_materials', label: 'Raw Materials' },
  { value: 'production', label: 'Production' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'distribution', label: 'Distribution' },
  { value: 'disposal', label: 'Disposal' },
];
const LIFECYCLE_LABEL = Object.fromEntries(LIFECYCLE_STAGES.map(s => [s.value, s.label]));

const CONDITIONS = ['normal', 'abnormal', 'emergency'];
const SCORES = [1, 2, 3, 4, 5];

const BLANK_ASPECT = {
  activity: '', aspect: '', impact: '', lifecycle_stage: 'production', condition: 'normal',
  likelihood: '', severity: '', existing_controls: '', legal_requirement: '', owner: '',
  review_date: '', notes: '',
};

const BLANK_POLICY = { content: '', approved_by: '', approved_date: '', next_review_date: '' };

function significanceBadge(significance) {
  if (significance >= 15) return <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Significant ({significance})</Badge>;
  if (significance >= 8) return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Moderate ({significance})</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Low ({significance})</Badge>;
}

// ── Environmental Policy card ─────────────────────────────────────────────────
function PolicyCard() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(BLANK_POLICY);

  const { data: policies = [] } = useQuery({
    queryKey: ['environmentalPolicy'],
    queryFn: () => db.EnvironmentalPolicy.list('-created_at', 1),
  });
  const policy = policies[0] || null;

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        content: form.content.trim(),
        approved_by: form.approved_by.trim() || undefined,
        approved_date: form.approved_date || undefined,
        next_review_date: form.next_review_date || undefined,
      };
      return policy ? db.EnvironmentalPolicy.update(policy.id, payload) : db.EnvironmentalPolicy.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['environmentalPolicy'] });
      setEditing(false);
      toast.success('Environmental policy saved');
    },
    onError: (e) => toast.error(e.message || 'Failed to save policy'),
  });

  const openEdit = () => {
    setForm(policy
      ? { content: policy.content || '', approved_by: policy.approved_by || '', approved_date: policy.approved_date || '', next_review_date: policy.next_review_date || '' }
      : BLANK_POLICY);
    setEditing(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2"><FileText className="w-4 h-4" /> Environmental Policy</CardTitle>
          <CardDescription>Our commitment statement for environmental management</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={openEdit} className="gap-1.5 shrink-0">
          <Pencil className="w-3.5 h-3.5" /> {policy ? 'Edit' : 'Set Policy'}
        </Button>
      </CardHeader>
      <CardContent>
        {policy ? (
          <div className="space-y-2">
            <p className="text-sm whitespace-pre-wrap">{policy.content}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-2 border-t border-border">
              {policy.approved_by && <span>Approved by {policy.approved_by}</span>}
              {policy.approved_date && <span>Approved {policy.approved_date}</span>}
              {policy.next_review_date && <span>Next review {policy.next_review_date}</span>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No environmental policy has been set yet.</p>
        )}
      </CardContent>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="font-display">Environmental Policy</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Policy statement</Label>
              <Textarea rows={8} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} placeholder="Our commitment to..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Approved by</Label>
                <Input value={form.approved_by} onChange={e => setForm(f => ({ ...f, approved_by: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Approved date</Label>
                <Input type="date" value={form.approved_date} onChange={e => setForm(f => ({ ...f, approved_date: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Next review date</Label>
                <Input type="date" value={form.next_review_date} onChange={e => setForm(f => ({ ...f, next_review_date: e.target.value }))} />
              </div>
            </div>
            <Button className="w-full" disabled={!form.content.trim() || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? 'Saving...' : 'Save Policy'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Aspects & Impacts Register ────────────────────────────────────────────────
function AspectsTable() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(BLANK_ASPECT);
  const [stageFilter, setStageFilter] = useState('all');

  const { data: aspects = [], isLoading } = useQuery({
    queryKey: ['environmentalAspects'],
    queryFn: () => db.EnvironmentalAspect.list('-created_at', 5000),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const likelihood = parseInt(form.likelihood, 10);
      const severity = parseInt(form.severity, 10);
      const significance = likelihood * severity;
      return db.EnvironmentalAspect.create({
        activity: form.activity.trim(),
        aspect: form.aspect.trim(),
        impact: form.impact.trim(),
        lifecycle_stage: form.lifecycle_stage,
        condition: form.condition,
        likelihood,
        severity,
        significance,
        is_significant: significance >= 15,
        existing_controls: form.existing_controls.trim() || undefined,
        legal_requirement: form.legal_requirement.trim() || undefined,
        owner: form.owner.trim() || undefined,
        review_date: form.review_date || undefined,
        notes: form.notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['environmentalAspects'] });
      setFormOpen(false);
      setForm(BLANK_ASPECT);
      toast.success('Aspect added to register');
    },
    onError: (e) => toast.error(e.message || 'Failed to add aspect'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.EnvironmentalAspect.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['environmentalAspects'] });
      toast.success('Aspect removed');
    },
    onError: (e) => toast.error(e.message || 'Failed to remove aspect'),
  });

  const filtered = useMemo(
    () => stageFilter === 'all' ? aspects : aspects.filter(a => a.lifecycle_stage === stageFilter),
    [aspects, stageFilter]
  );

  const canSubmit = form.activity.trim() && form.aspect.trim() && form.impact.trim() && form.likelihood && form.severity;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div>
          <CardTitle>Aspects & Impacts Register</CardTitle>
          <CardDescription>What our activities do to the environment, and how significant it is</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {LIFECYCLE_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="gap-1.5" onClick={() => { setForm(BLANK_ASPECT); setFormOpen(true); }}>
            <Plus className="w-4 h-4" /> Add Aspect
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No aspects recorded yet — add the first one above.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Activity</TableHead>
                  <TableHead>Aspect</TableHead>
                  <TableHead>Impact</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Significance</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium text-sm">{a.activity}</TableCell>
                    <TableCell className="text-sm">{a.aspect}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.impact}</TableCell>
                    <TableCell><Badge variant="secondary" className="text-xs">{LIFECYCLE_LABEL[a.lifecycle_stage] || a.lifecycle_stage}</Badge></TableCell>
                    <TableCell>{significanceBadge(a.significance)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.owner || '—'}</TableCell>
                    <TableCell>
                      <button onClick={() => deleteMutation.mutate(a.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">Add Aspect</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Activity / process</Label>
              <Input value={form.activity} onChange={e => setForm(f => ({ ...f, activity: e.target.value }))} placeholder="e.g. Column distillation" />
            </div>
            <div>
              <Label className="text-xs">Aspect</Label>
              <Input value={form.aspect} onChange={e => setForm(f => ({ ...f, aspect: e.target.value }))} placeholder="e.g. Ethanol vapour emissions" />
            </div>
            <div>
              <Label className="text-xs">Impact</Label>
              <Input value={form.impact} onChange={e => setForm(f => ({ ...f, impact: e.target.value }))} placeholder="e.g. Air emissions" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Lifecycle stage</Label>
                <Select value={form.lifecycle_stage} onValueChange={v => setForm(f => ({ ...f, lifecycle_stage: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LIFECYCLE_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Condition</Label>
                <Select value={form.condition} onValueChange={v => setForm(f => ({ ...f, condition: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONDITIONS.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Likelihood (1-5)</Label>
                <Select value={form.likelihood ? String(form.likelihood) : ''} onValueChange={v => setForm(f => ({ ...f, likelihood: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {SCORES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Severity (1-5)</Label>
                <Select value={form.severity ? String(form.severity) : ''} onValueChange={v => setForm(f => ({ ...f, severity: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    {SCORES.map(s => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.likelihood && form.severity && (
              <div className="rounded-lg bg-muted/40 px-3 py-2 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Significance</span>
                {significanceBadge(parseInt(form.likelihood, 10) * parseInt(form.severity, 10))}
              </div>
            )}
            <div>
              <Label className="text-xs">Existing controls</Label>
              <Textarea rows={2} value={form.existing_controls} onChange={e => setForm(f => ({ ...f, existing_controls: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Legal requirement</Label>
                <Input value={form.legal_requirement} onChange={e => setForm(f => ({ ...f, legal_requirement: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Owner</Label>
                <Input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Review date</Label>
                <Input type="date" value={form.review_date} onChange={e => setForm(f => ({ ...f, review_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <Button className="w-full" disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? 'Saving...' : 'Add Aspect'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function AspectsRegister() {
  return (
    <div className="space-y-6">
      <PageHeader title="Aspects & Impacts Register" subtitle="ISO 14001 environmental policy and significance register" />
      <PolicyCard />
      <AspectsTable />
    </div>
  );
}
