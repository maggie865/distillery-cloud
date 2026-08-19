import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Trash2, Plus, TrendingDown, Recycle, Package, Pencil, Leaf, Settings2 } from 'lucide-react';
import { format, parseISO, subMonths, getMonth, getYear } from 'date-fns';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

// ── Waste categories ──────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'general',     label: 'General Waste',       icon: '🗑',  color: 'bg-gray-100 text-gray-700',   density: 0.12 }, // kg/L
  { id: 'recycling',   label: 'Recycling',            icon: '♻️', color: 'bg-blue-100 text-blue-700',   density: 0.06 },
  { id: 'glass',       label: 'Glass',                icon: '🍾',  color: 'bg-green-100 text-green-700', density: 0.40 },
  { id: 'cardboard',   label: 'Cardboard / Paper',    icon: '📦',  color: 'bg-amber-100 text-amber-700', density: 0.08 },
  { id: 'organic',     label: 'Organic / Food Waste', icon: '🌿',  color: 'bg-lime-100 text-lime-700',   density: 0.30 },
  { id: 'hazardous',   label: 'Hazardous',            icon: '⚠️', color: 'bg-red-100 text-red-700',     density: 0.20 },
  { id: 'other',       label: 'Other',                icon: '📋',  color: 'bg-muted text-muted-foreground', density: 0.12 },
];

const getCat = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

// ── Emission factors (kg CO2e per kg of waste) ───────────────────────────────
// Indicative defaults only — general/organic assume landfill disposal
// (methane-heavy), recycling/glass/cardboard assume processing/recovery
// (much lower). These are editable per category via "Emission Factors"
// below since actual factors depend on your disposal method and region —
// adjust to match your organisation's official GHG inventory methodology
// (e.g. NZ Ministry for the Environment factors) if you need audit-grade
// precision. Same "hardcoded default, editable in place" approach as
// ELECTRICITY_EF/WATER_EF in UtilityTracker.jsx, just per-category here
// since waste disposal routes vary far more than a single power/water
// connection does.
export const DEFAULT_EMISSION_FACTORS = {
  general: 0.58,
  recycling: 0.021,
  glass: 0.019,
  cardboard: 0.023,
  organic: 0.50,
  hazardous: 0.15,
  other: 0.40,
};
export const EMISSION_FACTORS_KEY = 'waste_emission_factors';
// Also used by LifecycleReport.jsx to read the same underlying AppSettings
// row WasteTracker itself reads — no dedicated waste table exists (see
// Objectives.jsx/EMS step 3 for the same finding).
export const WASTE_RECORDS_KEY = 'waste_records';

function useEmissionFactors() {
  const qc = useQueryClient();
  const { data: settingsRow } = useQuery({
    queryKey: ['wasteEmissionFactors'],
    queryFn: async () => {
      const rows = await base44.entities.AppSettings.list('key', 5000);
      return rows.find(r => r.key === EMISSION_FACTORS_KEY) || null;
    },
  });

  const factors = useMemo(() => {
    if (!settingsRow?.value) return DEFAULT_EMISSION_FACTORS;
    try { return { ...DEFAULT_EMISSION_FACTORS, ...JSON.parse(settingsRow.value) }; }
    catch { return DEFAULT_EMISSION_FACTORS; }
  }, [settingsRow]);

  const saveFactors = async (newFactors) => {
    const val = JSON.stringify(newFactors);
    if (settingsRow) {
      await base44.entities.AppSettings.update(settingsRow.id, { value: val });
    } else {
      await base44.entities.AppSettings.create({ key: EMISSION_FACTORS_KEY, value: val });
    }
    qc.invalidateQueries({ queryKey: ['wasteEmissionFactors'] });
  };

  return { factors, saveFactors };
}

export const co2eFor = (record, factors) => (record.kg || 0) * (factors[record.category] ?? factors.other ?? 0);

