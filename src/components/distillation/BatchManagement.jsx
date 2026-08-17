import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, ChevronDown, ChevronRight, FlaskConical, Package, Pencil, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import CreateBatchDialog from './CreateBatchDialog';

const STAGE_CONFIG = {
  in_progress:  { label: 'In Progress',       color: 'bg-blue-100 text-blue-800 border-blue-200' },
  diluting:     { label: 'Diluting',           color: 'bg-purple-100 text-purple-800 border-purple-200' },
  holding:      { label: 'Holding',            color: 'bg-amber-100 text-amber-800 border-amber-200' },
  bottle_ready: { label: 'Bottle Ready',       color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  bottling:     { label: 'Bottling',           color: 'bg-orange-100 text-orange-800 border-orange-200' },
  bottled:      { label: 'Bottled',            color: 'bg-teal-100 text-teal-800 border-teal-200' },
  sold:         { label: 'Sold',               color: 'bg-slate-100 text-slate-600 border-slate-200' },
  completed:    { label: 'Completed',          color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const ALL_STATUSES = Object.entries(STAGE_CONFIG).map(([value, { label }]) => ({ value, label }));

function StageBadge({ status }) {
  const cfg = STAGE_CONFIG[status] || { label: status, color: 'bg-muted text-muted-foreground border-border' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function EditBatchDialog({ batch, open, onOpenChange }) {
  const [form, setForm] = useState({
    batch_code: batch?.batch_code || '',
    product_name: batch?.product_name || '',
    date_started: batch?.date_started || '',
    date_completed: batch?.date_completed || '',
    status: batch?.status || 'in_progress',
    target_volume: batch?.target_volume ?? '',
    target_abv: batch?.target_abv ?? '',
    holding_tank: batch?.holding_tank || '',
    notes: batch?.notes || '',
  });
  const queryClient = useQueryClient();

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: (data) => db.MasterBatch.update(batch.id, {
      ...data,
      // date_started is a NOT NULL `date` column with no default — the
      // input has no `required` attribute so it can be cleared to '',
      // which fails Postgres's cast to date and 400s the update.
      date_started: data.date_started || undefined,
      target_volume: data.target_volume !== '' ? parseFloat(data.target_volume) : undefined,
      target_abv: data.target_abv !== '' ? parseFloat(data.target_abv) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['masterBatches'] });
      toast.success('Batch updated');
      onOpenChange(false);
    },
    onError: (err) => toast.error(err.message || 'Failed to update batch'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Edit Batch — {batch?.batch_code}</DialogTitle>
        </DialogHeader>
        <form onSubmit={e => { e.preventDefault(); mutation.mutate(form); }} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Product Name</Label>
              <Input value={form.product_name} onChange={e => set('product_name', e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Start Date</Label>
              <Input type="date" value={form.date_started} onChange={e => set('date_started', e.target.value)} />
            </div>
            <div>
              <Label>Completed Date</Label>
              <Input type="date" value={form.date_completed} onChange={e => set('date_completed', e.target.value)} />
            </div>
            <div>
              <Label>Target Volume (L)</Label>
              <Input type="number" step="1" value={form.target_volume} onChange={e => set('target_volume', e.target.value)} />
            </div>
            <div>
              <Label>Target ABV %</Label>
              <Input type="number" step="0.1" value={form.target_abv} onChange={e => set('target_abv', e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label>Holding Tank</Label>
              <Input value={form.holding_tank} onChange={e => set('holding_tank', e.target.value)} placeholder="e.g. Tank A" />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BatchCard({ batch, runs }) {
  const [expanded, setExpanded] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Distillation runs linked by batch_code
  const batchRuns = runs.filter(r => r.batch_number === batch.batch_code);

  // Aggregate stats across distillation runs
  const totalHeartsVol = batchRuns.reduce((s, r) => s + (r.hearts_volume || 0), 0);
  const totalOutputLALs = batchRuns.reduce((s, r) => s + (r.output_lals || 0), 0);

  return (
    <Card className="overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <button className="text-muted-foreground">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono font-semibold text-sm">{batch.batch_code}</span>
            <span className="text-muted-foreground text-sm">{batch.product_name}</span>
            <StageBadge status={batch.status} />
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {batch.date_started ? format(new Date(batch.date_started), 'MMM d, yyyy') : '—'}
            </span>
            <span>{batchRuns.length} run{batchRuns.length !== 1 ? 's' : ''}</span>
            {totalHeartsVol > 0 && <span>{totalHeartsVol.toFixed(1)}L hearts</span>}
            {totalOutputLALs > 0 && <span>{totalOutputLALs.toFixed(3)} LALs</span>}
            {batch.holding_tank && <span>📦 {batch.holding_tank}</span>}
          </div>
        </div>

        <Button
          variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0"
          onClick={e => { e.stopPropagation(); setEditOpen(true); }}
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Expanded sub-batch detail */}
      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
          {batchRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No distillation runs recorded yet for this batch.</p>
          ) : (
            <div className="space-y-3">
              {batchRuns.map((run) => (
                <div key={run.id} className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FlaskConical className="w-4 h-4 text-primary" />
                      <span className="font-mono text-sm font-semibold">{batch.batch_code}-R{batchRuns.indexOf(run) + 1}</span>
                      <span className="text-xs text-muted-foreground">
                        {run.date ? format(new Date(run.date), 'MMM d, yyyy') : '—'}
                      </span>
                    </div>
                    <StageBadge status={run.status} />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Input</p>
                      <p className="font-medium">{run.input_volume ? `${run.input_volume}L @ ${run.input_abv}%` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Hearts</p>
                      <p className="font-medium text-emerald-700">{run.hearts_volume ? `${run.hearts_volume}L @ ${run.hearts_abv}%` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Output LALs</p>
                      <p className="font-medium text-primary">{run.output_lals?.toFixed(3) ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Maceration Date</p>
                      <p className="font-medium">{run.maceration_date ? format(new Date(run.maceration_date), 'MMM d, yyyy') : '—'}</p>
                    </div>
                  </div>

                  {/* Botanicals & Ethanol lots from maceration notes */}
                  {run.maceration_notes && (
                    <div className="text-xs border-t border-border/50 pt-2">
                      <p className="text-muted-foreground font-medium mb-0.5">Maceration Notes</p>
                      <p className="text-foreground whitespace-pre-wrap">{run.maceration_notes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Batch totals */}
          {batchRuns.length > 1 && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Total Runs</p>
                <p className="font-semibold">{batchRuns.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Hearts (L)</p>
                <p className="font-semibold text-emerald-700">{totalHeartsVol.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Output LALs</p>
                <p className="font-semibold text-primary">{totalOutputLALs.toFixed(3)}</p>
              </div>
            </div>
          )}

          {/* Batch-level notes */}
          {batch.notes && (
            <div className="text-xs text-muted-foreground border-t border-border/50 pt-2">
              <span className="font-medium">Batch Notes: </span>{batch.notes}
            </div>
          )}
        </div>
      )}

      <EditBatchDialog batch={batch} open={editOpen} onOpenChange={setEditOpen} />
    </Card>
  );
}

export default function BatchManagement() {
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: masterBatches = [], isLoading } = useQuery({
    queryKey: ['masterBatches'],
    queryFn: () => db.MasterBatch.list('-date_started', 200),
  });

  const { data: runs = [] } = useQuery({
    queryKey: ['distillationRuns'],
    queryFn: () => db.DistillationRun.list('-date', 200),
  });

  const filtered = statusFilter === 'all'
    ? masterBatches
    : masterBatches.filter(b => b.status === statusFilter);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {ALL_STATUSES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filtered.length} batch{filtered.length !== 1 ? 'es' : ''}</span>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />New Batch
        </Button>
      </div>

      {/* Batch cards */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No batches found. Create your first master batch to get started.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(batch => (
            <BatchCard key={batch.id} batch={batch} runs={runs} />
          ))}
        </div>
      )}

      <CreateBatchDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}