import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Flame, Clock, ChevronRight, Timer } from 'lucide-react';
import { toast } from 'sonner';
import RunTimeline from '@/components/distillation/RunTimeline';
import { nowDateTimeLocal, nowTime } from '@/lib/timeInput';

const num = (v) => (v !== '' && v != null ? parseFloat(v) : undefined);
const lals = (vol, abv) => (num(vol) && num(abv)) ? (num(vol) * num(abv) / 100) : undefined;

function elapsed(startIso) {
  if (!startIso) return null;
  const start = new Date(startIso).getTime();
  if (isNaN(start)) return null;
  const mins = Math.max(0, Math.round((Date.now() - start) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const distillationStage = (run) => {
  if (run.tails_end_time) return 'Tails done';
  if (run.hearts_end_time) return 'Tails';
  if (run.heads_end_time) return 'Hearts';
  if (run.heads_start_time || run.run_start_time) return 'Heads';
  return 'Not started';
};

// Dashboard shortcut for "I'm standing at the still right now" — surfaces
// every in-progress Distillation/SNS run with a compact quick-entry dialog,
// so logging a cut or a temp reading doesn't require navigating to
// Production → Distillations → Edit and scrolling through the full run
// form (batch/recipe/maceration/tank-allocation fields included). Those
// setup fields are fixed at Start Run and deliberately left out here —
// this only touches the fields you'd actually update mid-run.
export default function InProgressRuns() {
  const queryClient = useQueryClient();
  const [logging, setLogging] = useState(null); // { kind, run }

  const { data: distillationRuns = [] } = useQuery({
    queryKey: ['distillationRuns'],
    queryFn: () => db.DistillationRun.list('-date', 5000),
  });
  const { data: snsRuns = [] } = useQuery({
    queryKey: ['snsRuns'],
    queryFn: async () => {
      try { return await db.SNSRun.list('-date', 5000); } catch { return []; }
    },
  });
  const { data: tanks = [] } = useQuery({
    queryKey: ['storageTanks'],
    queryFn: () => db.StorageTank.list('name', 5000),
  });

  const activeDistillation = distillationRuns.filter(r => r.status === 'in_progress');
  const activeSns = snsRuns.filter(r => r.status === 'in_progress');

  if (activeDistillation.length === 0 && activeSns.length === 0) return null;

  return (
    <Card className="p-5 mb-6 border-2 border-primary/20 bg-primary/5">
      <div className="flex items-center gap-2 mb-3">
        <Flame className="w-5 h-5 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">
          Active Distillation{activeDistillation.length + activeSns.length !== 1 ? 's' : ''}
        </h2>
      </div>
      <div className="space-y-2">
        {activeDistillation.map(run => (
          <RunCard
            key={run.id}
            title={`${run.batch_number || 'Batch'}${run.product_name ? ` — ${run.product_name}` : ''}`}
            sub={distillationStage(run)}
            elapsedText={elapsed(run.run_start_time)}
            tempText={run.still_temp != null ? `${run.still_temp}°C` : null}
            onClick={() => setLogging({ kind: 'distillation', run })}
          />
        ))}
        {activeSns.map(run => {
          const tank = tanks.find(t => t.id === run.source_tank_id);
          return (
            <RunCard
              key={run.id}
              title={`SNS Run — Tank ${tank?.name || '—'}`}
              sub="SNS distillation"
              elapsedText={elapsed(run.run_start_time)}
              tempText={null}
              onClick={() => setLogging({ kind: 'sns', run })}
            />
          );
        })}
      </div>

      {logging && (
        <QuickLogDialog
          kind={logging.kind}
          run={logging.run}
          onClose={() => setLogging(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['distillationRuns'] });
            queryClient.invalidateQueries({ queryKey: ['snsRuns'] });
            setLogging(null);
          }}
        />
      )}
    </Card>
  );
}

function RunCard({ title, sub, elapsedText, tempText, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left hover:bg-muted/40 transition-colors"
    >
      <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Flame className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
          <span>{sub}</span>
          {elapsedText && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" />{elapsedText}</span>}
          {tempText && <span>{tempText}</span>}
        </p>
      </div>
      <span className="text-xs font-medium text-primary shrink-0 hidden sm:inline">Quick Log</span>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </button>
  );
}

function QuickLogDialog({ kind, run, onClose, onSaved }) {
  const isDistillation = kind === 'distillation';

  const [form, setForm] = useState(() => isDistillation ? {
    still_temp: run.still_temp ?? '',
    atmospheric_pressure: run.atmospheric_pressure ?? '',
    run_start_time: run.run_start_time || '',
    run_end_time: run.run_end_time || '',
    heads_start_time: run.heads_start_time || '',
    heads_end_time: run.heads_end_time || '',
    hearts_end_time: run.hearts_end_time || '',
    tails_end_time: run.tails_end_time || '',
    abv_readings: run.abv_readings || [],
    heads_volume: run.heads_volume ?? '', heads_abv: run.heads_abv ?? '',
    hearts_volume: run.hearts_volume ?? '', hearts_abv: run.hearts_abv ?? '',
    tails_volume: run.tails_volume ?? '', tails_abv: run.tails_abv ?? '',
    dumped_volume: run.dumped_volume ?? '', dumped_abv: run.dumped_abv ?? '',
    notes: run.notes || '',
  } : {
    run_start_time: run.run_start_time || '',
    run_end_time: (run.run_end_time || '').slice(0, 5),
    dephlegmator_water_litres: run.dephlegmator_water_litres?.toString() ?? '',
    hearts_volume: run.hearts_volume ?? '', hearts_abv: run.hearts_abv ?? '',
    dumped_volume: run.dumped_volume ?? '', dumped_abv: run.dumped_abv ?? '',
    notes: run.notes || '',
  });

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isDistillation) {
        await db.DistillationRun.update(run.id, {
          still_temp: num(form.still_temp),
          atmospheric_pressure: num(form.atmospheric_pressure),
          run_start_time: form.run_start_time || undefined,
          run_end_time: form.run_end_time || undefined,
          heads_start_time: form.heads_start_time || undefined,
          heads_end_time: form.heads_end_time || undefined,
          hearts_end_time: form.hearts_end_time || undefined,
          tails_end_time: form.tails_end_time || undefined,
          abv_readings: (form.abv_readings || []).map(r => ({
            time: r.time || undefined,
            abv: r.abv !== '' ? parseFloat(r.abv) : undefined,
            temp: r.temp !== '' ? parseFloat(r.temp) : undefined,
            notes: r.notes || undefined,
          })),
          heads_volume: num(form.heads_volume), heads_abv: num(form.heads_abv), heads_lals: lals(form.heads_volume, form.heads_abv),
          hearts_volume: num(form.hearts_volume), hearts_abv: num(form.hearts_abv), hearts_lals: lals(form.hearts_volume, form.hearts_abv),
          tails_volume: num(form.tails_volume), tails_abv: num(form.tails_abv), tails_lals: lals(form.tails_volume, form.tails_abv),
          dumped_volume: num(form.dumped_volume), dumped_abv: num(form.dumped_abv), dumped_lals: lals(form.dumped_volume, form.dumped_abv),
          notes: form.notes || undefined,
        });
      } else {
        await db.SNSRun.update(run.id, {
          run_start_time: form.run_start_time || undefined,
          run_end_time: form.run_end_time || undefined,
          dephlegmator_water_litres: num(form.dephlegmator_water_litres),
          hearts_volume: num(form.hearts_volume), hearts_abv: num(form.hearts_abv), hearts_lals: lals(form.hearts_volume, form.hearts_abv),
          dumped_volume: num(form.dumped_volume), dumped_abv: num(form.dumped_abv), dumped_lals: lals(form.dumped_volume, form.dumped_abv),
          notes: form.notes || undefined,
        });
      }
    },
    onSuccess: () => { toast.success('Run updated'); onSaved(); },
    onError: (err) => toast.error(err.message || 'Failed to save'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Flame className="w-4 h-4 text-primary" />
            {isDistillation ? `${run.batch_number || 'Run'} — Quick Log` : 'SNS Run — Quick Log'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {isDistillation ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Still Temp (°C)</Label>
                  <Input type="number" step="0.1" value={form.still_temp} onChange={e => set('still_temp', e.target.value)} placeholder="e.g. 78.5" />
                </div>
                <div>
                  <Label className="text-xs">Atm. Pressure (hPa)</Label>
                  <Input type="number" step="0.1" value={form.atmospheric_pressure} onChange={e => set('atmospheric_pressure', e.target.value)} placeholder="e.g. 1013" />
                </div>
              </div>

              <RunTimeline form={form} set={set} />

              <div className="rounded-lg border border-border p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cuts</p>
                {[
                  { key: 'heads', label: 'Heads', color: 'text-muted-foreground' },
                  { key: 'hearts', label: 'Hearts', color: 'text-emerald-600' },
                  { key: 'tails', label: 'Tails', color: 'text-muted-foreground' },
                ].map(({ key, label, color }) => (
                  <div key={key} className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className={`text-xs ${color}`}>{label} Volume (L)</Label>
                      <Input type="number" step="0.01" value={form[`${key}_volume`]} onChange={e => set(`${key}_volume`, e.target.value)} />
                    </div>
                    <div>
                      <Label className={`text-xs ${color}`}>{label} ABV %</Label>
                      <Input type="number" step="0.1" value={form[`${key}_abv`]} onChange={e => set(`${key}_abv`, e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Dumped Volume (L)</Label>
                  <Input type="number" step="0.01" value={form.dumped_volume} onChange={e => set('dumped_volume', e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label className="text-xs">Dumped ABV %</Label>
                  <Input type="number" step="0.1" value={form.dumped_abv} onChange={e => set('dumped_abv', e.target.value)} placeholder="0" />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Run Start</Label>
                  <div className="flex gap-1.5">
                    <Input type="datetime-local" value={form.run_start_time} onChange={e => set('run_start_time', e.target.value)} className="text-sm" />
                    <Button type="button" variant="outline" size="icon" className="shrink-0" title="Set to now" onClick={() => set('run_start_time', nowDateTimeLocal())}>
                      <Timer className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Run End</Label>
                  <div className="flex gap-1.5">
                    <Input type="time" value={form.run_end_time} onChange={e => set('run_end_time', e.target.value)} className="text-sm" />
                    <Button type="button" variant="outline" size="icon" className="shrink-0" title="Set to now" onClick={() => set('run_end_time', nowTime())}>
                      <Timer className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Dephlegmator Water (L)</Label>
                <Input type="number" step="0.1" min="0" value={form.dephlegmator_water_litres} onChange={e => set('dephlegmator_water_litres', e.target.value)} placeholder="from water meter" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Hearts Volume (L)</Label>
                  <Input type="number" step="0.01" value={form.hearts_volume} onChange={e => set('hearts_volume', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Hearts ABV %</Label>
                  <Input type="number" step="0.1" value={form.hearts_abv} onChange={e => set('hearts_abv', e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Dumped Volume (L)</Label>
                  <Input type="number" step="0.01" value={form.dumped_volume} onChange={e => set('dumped_volume', e.target.value)} placeholder="0" />
                </div>
                <div>
                  <Label className="text-xs">Dumped ABV %</Label>
                  <Input type="number" step="0.1" value={form.dumped_abv} onChange={e => set('dumped_abv', e.target.value)} placeholder="0" />
                </div>
              </div>
            </>
          )}

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Anything worth noting…" />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
            <Button className="flex-1" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
