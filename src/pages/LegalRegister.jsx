import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/api/supabaseClient';
import { uploadFile } from '@/lib/uploadFile';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Scale, Plus, Trash2, Paperclip, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import PageHeader from '@/components/shared/PageHeader';

const CATEGORIES = [
  { id: 'environmental', label: 'Environmental' },
  { id: 'health_safety', label: 'Health & Safety' },
  { id: 'excise_customs', label: 'Excise / Customs' },
  { id: 'building', label: 'Building' },
  { id: 'food_safety', label: 'Food Safety' },
  { id: 'employment', label: 'Employment' },
  { id: 'other', label: 'Other' },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.id, c.label]));

const STATUSES = ['compliant', 'non_compliant', 'under_review', 'not_yet_assessed'];
const STATUS_LABELS = { compliant: 'Compliant', non_compliant: 'Non-Compliant', under_review: 'Under Review', not_yet_assessed: 'Not Yet Assessed' };
const STATUS_COLORS = {
  compliant: 'bg-emerald-100 text-emerald-700',
  non_compliant: 'bg-red-100 text-red-700',
  under_review: 'bg-amber-100 text-amber-700',
  not_yet_assessed: 'bg-muted text-muted-foreground',
};

const BLANK_FORM = {
  title: '', category: 'environmental', issuing_authority: '', reference_number: '',
  requirement_summary: '', aspect_id: '', compliance_status: 'not_yet_assessed',
  expiry_date: '', last_reviewed_date: '', next_review_date: '', document_url: '',
  notes: '', owner: '',
};

const todayStr = () => new Date().toISOString().split('T')[0];

// A date badge that flags overdue (red) or due-within-30-days (amber)
// dates — same "make the thing that needs attention visually obvious"
// approach as the significance badges in AspectsRegister.jsx.
function DateFlag({ date, label }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const days = (new Date(date) - new Date(todayStr())) / 86400000;
  const cls = days < 0 ? 'text-red-600 font-semibold' : days <= 30 ? 'text-amber-600 font-medium' : 'text-foreground';
  return <span className={cls} title={label}>{date}{days < 0 && ' (overdue)'}</span>;
}

export default function LegalRegister() {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [uploading, setUploading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const { data: requirements = [], isLoading } = useQuery({
    queryKey: ['legalRequirements'],
    queryFn: () => db.LegalRequirement.list('-created_at', 5000),
  });

  const { data: aspects = [] } = useQuery({
    queryKey: ['environmentalAspects'],
    queryFn: () => db.EnvironmentalAspect.list('-created_at', 5000),
  });
  const aspectById = useMemo(() => new Map(aspects.map(a => [a.id, a])), [aspects]);

  const createMutation = useMutation({
    mutationFn: () => db.LegalRequirement.create({
      title: form.title.trim(),
      category: form.category,
      issuing_authority: form.issuing_authority.trim() || undefined,
      reference_number: form.reference_number.trim() || undefined,
      requirement_summary: form.requirement_summary.trim() || undefined,
      aspect_id: form.aspect_id || undefined,
      compliance_status: form.compliance_status,
      expiry_date: form.expiry_date || undefined,
      last_reviewed_date: form.last_reviewed_date || undefined,
      next_review_date: form.next_review_date || undefined,
      document_url: form.document_url || undefined,
      notes: form.notes.trim() || undefined,
      owner: form.owner.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['legalRequirements'] });
      setFormOpen(false);
      setForm(BLANK_FORM);
      toast.success('Requirement added to register');
    },
    onError: (e) => toast.error(e.message || 'Failed to add requirement'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => db.LegalRequirement.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['legalRequirements'] });
      toast.success('Requirement removed');
    },
    onError: (e) => toast.error(e.message || 'Failed to remove requirement'),
  });

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, 'legal-register');
      setForm(f => ({ ...f, document_url: url }));
      toast.success('Document attached');
    } catch (err) {
      toast.error('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const filtered = useMemo(
    () => categoryFilter === 'all' ? requirements : requirements.filter(r => r.category === categoryFilter),
    [requirements, categoryFilter]
  );

  const canSubmit = form.title.trim() && form.category;

  return (
    <div className="space-y-6">
      <PageHeader title="Legal & Compliance Register" subtitle="Regulations, consents, and licences the business must comply with" />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><Scale className="w-4 h-4" /> Register</CardTitle>
            <CardDescription>ISO 14001 requires periodic evaluation of compliance against each of these</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" className="gap-1.5" onClick={() => { setForm(BLANK_FORM); setFormOpen(true); }}>
              <Plus className="w-4 h-4" /> Add Requirement
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No legal requirements recorded yet — add the first one above.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requirement</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Authority / Ref</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead>Next review</TableHead>
                    <TableHead></TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium text-sm">
                        {r.title}
                        {r.aspect_id && aspectById.get(r.aspect_id) && (
                          <p className="text-xs text-muted-foreground font-normal">Linked: {aspectById.get(r.aspect_id).aspect}</p>
                        )}
                      </TableCell>
                      <TableCell><Badge variant="secondary" className="text-xs">{CATEGORY_LABEL[r.category] || r.category}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.issuing_authority || '—'}{r.reference_number ? ` · ${r.reference_number}` : ''}
                      </TableCell>
                      <TableCell><Badge className={STATUS_COLORS[r.compliance_status]}>{STATUS_LABELS[r.compliance_status]}</Badge></TableCell>
                      <TableCell className="text-sm"><DateFlag date={r.expiry_date} label="Expiry" /></TableCell>
                      <TableCell className="text-sm"><DateFlag date={r.next_review_date} label="Next review" /></TableCell>
                      <TableCell>
                        {r.document_url && (
                          <a href={r.document_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell>
                        <button onClick={() => deleteMutation.mutate(r.id)} className="text-muted-foreground hover:text-destructive transition-colors">
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
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-display">Add Legal Requirement</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Trade Waste Discharge Consent" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Compliance status</Label>
                <Select value={form.compliance_status} onValueChange={v => setForm(f => ({ ...f, compliance_status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUSES.map(s => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Issuing authority</Label>
                <Input value={form.issuing_authority} onChange={e => setForm(f => ({ ...f, issuing_authority: e.target.value }))} placeholder="e.g. Environment Southland" />
              </div>
              <div>
                <Label className="text-xs">Reference / licence #</Label>
                <Input value={form.reference_number} onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Requirement summary</Label>
              <Textarea rows={2} value={form.requirement_summary} onChange={e => setForm(f => ({ ...f, requirement_summary: e.target.value }))} placeholder="What this requires us to do" />
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
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Expiry date</Label>
                <Input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Last reviewed</Label>
                <Input type="date" value={form.last_reviewed_date} onChange={e => setForm(f => ({ ...f, last_reviewed_date: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Next review</Label>
                <Input type="date" value={form.next_review_date} onChange={e => setForm(f => ({ ...f, next_review_date: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Owner</Label>
                <Input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Evidence document</Label>
                <label className="cursor-pointer block">
                  <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
                  <div className="h-9 flex items-center gap-1.5 px-3 rounded-md border border-input text-sm text-muted-foreground hover:bg-accent transition-colors">
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                    {form.document_url ? 'Replace file' : uploading ? 'Uploading…' : 'Attach file'}
                  </div>
                </label>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <Button className="w-full" disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? 'Saving...' : 'Add Requirement'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
