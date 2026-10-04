import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatCard from '@/components/shared/StatCard';
import { Plus, FileText, Eye, ExternalLink, Leaf, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { uploadFile } from '@/lib/uploadFile';

const BLANK = {
  purchase_date: new Date().toISOString().split('T')[0],
  provider: '', tonnes_co2e: '', cost: '', certificate_number: '', certificate_url: '', notes: '',
};

function CertificateViewer({ url, onClose }) {
  const isPdf = url?.toLowerCase().includes('.pdf');
  return (
    <Dialog open={!!url} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <FileText className="w-4 h-4" /> Offset Certificate
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden rounded-lg border border-border mt-2">
          {isPdf ? (
            <iframe src={url} className="w-full h-[70vh]" title="Offset Certificate" />
          ) : (
            <img src={url} alt="Offset Certificate" className="w-full h-auto max-h-[70vh] object-contain" />
          )}
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Open in new tab</Button>
          </a>
          <Button size="sm" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Weighs purchased carbon offset certificates against the transport
// emissions already computed elsewhere in this report (receiving/dispatch/
// warehouse_stock co2e_kg, in kg) for the same calendar year, so "how much
// have we offset" sits next to "how much did we actually emit" rather than
// as a standalone running total with no reference point.
export default function CarbonOffsetsPanel({ receiving = [], dispatches = [], warehouseStock = [] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [uploading, setUploading] = useState(false);
  const [viewingCert, setViewingCert] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());

  const { data: offsets = [], isLoading } = useQuery({
    queryKey: ['carbonOffsets'],
    queryFn: () => db.CarbonOffset.list('-purchase_date', 500),
  });

  const yearOf = (dateStr) => {
    if (!dateStr) return null;
    try { return parseISO(dateStr).getFullYear(); } catch { return null; }
  };

  const years = [...new Set(offsets.map(o => yearOf(o.purchase_date)).filter(Boolean))];
  if (!years.includes(new Date().getFullYear())) years.push(new Date().getFullYear());
  years.sort((a, b) => b - a);

  const yearOffsets = offsets.filter(o => yearOf(o.purchase_date) === year);
  const yearTonnesOffset = yearOffsets.reduce((s, o) => s + (o.tonnes_co2e || 0), 0);
  const yearCost = yearOffsets.reduce((s, o) => s + (o.cost || 0), 0);

  // Same inbound+outbound+3PL co2e_kg formula CarbonReport.jsx uses for its
  // YTD figure, generalised to any selected calendar year.
  const inYear = (dateStr) => yearOf(dateStr) === year;
  const emittedKg = receiving.filter(r => inYear(r.date_received)).reduce((s, r) => s + (r.co2e_kg || 0), 0)
    + dispatches.filter(d => inYear(d.dispatch_date)).reduce((s, d) => s + (d.co2e_kg || 0), 0)
    + warehouseStock.filter(w => inYear(w.transfer_date)).reduce((s, w) => s + (w.co2e_kg || 0), 0);
  const emittedTonnes = emittedKg / 1000;
  const netTonnes = emittedTonnes - yearTonnesOffset;
  const pctOffset = emittedTonnes > 0 ? Math.min(100, (yearTonnesOffset / emittedTonnes) * 100) : null;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, 'carbon-offsets');
      setForm(f => ({ ...f, certificate_url: url }));
      toast.success('Certificate uploaded');
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const reset = () => { setForm(BLANK); setOpen(false); };

  const createMutation = useMutation({
    mutationFn: () => db.CarbonOffset.create({
      purchase_date: form.purchase_date,
      provider: form.provider || undefined,
      tonnes_co2e: parseFloat(form.tonnes_co2e) || 0,
      cost: form.cost !== '' ? parseFloat(form.cost) : undefined,
      certificate_number: form.certificate_number || undefined,
      certificate_url: form.certificate_url || undefined,
      notes: form.notes || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['carbonOffsets'] });
      toast.success('Offset certificate added');
      reset();
    },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.CarbonOffset.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['carbonOffsets'] }); toast.success('Offset record deleted'); },
    onError: (e) => toast.error('Failed: ' + e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Carbon Offsets</h3>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onValueChange={v => setYear(parseInt(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5"><Plus className="w-3.5 h-3.5" /> Add Certificate</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label={`Offset in ${year}`} value={yearTonnesOffset.toFixed(2)} sub="tonnes CO2e purchased" icon={Leaf} color="text-emerald-600" bg="bg-emerald-50 border-emerald-200" />
        <StatCard label="Emitted" value={emittedTonnes.toFixed(2)} sub={`tonnes CO2e in ${year}`} icon={Leaf} color="text-amber-600" bg="bg-amber-50 border-amber-200" />
        <StatCard
          label="Net Position"
          value={`${netTonnes >= 0 ? '' : '−'}${Math.abs(netTonnes).toFixed(2)} t`}
          sub={netTonnes >= 0 ? 'still net emitting' : 'net carbon negative'}
          icon={Leaf}
          color={netTonnes >= 0 ? 'text-amber-600' : 'text-emerald-600'}
          bg={netTonnes >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}
        />
        <StatCard label="Spent on Offsets" value={yearCost > 0 ? `$${yearCost.toFixed(2)}` : '—'} sub={`${yearOffsets.length} certificate${yearOffsets.length !== 1 ? 's' : ''}`} icon={FileText} color="text-muted-foreground" bg="bg-card border-border" />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">% of {year} emissions offset</p>
          <p className="text-sm font-semibold">{pctOffset != null ? `${pctOffset.toFixed(1)}%` : '—'}</p>
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pctOffset || 0}%` }} />
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {emittedTonnes.toFixed(2)} t CO2e emitted in {year} vs {yearTonnesOffset.toFixed(2)} t offset.
        </p>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="text-right">Tonnes CO2e</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Certificate #</TableHead>
                <TableHead>Certificate</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
              ) : yearOffsets.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No offset certificates recorded for {year}</TableCell></TableRow>
              ) : yearOffsets.map(o => (
                <TableRow key={o.id}>
                  <TableCell className="text-sm">{o.purchase_date ? format(parseISO(o.purchase_date), 'dd MMM yyyy') : '—'}</TableCell>
                  <TableCell className="text-sm font-medium">{o.provider || '—'}</TableCell>
                  <TableCell className="text-sm text-right font-semibold text-emerald-600">{(o.tonnes_co2e || 0).toFixed(2)}</TableCell>
                  <TableCell className="text-sm text-right">{o.cost ? `$${o.cost.toFixed(2)}` : '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{o.certificate_number || '—'}</TableCell>
                  <TableCell>
                    {o.certificate_url ? (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setViewingCert(o.certificate_url)}><Eye className="w-3.5 h-3.5" /> View</Button>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" onClick={() => { if (confirm('Delete this offset record?')) deleteMutation.mutate(o.id); }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={v => !v && reset()}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-display">Add Carbon Offset Certificate</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div><Label>Purchase Date</Label><Input type="date" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} className="mt-1" /></div>
            <div><Label>Provider</Label><Input value={form.provider} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} placeholder="e.g. Ekos, Toitū Envirocare" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tonnes CO2e</Label><Input type="number" step="0.01" min="0" value={form.tonnes_co2e} onChange={e => setForm(f => ({ ...f, tonnes_co2e: e.target.value }))} className="mt-1" /></div>
              <div><Label>Cost ($)</Label><Input type="number" step="0.01" min="0" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} placeholder="Optional" className="mt-1" /></div>
            </div>
            <div><Label>Certificate Number</Label><Input value={form.certificate_number} onChange={e => setForm(f => ({ ...f, certificate_number: e.target.value }))} placeholder="Optional" className="mt-1" /></div>
            <div>
              <Label>Certificate File</Label>
              <Input type="file" accept="application/pdf,image/*" onChange={handleFile} disabled={uploading} className="mt-1" />
              {uploading && <p className="text-xs text-muted-foreground mt-1">Uploading…</p>}
              {form.certificate_url && !uploading && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><FileText className="w-3 h-3" /> Uploaded</p>
              )}
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" className="mt-1" /></div>
            <Button className="w-full" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || uploading || !form.purchase_date || !form.tonnes_co2e}>
              {createMutation.isPending ? 'Saving…' : 'Add Certificate'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CertificateViewer url={viewingCert} onClose={() => setViewingCert(null)} />
    </div>
  );
}
