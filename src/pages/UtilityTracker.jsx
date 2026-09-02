import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import PageHeader from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import MobileCard, { MobileCardGrid, MobileDetailRow } from '@/components/shared/MobileCard';
import Pagination from '@/components/ui/Pagination';
import { Plus, Search, Pencil, Trash2, Zap, Droplets, DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import StillEnergyReport from '@/components/utilities/StillEnergyReport';

// NZ emission factors (kg CO2e) — mains electricity + town water supply
export const ELECTRICITY_EF = 0.105; // kg CO2e / kWh (NZ grid)
export const WATER_EF = 0.149; // kg CO2e / m³ town water (=> 0.000149 / L)

export default function UtilityTracker() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({});

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['utilityLogs'],
    queryFn: () => base44.entities.UtilityLog.list('-reading_date', 5000),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.UtilityLog.create(data),
    onSuccess: () => { queryClient.invalidateQueries(['utilityLogs']); setDialogOpen(false); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.UtilityLog.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries(['utilityLogs']); setDialogOpen(false); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.UtilityLog.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(['utilityLogs']); setDeleteTarget(null); },
    onError: (e) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const filtered = useMemo(() => {
    let r = logs;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(l =>
        (l.period || '').toLowerCase().includes(q) ||
        (l.notes || '').toLowerCase().includes(q)
      );
    }
    return r;
  }, [logs, search]);

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const stats = useMemo(() => {
    const totalKwh = logs.reduce((s, l) => s + (l.electricity_kwh || 0), 0);
    const totalWater = logs.reduce((s, l) => s + (l.water_litres || 0), 0);
    const totalElecCost = logs.reduce((s, l) => s + (l.electricity_cost || 0), 0);
    const totalWaterCost = logs.reduce((s, l) => s + (l.water_cost || 0), 0);
    const totalCo2e = totalKwh * ELECTRICITY_EF + (totalWater / 1000) * WATER_EF;
    return { count: logs.length, totalKwh, totalWater, totalElecCost, totalWaterCost, totalCo2e };
  }, [logs]);

  // Unit price per reading — cost ÷ consumption, calculated at read time
  // rather than stored, so it always reflects whatever cost/consumption was
  // last entered for that reading. $/kWh for power, $/m³ for water (litres
  // makes for an unreadably small number).
  const elecRate = (l) => (l.electricity_cost && l.electricity_kwh) ? l.electricity_cost / l.electricity_kwh : null;
  const waterRate = (l) => (l.water_cost && l.water_litres) ? l.water_cost / (l.water_litres / 1000) : null;

  const rateTrend = useMemo(() => {
    const byDateDesc = [...logs].filter(l => l.reading_date).sort((a, b) => (b.reading_date || '').localeCompare(a.reading_date || ''));
    const withElecRate = byDateDesc.filter(l => elecRate(l) !== null);
    const withWaterRate = byDateDesc.filter(l => waterRate(l) !== null);
    return {
      elec: { latest: withElecRate[0] ? elecRate(withElecRate[0]) : null, previous: withElecRate[1] ? elecRate(withElecRate[1]) : null },
      water: { latest: withWaterRate[0] ? waterRate(withWaterRate[0]) : null, previous: withWaterRate[1] ? waterRate(withWaterRate[1]) : null },
    };
  }, [logs]);

  const openNew = () => {
    setEditing(null);
    setForm({
      period: format(new Date(), 'yyyy-MM'),
      reading_date: format(new Date(), 'yyyy-MM-dd'),
      electricity_kwh: '',
      water_litres: '',
      electricity_cost: '',
      water_cost: '',
      notes: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (l) => {
    setEditing(l);
    setForm({ ...l });
    setDialogOpen(true);
  };

  const save = () => {
    if (!form.period || !form.reading_date) {
      toast({ title: 'Period and reading date are required', variant: 'destructive' });
      return;
    }
    const payload = { ...form };
    ['electricity_kwh', 'water_litres', 'electricity_cost', 'water_cost'].forEach(k => {
      payload[k] = payload[k] === '' || payload[k] === null ? undefined : Number(payload[k]);
    });
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader title="Utilities Tracker" subtitle="Log mains electricity and town water consumption for ISO lifecycle reporting">
        <Button onClick={openNew} className="gap-2">
          <Plus className="w-4 h-4" /> Add Reading
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" /> Total Electricity</p>
          <p className="text-2xl font-bold font-display text-primary">{stats.totalKwh.toLocaleString()}<span className="text-sm font-normal text-muted-foreground"> kWh</span></p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Droplets className="w-3 h-3" /> Total Water</p>
          <p className="text-2xl font-bold font-display text-primary">{stats.totalWater.toLocaleString()}<span className="text-sm font-normal text-muted-foreground"> L</span></p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" /> Utility Costs</p>
          <p className="text-2xl font-bold font-display text-primary">${(stats.totalElecCost + stats.totalWaterCost).toLocaleString()}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" /> Est. CO₂e</p>
          <p className="text-2xl font-bold font-display text-primary">{stats.totalCo2e.toFixed(1)}<span className="text-sm font-normal text-muted-foreground"> kg</span></p>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Zap className="w-3 h-3" /> Electricity Rate</p>
          {rateTrend.elec.latest === null ? (
            <p className="text-sm text-muted-foreground mt-1">Enter both cost and kWh on a reading to see the rate</p>
          ) : (
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-2xl font-bold font-display text-primary">${rateTrend.elec.latest.toFixed(3)}<span className="text-sm font-normal text-muted-foreground">/kWh</span></p>
              {rateTrend.elec.previous !== null && Math.abs(rateTrend.elec.latest - rateTrend.elec.previous) >= 0.0005 && (
                <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${rateTrend.elec.latest > rateTrend.elec.previous ? 'text-destructive' : 'text-success'}`}>
                  {rateTrend.elec.latest > rateTrend.elec.previous ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  ${Math.abs(rateTrend.elec.latest - rateTrend.elec.previous).toFixed(3)} vs prior reading
                </span>
              )}
            </div>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Droplets className="w-3 h-3" /> Water Rate</p>
          {rateTrend.water.latest === null ? (
            <p className="text-sm text-muted-foreground mt-1">Enter both cost and litres on a reading to see the rate</p>
          ) : (
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-2xl font-bold font-display text-primary">${rateTrend.water.latest.toFixed(2)}<span className="text-sm font-normal text-muted-foreground">/m³</span></p>
              {rateTrend.water.previous !== null && Math.abs(rateTrend.water.latest - rateTrend.water.previous) >= 0.005 && (
                <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${rateTrend.water.latest > rateTrend.water.previous ? 'text-destructive' : 'text-success'}`}>
                  {rateTrend.water.latest > rateTrend.water.previous ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  ${Math.abs(rateTrend.water.latest - rateTrend.water.previous).toFixed(2)} vs prior reading
                </span>
              )}
            </div>
          )}
        </CardContent></Card>
      </div>

      <StillEnergyReport totalMeteredKwh={stats.totalKwh} />

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search period or notes..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pl-9 max-w-md" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-40" />
          No readings logged yet. Click "Add Reading" to record a billing period.
        </CardContent></Card>
      ) : (
        <>
          <div className="hidden md:block rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Reading Date</TableHead>
                  <TableHead className="text-right">Electricity (kWh)</TableHead>
                  <TableHead className="text-right">Water (L)</TableHead>
                  <TableHead className="text-right">Elec Cost</TableHead>
                  <TableHead className="text-right">$/kWh</TableHead>
                  <TableHead className="text-right">Water Cost</TableHead>
                  <TableHead className="text-right">$/m³</TableHead>
                  <TableHead className="text-right">CO₂e (kg)</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map(l => {
                  const co2e = (l.electricity_kwh || 0) * ELECTRICITY_EF + ((l.water_litres || 0) / 1000) * WATER_EF;
                  const eRate = elecRate(l);
                  const wRate = waterRate(l);
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono font-semibold">{l.period}</TableCell>
                      <TableCell className="text-sm">{l.reading_date ? format(parseISO(l.reading_date), 'dd MMM yyyy') : '—'}</TableCell>
                      <TableCell className="text-right">{(l.electricity_kwh || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{(l.water_litres || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{l.electricity_cost ? `$${Number(l.electricity_cost).toLocaleString()}` : '—'}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{eRate !== null ? `$${eRate.toFixed(3)}` : '—'}</TableCell>
                      <TableCell className="text-right">{l.water_cost ? `$${Number(l.water_cost).toLocaleString()}` : '—'}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{wRate !== null ? `$${wRate.toFixed(2)}` : '—'}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">{co2e.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(l)}><Pencil className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(l)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <MobileCardGrid>
            {paginated.map(l => {
              const co2e = (l.electricity_kwh || 0) * ELECTRICITY_EF + ((l.water_litres || 0) / 1000) * WATER_EF;
              const eRate = elecRate(l);
              const wRate = waterRate(l);
              return (
                <MobileCard
                  key={l.id}
                  title={l.period}
                  subtitle={l.reading_date ? format(parseISO(l.reading_date), 'dd MMM yyyy') : ''}
                  accent={<span className="text-xs font-semibold text-primary">{co2e.toFixed(1)} kg CO₂e</span>}
                  actions={
                    <>
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => openEdit(l)}><Pencil className="w-3.5 h-3.5" /> Edit</Button>
                      <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-destructive" onClick={() => setDeleteTarget(l)}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
                    </>
                  }
                >
                  <MobileDetailRow label="Electricity" value={`${(l.electricity_kwh || 0).toLocaleString()} kWh`} />
                  <MobileDetailRow label="Water" value={`${(l.water_litres || 0).toLocaleString()} L`} />
                  {l.electricity_cost != null && <MobileDetailRow label="Elec cost" value={`$${Number(l.electricity_cost).toLocaleString()}${eRate !== null ? ` ($${eRate.toFixed(3)}/kWh)` : ''}`} />}
                  {l.water_cost != null && <MobileDetailRow label="Water cost" value={`$${Number(l.water_cost).toLocaleString()}${wRate !== null ? ` ($${wRate.toFixed(2)}/m³)` : ''}`} />}
                  {l.notes && <MobileDetailRow label="Notes" value={l.notes} />}
                </MobileCard>
              );
            })}
          </MobileCardGrid>
        </>
      )}

      {filtered.length > 0 && (
        <Pagination total={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Reading' : 'Add Utility Reading'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Period (YYYY-MM) *</Label>
              <Input value={form.period || ''} onChange={e => setField('period', e.target.value)} placeholder="2026-07" />
            </div>
            <div className="space-y-1.5">
              <Label>Reading Date *</Label>
              <Input type="date" value={form.reading_date || ''} onChange={e => setField('reading_date', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Electricity (kWh)</Label>
              <Input type="number" step="0.1" value={form.electricity_kwh ?? ''} onChange={e => setField('electricity_kwh', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Water (litres)</Label>
              <Input type="number" value={form.water_litres ?? ''} onChange={e => setField('water_litres', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Electricity Cost ($)</Label>
              <Input type="number" step="0.01" value={form.electricity_cost ?? ''} onChange={e => setField('electricity_cost', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Water Cost ($)</Label>
              <Input type="number" step="0.01" value={form.water_cost ?? ''} onChange={e => setField('water_cost', e.target.value)} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notes</Label>
              <Input value={form.notes || ''} onChange={e => setField('notes', e.target.value)} placeholder="e.g. winter spike, meter estimate…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={createMutation.isPending || updateMutation.isPending}>
              {editing ? 'Save Changes' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete reading?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the utility reading for "{deleteTarget?.period}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMutation.mutate(deleteTarget.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}