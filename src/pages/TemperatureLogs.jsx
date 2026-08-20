import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Thermometer, AlertTriangle, CheckCircle2, Trash2, ChevronDown, Settings2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';
import Pagination from '@/components/ui/Pagination';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Default units — user can add/remove from Settings panel
const DEFAULT_UNITS = [
  { name: 'Fridge 1', type: 'refrigerator', min: 2, max: 5 },
  { name: 'Fridge 2', type: 'refrigerator', min: 2, max: 5 },
  { name: 'Freezer 1', type: 'freezer', min: -25, max: -15 },
  { name: 'Freezer 2', type: 'freezer', min: -25, max: -15 },
];

const SAFE_RANGES = {
  refrigerator: { min: 2, max: 5 },
  freezer: { min: -25, max: -15 },
  cool_room: { min: 2, max: 8 },
  ambient: { min: 15, max: 25 },
};

const TYPE_LABELS = {
  refrigerator: '🧊 Fridge',
  freezer: '❄️ Freezer',
  cool_room: '🏠 Cool Room',
  ambient: '🌡 Ambient',
};

// ─── UNIT CARD ────────────────────────────────────────────────────────────────
function UnitCard({ unit, logs, onLogTemp }) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const unitLogs = useMemo(() =>
    logs.filter(l => (l.unit_name || '').toLowerCase().trim() === unit.name.toLowerCase().trim())
      .sort((a, b) => {
        const da = `${a.date} ${a.time || ''}`;
        const db = `${b.date} ${b.time || ''}`;
        return db.localeCompare(da);
      }),
  [logs, unit.name]);

  const latest = unitLogs[0];
  const latestTemp = latest ? parseFloat(latest.temperature_c) : null;
  const inRange = latest ? latest.in_range !== false : null;
  const outOfRangeCount = unitLogs.filter(l => l.in_range === false).length;
  const paged = unitLogs.slice((page - 1) * pageSize, page * pageSize);

  const borderCls = inRange === false ? 'border-red-300 bg-red-50/30' : inRange === true ? 'border-emerald-300' : 'border-border';
  const tempCls = inRange === false ? 'text-red-600' : inRange === true ? 'text-emerald-600' : 'text-muted-foreground';

  return (
    <Card className={`border-2 ${borderCls} overflow-hidden`}>
      <div className="p-4 flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{unit.name}</span>
            <span className="text-xs text-muted-foreground">{TYPE_LABELS[unit.type] || unit.type}</span>
            <span className="text-xs text-muted-foreground">Safe: {unit.min}° to {unit.max}°C</span>
          </div>
          {latest ? (
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className={`text-2xl font-bold font-mono ${tempCls}`}>{latestTemp}°C</span>
              {inRange === false ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  <AlertTriangle className="w-3 h-3" /> Out of range
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="w-3 h-3" /> OK
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {latest.date ? format(parseISO(latest.date), 'd MMM') : ''} {latest.time || ''} — {latest.recorded_by || ''}
              </span>
              {outOfRangeCount > 0 && (
                <span className="text-xs text-red-600 font-medium">{outOfRangeCount} out-of-range reading{outOfRangeCount !== 1 ? 's' : ''}</span>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">No readings yet</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" onClick={() => onLogTemp(unit)} className="gap-1">
            <Plus className="w-3.5 h-3.5" /> Log
          </Button>
          {unitLogs.length > 0 && (
            <button onClick={() => setOpen(v => !v)} className="text-muted-foreground hover:text-foreground p-1">
              <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {open && unitLogs.length > 0 && (
        <div className="border-t border-border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Temp °C</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Recorded by</TableHead>
                  <TableHead>Corrective Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map(l => (
                  <TableRow key={l.id} className={l.in_range === false ? 'bg-red-50' : ''}>
                    <TableCell className="text-sm whitespace-nowrap">{l.date ? format(parseISO(l.date), 'd MMM yyyy') : '—'}</TableCell>
                    <TableCell className="text-sm font-mono">{l.time || '—'}</TableCell>
                    <TableCell className={`text-sm font-bold ${l.in_range === false ? 'text-red-600' : 'text-emerald-600'}`}>{l.temperature_c}°C</TableCell>
                    <TableCell>
                      {l.in_range === false ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700"><AlertTriangle className="w-3 h-3" /> Out</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="w-3 h-3" /> OK</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{l.recorded_by || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{l.corrective_action || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {unitLogs.length > pageSize && (
            <div className="p-3 border-t">
              <Pagination total={unitLogs.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={() => {}} />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── BULK LOG FORM ────────────────────────────────────────────────────────────
function BulkLogForm({ units, onSave, saving }) {
  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toTimeString().slice(0, 5);
  const [date, setDate] = useState(today);
  const [time, setTime] = useState(now);
  const [recordedBy, setRecordedBy] = useState('');
  const [temps, setTemps] = useState({});
  const [actions, setActions] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const setTemp = (name, val) => setTemps(t => ({ ...t, [name]: val }));
  const setAction = (name, val) => setActions(a => ({ ...a, [name]: val }));

  const getStatus = (unit) => {
    const val = temps[unit.name];
    if (val === '' || val === undefined) return null;
    const t = parseFloat(val);
    if (isNaN(t)) return null;
    return t >= unit.min && t <= unit.max ? 'ok' : 'out';
  };

  const filledCount = units.filter(u => temps[u.name] !== '' && temps[u.name] !== undefined).length;

  const handleSave = async () => {
    if (!recordedBy.trim()) { toast.error('Please enter your name'); return; }
    const toSave = units.filter(u => temps[u.name] !== '' && temps[u.name] !== undefined);
    if (toSave.length === 0) { toast.error('Please enter at least one temperature reading'); return; }
    await onSave(toSave.map(u => {
      const temp = parseFloat(temps[u.name]);
      const inRange = temp >= u.min && temp <= u.max;
      return {
        date, time, unit_name: u.name, unit_type: u.type,
        temperature_c: temp, min_safe_c: u.min, max_safe_c: u.max,
        recorded_by: recordedBy.trim(), in_range: inRange,
        corrective_action: actions[u.name] || undefined,
      };
    }));
    setTemps({});
    setActions({});
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Thermometer className="w-5 h-5 text-primary" />
        <h3 className="font-semibold">Log All Temperatures</h3>
        {filledCount > 0 && <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{filledCount} of {units.length} filled</span>}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs font-semibold">Date</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold">Time</Label>
          <Input type="time" value={time} onChange={e => setTime(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold">Recorded by *</Label>
          <Input value={recordedBy} onChange={e => setRecordedBy(e.target.value)} placeholder="Your name" className="mt-1" />
        </div>
      </div>

      <div className="space-y-2">
        {units.map(unit => {
          const status = getStatus(unit);
          return (
            <div key={unit.name} className={`rounded-lg border p-3 transition-colors ${status === 'out' ? 'bg-red-50 border-red-200' : status === 'ok' ? 'bg-emerald-50 border-emerald-200' : 'border-border'}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{unit.name}</span>
                    <span className="text-xs text-muted-foreground">{TYPE_LABELS[unit.type]}</span>
                    <span className="text-xs text-muted-foreground">({unit.min}° to {unit.max}°C)</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    value={temps[unit.name] ?? ''}
                    onChange={e => setTemp(unit.name, e.target.value)}
                    placeholder="°C"
                    className={`w-24 h-10 text-center font-mono text-base font-bold ${status === 'out' ? 'border-red-400' : status === 'ok' ? 'border-emerald-400' : ''}`}
                  />
                  {status === 'ok' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
                  {status === 'out' && <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />}
                </div>
              </div>
              {status === 'out' && (
                <div className="mt-2">
                  <Input
                    value={actions[unit.name] || ''}
                    onChange={e => setAction(unit.name, e.target.value)}
                    placeholder="Corrective action taken (required for out-of-range)"
                    className="text-sm border-red-300"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {submitted ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-700 font-medium text-center">
          ✅ Temperatures logged successfully
        </div>
      ) : (
        <Button onClick={handleSave} disabled={saving || filledCount === 0} className="w-full">
          {saving ? 'Saving...' : `Save ${filledCount > 0 ? filledCount : ''} Temperature Reading${filledCount !== 1 ? 's' : ''}`}
        </Button>
      )}
    </Card>
  );
}

// ─── UNIT SETTINGS ────────────────────────────────────────────────────────────
function UnitSettings({ units, onChange }) {
  const [open, setOpen] = useState(false);
  const [newUnit, setNewUnit] = useState({ name: '', type: 'refrigerator' });

  const addUnit = () => {
    if (!newUnit.name.trim()) return;
    const range = SAFE_RANGES[newUnit.type] || { min: 0, max: 10 };
    onChange([...units, { name: newUnit.name.trim(), type: newUnit.type, min: range.min, max: range.max }]);
    setNewUnit({ name: '', type: 'refrigerator' });
  };

  const removeUnit = (name) => onChange(units.filter(u => u.name !== name));

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="w-4 h-4" /> Manage Units
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="p-4 mt-2 space-y-3">
          <p className="text-xs text-muted-foreground">Add or remove fridges and freezers. Changes are saved locally for this session.</p>
          <div className="space-y-1">
            {units.map(u => (
              <div key={u.name} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-sm">{u.name} <span className="text-xs text-muted-foreground">({TYPE_LABELS[u.type]}, {u.min}° to {u.max}°C)</span></span>
                <Button variant="ghost" size="sm" className="text-destructive h-7" onClick={() => removeUnit(u.name)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={newUnit.name} onChange={e => setNewUnit(n => ({ ...n, name: e.target.value }))} placeholder="Unit name (e.g. Fridge 3)" className="flex-1" />
            <select value={newUnit.type} onChange={e => setNewUnit(n => ({ ...n, type: e.target.value }))} className="border border-border rounded-md px-2 text-sm">
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <Button onClick={addUnit} disabled={!newUnit.name.trim()} size="sm">Add</Button>
          </div>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function TemperatureLogs() {
  const [units, setUnits] = useState(DEFAULT_UNITS);
  const [logTarget, setLogTarget] = useState(null); // single unit quick-log
  const [singleTemp, setSingleTemp] = useState('');
  const [singleAction, setSingleAction] = useState('');
  const [singleBy, setSingleBy] = useState('');
  const qc = useQueryClient();

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['temperatureLogs'],
    queryFn: () => base44.entities.TemperatureLog.list('-date', 5000),
  });

  const today = new Date().toISOString().split('T')[0];
  const todayLogs = logs.filter(l => l.date === today);
  const outOfRange = logs.filter(l => l.in_range === false).length;

  const bulkMutation = useMutation({
    mutationFn: async (entries) => {
      for (const entry of entries) {
        await base44.entities.TemperatureLog.create(entry);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['temperatureLogs'] });
      toast.success('Temperatures saved');
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const singleMutation = useMutation({
    mutationFn: async () => {
      const temp = parseFloat(singleTemp);
      const unit = logTarget;
      await base44.entities.TemperatureLog.create({
        date: today,
        time: new Date().toTimeString().slice(0, 5),
        unit_name: unit.name,
        unit_type: unit.type,
        temperature_c: temp,
        min_safe_c: unit.min,
        max_safe_c: unit.max,
        recorded_by: singleBy.trim(),
        in_range: temp >= unit.min && temp <= unit.max,
        corrective_action: singleAction || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['temperatureLogs'] });
      setLogTarget(null);
      setSingleTemp('');
      setSingleAction('');
      toast.success(`${logTarget.name} temperature logged`);
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const singleStatus = singleTemp !== '' && !isNaN(parseFloat(singleTemp))
    ? (parseFloat(singleTemp) >= (logTarget?.min || 0) && parseFloat(singleTemp) <= (logTarget?.max || 0) ? 'ok' : 'out')
    : null;

  return (
    <div className="space-y-5">
      <PageHeader title="Temperature Logs" subtitle="Record and monitor fridge and freezer temperatures">
        <UnitSettings units={units} onChange={setUnits} />
      </PageHeader>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border p-4 bg-accent border-accent-foreground/10">
          <p className="text-xs text-muted-foreground mb-1">Today's readings</p>
          <p className="text-2xl font-bold font-display text-primary">{todayLogs.length}</p>
        </div>
        <div className="rounded-xl border p-4 bg-accent border-accent-foreground/10">
          <p className="text-xs text-muted-foreground mb-1">Units tracked</p>
          <p className="text-2xl font-bold font-display text-primary">{units.length}</p>
        </div>
        <div className={`rounded-xl border p-4 ${outOfRange > 0 ? 'bg-red-50 border-red-200' : 'bg-accent border-accent-foreground/10'}`}>
          <p className="text-xs text-muted-foreground mb-1">Out of range</p>
          <p className={`text-2xl font-bold font-display ${outOfRange > 0 ? 'text-red-600' : 'text-primary'}`}>{outOfRange}</p>
        </div>
      </div>

      {outOfRange > 0 && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">{outOfRange} out-of-range reading{outOfRange !== 1 ? 's' : ''} on record</p>
            <p className="text-xs text-red-600 mt-0.5">Check the unit history below to ensure corrective actions have been taken.</p>
          </div>
        </div>
      )}

      {/* Bulk log form */}
      <BulkLogForm units={units} onSave={bulkMutation.mutateAsync} saving={bulkMutation.isPending} />

      {/* Unit cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Unit History</h3>
        {units.map(unit => (
          <UnitCard
            key={unit.name}
            unit={unit}
            logs={logs}
            onLogTemp={(u) => { setLogTarget(u); setSingleTemp(''); setSingleAction(''); setSingleBy(''); }}
          />
        ))}
      </div>

      {/* Quick log for single unit (inline below its card, shown as modal-like overlay) */}
      {logTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setLogTarget(null)}>
          <div className="bg-background rounded-xl border shadow-lg w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold">Log — {logTarget.name}</h3>
            <p className="text-xs text-muted-foreground">Safe range: {logTarget.min}°C to {logTarget.max}°C</p>
            <div>
              <Label className="text-xs font-semibold">Temperature °C</Label>
              <Input
                type="number" step="0.1" autoFocus
                value={singleTemp}
                onChange={e => setSingleTemp(e.target.value)}
                placeholder="e.g. 3.5"
                className={`mt-1 text-center font-mono text-xl font-bold h-14 ${singleStatus === 'out' ? 'border-red-400' : singleStatus === 'ok' ? 'border-emerald-400' : ''}`}
              />
              {singleStatus === 'ok' && <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Within safe range</p>}
              {singleStatus === 'out' && <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Out of safe range</p>}
            </div>
            {singleStatus === 'out' && (
              <div>
                <Label className="text-xs font-semibold">Corrective action taken</Label>
                <Input value={singleAction} onChange={e => setSingleAction(e.target.value)} placeholder="e.g. Unit adjusted, contents moved" className="mt-1" />
              </div>
            )}
            <div>
              <Label className="text-xs font-semibold">Recorded by</Label>
              <Input value={singleBy} onChange={e => setSingleBy(e.target.value)} placeholder="Your name" className="mt-1" />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() => singleMutation.mutate()}
                disabled={singleMutation.isPending || !singleTemp || !singleBy.trim()}
              >
                {singleMutation.isPending ? 'Saving...' : 'Save Reading'}
              </Button>
              <Button variant="outline" onClick={() => setLogTarget(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}