// ── Standard bin sizes ────────────────────────────────────────────────────────
const BIN_SIZES = [
  { label: '70L (primary)', litres: 70 },
  { label: '120L', litres: 120 },
  { label: '240L', litres: 240 },
  { label: 'Custom (litres)', litres: null },
];

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Log entry form ────────────────────────────────────────────────────────────
function LogForm({ onSave, saving, initial }) {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(initial?.date || today);
  const [category, setCategory] = useState(initial?.category || 'general');
  const [method, setMethod] = useState('bins'); // 'bins' | 'kg' | 'litres'
  const [bins, setBins] = useState(initial?.bins || '1');
  const [binSize, setBinSize] = useState(initial?.bin_size_litres || 70);
  const [customLitres, setCustomLitres] = useState('');
  const [kg, setKg] = useState(initial?.kg || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [recordedBy, setRecordedBy] = useState(initial?.recorded_by || '');

  const cat = getCat(category);

  // Calculate litres and kg from inputs
  const { litres, estimatedKg } = useMemo(() => {
    if (method === 'kg') {
      const k = parseFloat(kg) || 0;
      return { litres: cat.density > 0 ? k / cat.density : 0, estimatedKg: k };
    }
    const l = method === 'bins'
      ? (parseFloat(bins) || 0) * (binSize || 70)
      : (parseFloat(customLitres) || 0);
    return { litres: l, estimatedKg: l * cat.density };
  }, [method, bins, binSize, customLitres, kg, cat]);

  const handleSave = () => {
    if (!recordedBy.trim()) { toast.error('Please enter your name'); return; }
    const finalLitres = parseFloat(litres.toFixed(1));
    const finalKg = parseFloat(estimatedKg.toFixed(2));
    if (finalLitres <= 0 && finalKg <= 0) { toast.error('Please enter an amount'); return; }
    onSave({
      date,
      category,
      bin_size_litres: method === 'bins' ? (Number(binSize) || 70) : null,
      bins_count: method === 'bins' ? (parseFloat(bins) || 1) : null,
      litres: finalLitres > 0 ? finalLitres : finalKg / (cat.density || 0.12),
      kg: finalKg > 0 ? finalKg : finalLitres * (cat.density || 0.12),
      notes: notes.trim() || null,
      recorded_by: recordedBy.trim(),
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-semibold">Date</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold">Waste type</Label>
          <select value={category} onChange={e => setCategory(e.target.value)} className="mt-1 w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background">
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
        </div>
      </div>

      {/* Entry method toggle */}
      <div>
        <Label className="text-xs font-semibold">How are you measuring?</Label>
        <div className="flex gap-2 mt-1">
          {[['bins','🗑 Bin counts'],['litres','📏 Litres'],['kg','⚖️ Weight (kg)']].map(([v, l]) => (
            <button key={v} onClick={() => setMethod(v)}
              className={`flex-1 py-1.5 text-xs rounded-md border transition-colors ${method === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {method === 'bins' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs font-semibold">Bin size</Label>
            <select value={binSize || 'custom'} onChange={e => setBinSize(e.target.value === 'custom' ? null : Number(e.target.value))}
              className="mt-1 w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background">
              {BIN_SIZES.map(b => (
                <option key={b.label} value={b.litres || 'custom'}>{b.label}</option>
              ))}
            </select>
            {!binSize && (
              <Input type="number" placeholder="Custom litres" className="mt-1" onChange={e => setBinSize(Number(e.target.value))} />
            )}
          </div>
          <div>
            <Label className="text-xs font-semibold">Number of bins</Label>
            <Input type="number" min="0.5" step="0.5" value={bins} onChange={e => setBins(e.target.value)} className="mt-1" />
            <p className="text-xs text-muted-foreground mt-0.5">Use 0.5 for half a bin</p>
          </div>
        </div>
      )}

      {method === 'litres' && (
        <div>
          <Label className="text-xs font-semibold">Volume (litres)</Label>
          <Input type="number" min="0" value={customLitres} onChange={e => setCustomLitres(e.target.value)} placeholder="e.g. 140" className="mt-1" />
        </div>
      )}

      {method === 'kg' && (
        <div>
          <Label className="text-xs font-semibold">Weight (kg)</Label>
          <Input type="number" min="0" step="0.1" value={kg} onChange={e => setKg(e.target.value)} placeholder="e.g. 8.4" className="mt-1" />
        </div>
      )}

      {/* Live calculation preview */}
      {(litres > 0 || estimatedKg > 0) && (
        <div className={`rounded-lg p-3 text-sm ${getCat(category).color}`}>
          <p className="font-semibold">{getCat(category).icon} {getCat(category).label}</p>
          <div className="flex gap-4 mt-1 text-xs">
            {litres > 0 && <span>📏 {litres.toFixed(1)} L</span>}
            {estimatedKg > 0 && <span>⚖️ ~{estimatedKg.toFixed(2)} kg {method !== 'kg' && '(est.)'}</span>}
          </div>
          {method !== 'kg' && (
            <p className="text-xs opacity-70 mt-0.5">Weight estimated from {getCat(category).label.toLowerCase()} density ({cat.density} kg/L)</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-semibold">Recorded by</Label>
          <Input value={recordedBy} onChange={e => setRecordedBy(e.target.value)} placeholder="Your name" className="mt-1" />
        </div>
        <div>
          <Label className="text-xs font-semibold">Notes (optional)</Label>
          <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. post-bottling day" className="mt-1" />
        </div>
      </div>

      <Button className="w-full" onClick={handleSave} disabled={saving || (litres <= 0 && estimatedKg <= 0) || !recordedBy.trim()}>
        {saving ? 'Saving...' : initial ? 'Update Entry' : 'Log Waste'}
      </Button>
    </div>
  );
}

// ── Emission factors editor ───────────────────────────────────────────────────
function EmissionFactorsDialog({ open, onOpenChange, factors, onSave, saving }) {
  const [draft, setDraft] = useState(factors);
  useEffect(() => { if (open) setDraft(factors); }, [open, factors]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-display">Emission Factors</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          kg CO₂e per kg of waste, by category. These are indicative defaults (general/organic
          assume landfill, recycling/glass/cardboard assume processing) — adjust them to match
          your actual disposal method or an official inventory methodology if you need
          audit-grade precision.
        </p>
        <div className="space-y-2">
          {CATEGORIES.map(c => (
            <div key={c.id} className="flex items-center justify-between gap-3">
              <Label className="text-sm flex items-center gap-1.5">{c.icon} {c.label}</Label>
              <Input
                type="number" step="0.001" min="0" className="w-28 text-right"
                value={draft[c.id] ?? 0}
                onChange={e => setDraft(d => ({ ...d, [c.id]: parseFloat(e.target.value) || 0 }))}
              />
            </div>
          ))}
        </div>
        <Button className="w-full" disabled={saving} onClick={() => onSave(draft)}>
          {saving ? 'Saving...' : 'Save Factors'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function WasteTracker() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showAll, setShowAll] = useState(false);
  const [factorsOpen, setFactorsOpen] = useState(false);

  const { factors, saveFactors } = useEmissionFactors();
  const saveFactorsMutation = useMutation({
    mutationFn: saveFactors,
    onSuccess: () => { setFactorsOpen(false); toast.success('Emission factors updated'); },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  // Store waste records in AppSettings as JSON (no separate entity needed)
  const { data: settingsRow, isLoading } = useQuery({
    queryKey: ['wasteRecords'],
    queryFn: async () => {
      const rows = await base44.entities.AppSettings.list('key', 5000);
      return rows.find(r => r.key === WASTE_RECORDS_KEY) || null;
    },
  });

  const records = useMemo(() => {
    if (!settingsRow?.value) return [];
    try { return JSON.parse(settingsRow.value); } catch { return []; }
  }, [settingsRow]);

  const saveRecords = async (newRecords) => {
    const val = JSON.stringify(newRecords);
    if (settingsRow) {
      await base44.entities.AppSettings.update(settingsRow.id, { value: val });
    } else {
      await base44.entities.AppSettings.create({ key: WASTE_RECORDS_KEY, value: val });
    }
    qc.invalidateQueries({ queryKey: ['wasteRecords'] });
  };

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const newRecord = { ...data, id: Date.now().toString(), created_at: new Date().toISOString() };
      await saveRecords([...records, newRecord]);
    },
    onSuccess: () => { setShowForm(false); toast.success('Waste logged'); },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      await saveRecords(records.map(r => r.id === id ? { ...r, ...data } : r));
    },
    onSuccess: () => { setEditRecord(null); toast.success('Updated'); },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await saveRecords(records.filter(r => r.id !== id));
    },
    onSuccess: () => { toast.success('Deleted'); },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  // Filter records
  const filtered = useMemo(() => {
    if (showAll) return [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const [y, m] = monthFilter.split('-').map(Number);
    return records
      .filter(r => { const d = new Date(r.date); return getYear(d) === y && (d.getMonth() + 1) === m; })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [records, monthFilter, showAll]);

  // Monthly totals for chart (last 12 months)
  const monthlyTotals = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = subMonths(now, 11 - i);
      const y = getYear(d); const m = getMonth(d) + 1;
      const monthRecs = records.filter(r => {
        const rd = new Date(r.date);
        return getYear(rd) === y && (rd.getMonth() + 1) === m;
      });
      return {
        label: MONTH_NAMES[m - 1],
        month: m, year: y,
        kg: monthRecs.reduce((s, r) => s + (r.kg || 0), 0),
        litres: monthRecs.reduce((s, r) => s + (r.litres || 0), 0),
        co2e: monthRecs.reduce((s, r) => s + co2eFor(r, factors), 0),
        count: monthRecs.length,
      };
    });
  }, [records, factors]);

  // Summary for filtered period
  const summary = useMemo(() => {
    const byCategory = {};
    for (const r of filtered) {
      if (!byCategory[r.category]) byCategory[r.category] = { kg: 0, litres: 0, co2e: 0, count: 0 };
      byCategory[r.category].kg += (r.kg || 0);
      byCategory[r.category].litres += (r.litres || 0);
      byCategory[r.category].co2e += co2eFor(r, factors);
      byCategory[r.category].count++;
    }
    return {
      totalKg: filtered.reduce((s, r) => s + (r.kg || 0), 0),
      totalLitres: filtered.reduce((s, r) => s + (r.litres || 0), 0),
      totalCo2e: filtered.reduce((s, r) => s + co2eFor(r, factors), 0),
      byCategory,
      count: filtered.length,
    };
  }, [filtered, factors]);

  const maxMonthlyKg = Math.max(...monthlyTotals.map(m => m.kg), 1);

  return (
    <div className="pb-20 md:pb-0 space-y-5">
      <PageHeader title="Waste Tracker" subtitle="Log and monitor waste for BCorp reporting and KPIs">
        <Button variant="outline" onClick={() => setFactorsOpen(true)} className="gap-2">
          <Settings2 className="w-4 h-4" /> Emission Factors
        </Button>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Log Waste
        </Button>
      </PageHeader>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">This month — weight</p>
          <p className="text-2xl font-bold font-display">{summary.totalKg.toFixed(1)} kg</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">This month — volume</p>
          <p className="text-2xl font-bold font-display">{summary.totalLitres.toFixed(0)} L</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Leaf className="w-3 h-3" /> This month — CO₂e</p>
          <p className="text-2xl font-bold font-display">{summary.totalCo2e.toFixed(1)} kg</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">Entries this month</p>
          <p className="text-2xl font-bold font-display">{summary.count}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground mb-1">YTD weight</p>
          <p className="text-2xl font-bold font-display">
            {records.filter(r => { try { return getYear(new Date(r.date)) === getYear(new Date()); } catch { return false; } }).reduce((s, r) => s + (r.kg || 0), 0).toFixed(1)} kg
          </p>
        </Card>
      </div>

      {/* Monthly bar chart */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4">Monthly waste (kg) — last 12 months</h3>
        <div className="flex items-end gap-1.5 h-32">
          {monthlyTotals.map((m, i) => {
            const height = Math.round((m.kg / maxMonthlyKg) * 100);
            const isCurrent = i === 11;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${m.label}: ${m.kg.toFixed(1)}kg`}>
                <span className="text-xs text-muted-foreground" style={{ fontSize: '9px' }}>{m.kg > 0 ? m.kg.toFixed(0) : ''}</span>
                <div
                  className={`w-full rounded-t-sm transition-all ${isCurrent ? 'bg-primary' : 'bg-primary/30'}`}
                  style={{ height: `${Math.max(height, m.kg > 0 ? 4 : 0)}%` }}
                />
                <span className="text-xs text-muted-foreground" style={{ fontSize: '9px' }}>{m.label}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Category breakdown */}
      {Object.keys(summary.byCategory).length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3">By category {showAll ? '(all time)' : `(${monthFilter})`}</h3>
          <div className="space-y-2">
            {Object.entries(summary.byCategory)
              .sort((a, b) => b[1].kg - a[1].kg)
              .map(([catId, data]) => {
                const cat = getCat(catId);
                const pct = summary.totalKg > 0 ? (data.kg / summary.totalKg) * 100 : 0;
                return (
                  <div key={catId} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <Badge className={`text-xs ${cat.color}`}>{cat.icon} {cat.label}</Badge>
                        <span className="text-muted-foreground text-xs">{data.count} entries</span>
                      </span>
                      <span className="font-medium">
                        {data.kg.toFixed(1)} kg <span className="text-muted-foreground text-xs">({pct.toFixed(0)}%)</span>
                        <span className="text-emerald-700 text-xs ml-2">{data.co2e.toFixed(1)} kg CO₂e</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </Card>
      )}

      {/* Records table */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {!showAll && <Input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="w-40" />}
          <Button variant={showAll ? 'default' : 'outline'} size="sm" onClick={() => setShowAll(v => !v)}>
            {showAll ? 'Show current month' : 'Show all records'}
          </Button>
        </div>

        {isLoading ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">Loading...</Card>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center space-y-2">
            <Trash2 className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No waste records for this period.</p>
            <Button size="sm" onClick={() => setShowForm(true)}>Log first entry</Button>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">CO₂e</TableHead>
                    <TableHead>Recorded by</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => {
                    const cat = getCat(r.category);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-sm whitespace-nowrap">{r.date ? format(parseISO(r.date), 'd MMM yyyy') : '—'}</TableCell>
                        <TableCell><Badge className={`text-xs ${cat.color}`}>{cat.icon} {cat.label}</Badge></TableCell>
                        <TableCell className="text-sm text-right font-mono">
                          {r.litres ? `${r.litres.toFixed(0)}L` : '—'}
                          {r.bins_count && r.bin_size_litres && (
                            <span className="text-xs text-muted-foreground ml-1">({r.bins_count}×{r.bin_size_litres}L)</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-right font-mono font-medium">
                          {r.kg ? `${r.kg.toFixed(2)} kg` : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-right font-mono text-emerald-700">
                          {r.kg ? `${co2eFor(r, factors).toFixed(2)} kg` : '—'}
                        </TableCell>
                        <TableCell className="text-sm">{r.recorded_by || '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-xs truncate">{r.notes || '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditRecord(r)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => { if (confirm('Delete this entry?')) deleteMutation.mutate(r.id); }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </div>

      {/* Log form dialog */}
      <Dialog open={showForm} onOpenChange={v => !v && setShowForm(false)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">Log Waste</DialogTitle></DialogHeader>
          <LogForm onSave={data => createMutation.mutate(data)} saving={createMutation.isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      {editRecord && (
        <Dialog open={!!editRecord} onOpenChange={v => !v && setEditRecord(null)}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-display">Edit Waste Entry</DialogTitle></DialogHeader>
            <LogForm initial={editRecord} onSave={data => updateMutation.mutate({ id: editRecord.id, data })} saving={updateMutation.isPending} />
          </DialogContent>
        </Dialog>
      )}

      <EmissionFactorsDialog
        open={factorsOpen}
        onOpenChange={setFactorsOpen}
        factors={factors}
        onSave={(newFactors) => saveFactorsMutation.mutate(newFactors)}
        saving={saveFactorsMutation.isPending}
      />
    </div>
  );
}